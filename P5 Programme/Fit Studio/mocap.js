/**
 * mocap.js — MOTION CAPTURE for the Animation Viewer: the champion mirrors the person in front
 * of the webcam, a take can be recorded, replayed as a normal clip, and downloaded as a clip GLB
 * that binds to the champion exactly like the Mixamo files (split-clip law: armature + curves,
 * no mesh, tracks bound by mixamorig node name).
 *
 * Sensor: toolbox/holistic.js (MediaPipe Holistic, self-hosted) — its `poseWorld` landmarks are
 * METRIC, hip-centred, camera-space: x = image-right, y = DOWN, z = depth where NEGATIVE is
 * toward the camera. Mapping into three.js as (x, -y, -z) makes the champion the user's MIRROR
 * by construction: the champion faces +Z (toward the viewer), the subject's left side lands on
 * +X, which is the side of the screen the subject sees their own left hand on. No index swaps.
 *
 * Retarget (v1, deliberately simple):
 *  - LIMB bones (upper/lower arms + legs) are DIRECTION-driven: at rig build the rest-pose world
 *    direction bone->childJoint is captured; each frame the shortest-arc rotation from that rest
 *    direction to the landmark segment direction is applied ON TOP of the rest orientation, and
 *    the local quaternion is solved against the parent's CURRENT world rotation. Shortest-arc
 *    means no roll control (wrist twist is ambiguous from 2 points anyway) — acceptable jank.
 *  - The CHEST (spine) and HEAD are BASIS-driven (up + left vectors -> full orientation), which
 *    is what lets torso yaw / head turns read. For a camera-facing upright subject the landmark
 *    basis is ~identity, so the rest reference IS the bone's rest world rotation — no landmark
 *    calibration step for the user.
 *  - Hips stay planted (no root motion v1): single-camera depth is the least trustworthy axis,
 *    and a sliding root reads as broken far faster than a planted one.
 *  - Smoothing: EMA on landmarks + slerp on the applied quaternion. A landmark below the
 *    visibility floor FREEZES its bone (last good pose) instead of spasming.
 *
 * Export: a bones-only clone of the champion's armature (REST pose TRS, gear/mesh excluded) is
 * exported with the recorded QuaternionKeyframeTracks — the same shape as clips/idle.glb, so the
 * viewer's own "Add clip GLBs" input (and every game's clip loader) accepts the download.
 *
 * Test surface: window.__mocap — testStart() builds the rig with NO camera, injectWorldPose()
 * feeds synthetic landmark frames, exportBase64() returns the baked GLB. Playwright drives the
 * whole capture->export->re-import loop through it; only the real-webcam feel needs a human.
 */

import * as THREE from 'three';
import { GLTFExporter } from './vendor/exporters/GLTFExporter.js';

// BlazePose-33 landmark indices (the subset the retarget reads).
const LM = {
  nose: 0, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28,
};

const VISIBILITY_FLOOR = 0.45; // below this a joint is untrusted and its bone freezes
const LANDMARK_EMA = 0.55;     // share of the NEW landmark per frame (higher = snappier)
const QUAT_SLERP = 0.45;       // share of the target quaternion applied per frame
const MAX_TAKE_S = 15;         // recording cap — keeps the exported clip under the 1MB clip law
// Basis-bone rotation clamps — a seated/partially-framed subject gives noisy hip landmarks, and
// an unclamped chest basis then folds the torso into itself ("the model is overlapping", owner
// 2026-08-11). Real human chest yaw/lean tops out well under these; beyond them it's noise.
const SPINE_MAX_RAD = 45 * Math.PI / 180;
const HEAD_MAX_RAD = 60 * Math.PI / 180;
// Landmark pairs for the preview overlay — torso box, limbs, ear-nose. Drawn on the NORMALIZED
// landmarks (image space); the container's CSS mirror flips video and overlay together.
const OVERLAY_LINKS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [0, 7], [0, 8],
];

/** MediaPipe world -> three.js world (the mirror map — see header). */
function toThree(p) { return new THREE.Vector3(p.x, -p.y, -p.z); }

function mid(a, b) { return a.clone().add(b).multiplyScalar(0.5); }

/** Orthonormal basis (xAxis=character-left, yAxis=up) -> quaternion. zAxis derived as x cross y
 * (right-handed; at rest x=(1,0,0), y=(0,1,0) gives z=(0,0,1) = facing the viewer). */
function basisQuat(xAxis, yAxis) {
  const x = xAxis.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, yAxis).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Cap a delta rotation at `maxRad` — the anti-fold guard for basis bones. Identity-slerp keeps
 * the axis and scales the angle, so a wild frame leans the chest as far as a human can, no
 * further, instead of folding the mesh through itself. */
function clampDelta(delta, maxRad) {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w)));
  if (angle <= maxRad || angle === 0) return delta;
  return new THREE.Quaternion().slerp(delta, maxRad / angle);
}

/**
 * @param {object} deps injected by main.js:
 *   THREE (unused — kept for parity), getModel(), withRestPose(fn), pauseClips(), resumeIdle(),
 *   addCapturedClip(clip), hud(msg)
 */
export function initMocap(deps) {
  const el = {
    section: document.getElementById('mocapSection'),
    btnMirror: document.getElementById('btnMocap'),
    btnRecord: document.getElementById('btnMocapRecord'),
    btnDownload: document.getElementById('btnMocapDownload'),
    clipInput: document.getElementById('mocapClipInput'),
    preview: document.getElementById('mocapPreview'),
    video: document.getElementById('mocapVideo'),
    overlay: document.getElementById('mocapOverlay'),
    hint: document.getElementById('mocapHint'),
  };
  if (!el.section || !el.btnMirror) return; // page variant without the section

  let holistic = null;      // HolisticManager instance (lazy)
  let stream = null;        // camera MediaStream
  let fileUrl = null;       // object URL of an uploaded source video (revoked on stop)
  let mirroring = false;    // the live loop is running (camera OR video file OR injection)
  let sourceDriven = false; // false in test mode (injection only)
  let rig = null;           // built by buildRig() — the retarget plan for the CURRENT model
  let smoothedLm = null;    // EMA state, three.js-space Vector3[] indexed like the landmarks
  let recording = null;     // { t0, frames: [{t, quats: Map<Bone, Quaternion>}] }
  let takeSeq = 0;
  let lastClip = null;      // the most recent baked clip (download target)

  /** Draw the model's own view of the person — dots + limbs on the NORMALIZED landmarks, over
   * the preview. Green = trusted joint, red = below the visibility floor (that bone is frozen).
   * This is the debugging window: when the champion misbehaves, this shows what it was told. */
  function drawOverlay(pose) {
    const c = el.overlay;
    if (!c || !el.video.videoWidth) return;
    const w = 220;
    const h = Math.round(w * el.video.videoHeight / el.video.videoWidth);
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!pose) return;
    const score = (p) => (p.score == null ? 1 : p.score);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(126, 231, 255, 0.85)';
    for (const [a, b] of OVERLAY_LINKS) {
      const pa = pose[a], pb = pose[b];
      if (!pa || !pb || score(pa) < VISIBILITY_FLOOR || score(pb) < VISIBILITY_FLOOR) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
    for (const p of pose) {
      if (!p) continue;
      ctx.fillStyle = score(p) >= VISIBILITY_FLOOR ? 'rgba(140, 255, 170, 0.95)' : 'rgba(255, 110, 110, 0.9)';
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------------------------- rig building

  function findBone(model, re) {
    let hit = null;
    model.traverse((o) => { if (!hit && o.isBone && re.test(o.name)) hit = o; });
    return hit;
  }

  /**
   * Snapshot everything the per-frame solve needs, at REST pose (withRestPose — the same baseline
   * gear fitting uses, so mocap agrees with every other consumer about what "rest" means).
   * Returns null (with an honest HUD line) when the skeleton is missing expected bones.
   */
  function buildRig() {
    const model = deps.getModel();
    if (!model) { deps.hud('Load the champion first — motion capture drives its skeleton.'); return null; }
    const spec = [
      // [key, boneRe, childJointRe, lmFrom, lmTo] — direction-driven limbs
      ['armL', /leftarm$/i, /leftforearm$/i, LM.shoulderL, LM.elbowL],
      ['foreL', /leftforearm$/i, /lefthand$/i, LM.elbowL, LM.wristL],
      ['armR', /rightarm$/i, /rightforearm$/i, LM.shoulderR, LM.elbowR],
      ['foreR', /rightforearm$/i, /righthand$/i, LM.elbowR, LM.wristR],
      ['upLegL', /leftupleg$/i, /leftleg$/i, LM.hipL, LM.kneeL],
      ['legL', /leftleg$/i, /leftfoot$/i, LM.kneeL, LM.ankleL],
      ['upLegR', /rightupleg$/i, /rightleg$/i, LM.hipR, LM.kneeR],
      ['legR', /rightleg$/i, /rightfoot$/i, LM.kneeR, LM.ankleR],
    ];
    const rigOut = { model, dir: [], spine: null, head: null, all: [] };
    let ok = true;
    deps.withRestPose(() => {
      model.updateMatrixWorld(true);
      for (const [key, boneRe, childRe, lmA, lmB] of spec) {
        const bone = findBone(model, boneRe);
        const child = findBone(model, childRe);
        if (!bone || !child) { ok = false; deps.hud('Skeleton is missing a ' + key + ' bone — cannot mirror.'); return; }
        const bonePos = bone.getWorldPosition(new THREE.Vector3());
        const childPos = child.getWorldPosition(new THREE.Vector3());
        rigOut.dir.push({
          bone,
          lmA, lmB,
          restDir: childPos.sub(bonePos).normalize(),
          restWorldQ: bone.getWorldQuaternion(new THREE.Quaternion()),
        });
        rigOut.all.push(bone);
      }
      // Chest: prefer the highest spine bone so shoulders lead; head for gaze. Both optional-ish
      // but present on every Mixamo rig.
      const spineBone = findBone(model, /spine2$/i) || findBone(model, /spine1$/i) || findBone(model, /spine$/i);
      const headBone = findBone(model, /head$/i);
      if (!spineBone || !headBone) { ok = false; deps.hud('Skeleton is missing spine/head — cannot mirror.'); return; }
      rigOut.spine = { bone: spineBone, restWorldQ: spineBone.getWorldQuaternion(new THREE.Quaternion()) };
      rigOut.head = { bone: headBone, restWorldQ: headBone.getWorldQuaternion(new THREE.Quaternion()) };
      rigOut.all.push(spineBone, headBone);
    });
    return ok ? rigOut : null;
  }

  // ------------------------------------------------------------------------------ per-frame solve

  /** landmarks: MediaPipe world array (33 x {x,y,z,score}). Applies one mirrored pose. */
  function applyPose(landmarks) {
    if (!rig || !landmarks || landmarks.length < 29) return;
    // EMA in three.js space; per-landmark, keeping the raw visibility score alongside.
    if (!smoothedLm) smoothedLm = [];
    const lm = [];
    for (let i = 0; i < landmarks.length; i++) {
      const v = toThree(landmarks[i]);
      if (smoothedLm[i]) v.lerp(smoothedLm[i], 1 - LANDMARK_EMA);
      smoothedLm[i] = v;
      lm[i] = { v, score: landmarks[i].score == null ? 1 : landmarks[i].score };
    }
    const seen = (i) => lm[i].score >= VISIBILITY_FLOOR;

    // Basis bones first (parents), so limb solves see the fresh torso orientation. Both deltas
    // are CLAMPED — see SPINE_MAX_RAD/HEAD_MAX_RAD.
    if (seen(LM.shoulderL) && seen(LM.shoulderR) && seen(LM.hipL) && seen(LM.hipR)) {
      const left = lm[LM.shoulderL].v.clone().sub(lm[LM.shoulderR].v);       // character-left (+X at rest)
      const up = mid(lm[LM.shoulderL].v, lm[LM.shoulderR].v).sub(mid(lm[LM.hipL].v, lm[LM.hipR].v));
      const delta = clampDelta(basisQuat(left, up), SPINE_MAX_RAD);
      applyWorldTarget(rig.spine.bone, delta.multiply(rig.spine.restWorldQ));
    }
    if (seen(LM.earL) && seen(LM.earR) && seen(LM.nose)) {
      const left = lm[LM.earL].v.clone().sub(lm[LM.earR].v);
      const fwd = lm[LM.nose].v.clone().sub(mid(lm[LM.earL].v, lm[LM.earR].v));
      const up = new THREE.Vector3().crossVectors(fwd, left).normalize(); // ear-line x forward = up-ish
      const delta = clampDelta(basisQuat(left, up), HEAD_MAX_RAD);
      applyWorldTarget(rig.head.bone, delta.multiply(rig.head.restWorldQ));
    }
    for (const d of rig.dir) {
      if (!seen(d.lmA) || !seen(d.lmB)) continue; // untrusted joint -> bone freezes at last good pose
      const target = lm[d.lmB].v.clone().sub(lm[d.lmA].v).normalize();
      const swing = new THREE.Quaternion().setFromUnitVectors(d.restDir, target);
      applyWorldTarget(d.bone, swing.multiply(d.restWorldQ));
    }
    rig.model.updateMatrixWorld(true);

    if (recording) {
      const t = (performance.now() - recording.t0) / 1000;
      const quats = new Map();
      rig.all.forEach((b) => quats.set(b, b.quaternion.clone()));
      recording.frames.push({ t, quats });
      el.btnRecord.textContent = 'Stop recording (' + t.toFixed(1) + 's)';
      if (t >= MAX_TAKE_S) stopRecording(); // clip-size law: a runaway take would blow the 1MB cap
    }
  }

  /** Solve the LOCAL quaternion that gives `worldQ`, against the parent's CURRENT world rotation
   * (upstream bones were just posed), and slerp toward it. */
  function applyWorldTarget(bone, worldQ) {
    bone.parent.updateWorldMatrix(true, false);
    const parentWorldQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const local = parentWorldQ.invert().multiply(worldQ);
    bone.quaternion.slerp(local, QUAT_SLERP);
  }

  // ----------------------------------------------------------------------------------- recording

  function startRecording() {
    if (!mirroring) return;
    recording = { t0: performance.now(), frames: [] };
    el.btnRecord.textContent = 'Stop recording (0.0s)';
    deps.hud('Recording — move! Up to ' + MAX_TAKE_S + 's.');
  }

  function stopRecording() {
    if (!recording) return;
    const frames = recording.frames;
    recording = null;
    el.btnRecord.textContent = 'Record a take';
    if (frames.length < 2) { deps.hud('Take too short — nothing captured.'); return; }
    takeSeq += 1;
    const name = 'MoCap ' + takeSeq;
    const tracks = [];
    for (const bone of rig.all) {
      const times = new Float32Array(frames.length);
      const values = new Float32Array(frames.length * 4);
      frames.forEach((f, i) => {
        times[i] = f.t;
        const q = f.quats.get(bone);
        values[i * 4] = q.x; values[i * 4 + 1] = q.y; values[i * 4 + 2] = q.z; values[i * 4 + 3] = q.w;
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, values));
    }
    lastClip = new THREE.AnimationClip(name, -1, tracks);
    // Mirroring and the mixer must not fight over the same bones: stop the mirror FIRST (it
    // restores rest + resumes Idle), THEN hand the take to the mixer — the replay crossfades in
    // from Idle like any clip. (stopMirror's own stopRecording call is a no-op: recording is
    // already null here.)
    if (mirroring) stopMirror();
    deps.addCapturedClip(lastClip); // becomes a normal clip button + plays right away
    el.btnDownload.hidden = false;
    el.btnDownload.textContent = 'Download "' + name + '" clip GLB';
    deps.hud('Take saved as "' + name + '" — replaying. Download it below.');
  }

  // ------------------------------------------------------------------------------------- export

  /** Bones-only clone of the armature at REST pose — the exported file must be a legal clip GLB
   * (mesh-free, no gear props riding along), and rest TRS keeps it byte-comparable to the
   * Blender-made clips. Gear groups hang UNDER bones, so the clone recurses BONE children only. */
  function buildExportSkeleton() {
    const model = deps.getModel();
    if (!model) return null;
    let rootBone = null;
    model.traverse((o) => { if (!rootBone && o.isBone && !(o.parent && o.parent.isBone)) rootBone = o; });
    if (!rootBone) return null;
    let restMap = null;
    const cloneBone = (b) => {
      const c = new THREE.Bone();
      c.name = b.name;
      const rest = restMap.get(b);
      c.position.copy(rest ? rest.p : b.position);
      c.quaternion.copy(rest ? rest.q : b.quaternion);
      c.scale.copy(rest ? rest.s : b.scale);
      b.children.forEach((ch) => { if (ch.isBone) c.add(cloneBone(ch)); });
      return c;
    };
    let out = null;
    deps.withRestPose(() => {
      // Rest map via the live rest restore: withRestPose has just put the skeleton AT rest, so
      // reading the bones' current TRS here IS the rest snapshot.
      restMap = new Map();
      model.traverse((o) => { if (o.isBone) restMap.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }); });
      // Preserve the chain ABOVE the root bone (the Armature node carries the Z-up conversion
      // rotation — dropping it would bake a 90-degree lie into the exported hierarchy).
      const chain = [];
      let n = rootBone.parent;
      while (n && n !== model) { chain.unshift(n); n = n.parent; }
      let parentClone = null;
      for (const link of chain) {
        const c = new THREE.Object3D();
        c.name = link.name;
        c.position.copy(link.position); c.quaternion.copy(link.quaternion); c.scale.copy(link.scale);
        if (parentClone) parentClone.add(c);
        else out = c;
        parentClone = c;
      }
      const bones = cloneBone(rootBone);
      if (parentClone) parentClone.add(bones);
      else out = bones;
    });
    return out;
  }

  function exportClipGLB(clip) {
    return new Promise((resolve, reject) => {
      const skel = buildExportSkeleton();
      if (!skel) { reject(new Error('no skeleton to export')); return; }
      new GLTFExporter().parse(skel, resolve, reject, { binary: true, animations: [clip] });
    });
  }

  function downloadLastTake() {
    if (!lastClip) return;
    exportClipGLB(lastClip).then((buffer) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
      a.download = lastClip.name.toLowerCase().replace(/\s+/g, '-') + '.glb';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      deps.hud('Saved ' + a.download + ' — it loads in this viewer (Add clip GLBs) like any clip.');
    }).catch((err) => deps.hud('Clip export failed: ' + (err && err.message ? err.message : err)));
  }

  // ---------------------------------------------------------------------- capture loop (2 sources)

  /** Shared readiness gate: skeleton rig + pose model. Honest message on every failure path. */
  async function ensureReadyForCapture() {
    rig = buildRig();
    if (!rig) return false;
    if (!window.HolisticManager) { deps.hud('Pose model script missing (toolbox/holistic.js) — cannot capture.'); return false; }
    holistic = holistic || new window.HolisticManager();
    deps.hud('Loading pose model…');
    const ready = await holistic.probe();
    if (!ready) { deps.hud('Pose model failed to load — motion capture is off. (Model files under toolbox/assets/holistic/.)'); return false; }
    return true;
  }

  /** LIVE mirror from the webcam. */
  let cameraStarting = false; // one pending camera request at a time — a hung prompt must not stack
  async function startMirror() {
    if (cameraStarting) return; // repeated clicks while the prompt is pending: ignore
    if (!(await ensureReadyForCapture())) return;
    cameraStarting = true;
    deps.hud('Starting camera…');
    try {
      // getUserMedia can hang forever on some devices/OSes (no prompt, no error) — race it
      // against a timeout so the button never dies silently at "Starting camera…".
      let camTimer = null;
      const camTimeout = new Promise((_, reject) => {
        camTimer = setTimeout(
          () => reject(Object.assign(new Error('camera timed out'), { name: 'TimeoutError' })),
          15000
        );
      });
      try {
        stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false }),
          camTimeout,
        ]);
      } finally {
        clearTimeout(camTimer);
      }
    } catch (err) {
      // Honest block, never a silent dead button (crash-proof I/O law).
      deps.hud(err && err.name === 'TimeoutError'
        ? 'Camera took too long to start — check it is not busy in another app, then try again.'
        : 'Camera unavailable (' + (err && err.name ? err.name : err) + ') — motion capture needs it.');
      cameraStarting = false;
      return;
    }
    cameraStarting = false;
    el.video.srcObject = stream;
    runCaptureLoop({ live: true });
    deps.hud('Mirroring — stand back so the camera sees your whole body.');
  }

  /** OFFLINE mocap from an uploaded video file: the clip plays in the preview, the same retarget
   * runs on it, and the take records automatically start-to-end (or to the cap). */
  async function captureFromVideoFile(file) {
    if (!file) return;
    if (mirroring) stopMirror();
    if (!(await ensureReadyForCapture())) return;
    fileUrl = URL.createObjectURL(file);
    el.video.srcObject = null;
    el.video.src = fileUrl;
    el.video.loop = false;
    // A file the browser cannot demux errors the <video> element instead of ever "ending" —
    // without this the loop spun on "No person visible in the video yet…" forever. Stop and say
    // so plainly; the loop's own el.video.error check covers the window before this fires.
    el.video.addEventListener('error', () => {
      if (!mirroring) return;
      stopMirror();
      deps.hud("Couldn't read " + file.name + ' — pick a normal video file (mp4/webm).');
    }, { once: true });
    runCaptureLoop({ live: false, sourceName: file.name });
    deps.hud('Capturing from ' + file.name + '…');
  }

  /** One loop for both sources — it reads whatever el.video is showing. File mode auto-records
   * and bakes when the video ends; live mode records only when the user asks. */
  function runCaptureLoop(opts) {
    mirroring = true;
    sourceDriven = true;
    beginMirrorUI();
    el.preview.hidden = false;
    el.video.play().catch(() => { /* autoplay quirks — the loop tolerates a late start */ });
    if (!opts.live) startRecording();
    (async () => {
      let misses = 0;
      while (mirroring && sourceDriven) {
        // el.video.error covers files the browser could not demux (the 'error' listener above
        // stops the mirror, but break here too so the loop never spins on a dead source).
        if (!opts.live && (el.video.ended || el.video.error)) break;
        const res = await holistic.detect(el.video);
        if (!mirroring) break;
        if (res) drawOverlay(res.pose);
        // WORLD landmarks ONLY. Falling back to normalized image coords once seemed harmless —
        // but their aspect-distorted axes and image-scaled z fold the champion through itself
        // (the "model is overlapping" report). Missing world pose = say so, drive nothing.
        if (res && res.poseWorld) { misses = 0; applyPose(res.poseWorld); }
        else if (++misses === 30) deps.hud(opts.live ? 'No one in frame — step back into view.' : 'No person visible in the video yet…');
        await new Promise((r) => setTimeout(r, 33)); // ~30Hz budget; detect itself is the long pole
      }
      if (!opts.live && mirroring) {
        // The file ran out: bake what was captured, or admit nothing was.
        if (recording && recording.frames.length >= 2) {
          stopRecording();
        } else {
          recording = null;
          stopMirror();
          deps.hud('No person found in ' + opts.sourceName + ' — nothing captured.');
        }
      }
    })();
  }

  function beginMirrorUI() {
    deps.pauseClips(); // clips and mocap must not fight over the same bones
    el.btnMirror.textContent = 'Stop mirroring';
    el.btnMirror.classList.add('hud__btn--active');
    el.btnRecord.hidden = false;
    el.btnRecord.textContent = 'Record a take';
  }

  function stopMirror() {
    mirroring = false;
    sourceDriven = false;
    if (recording) stopRecording();
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    el.video.pause();
    el.video.srcObject = null;
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; el.video.removeAttribute('src'); el.video.load(); }
    el.preview.hidden = true;
    el.btnMirror.textContent = 'Mirror me (camera)';
    el.btnMirror.classList.remove('hud__btn--active');
    el.btnRecord.hidden = true;
    smoothedLm = null;
    // Back to rest, then back to Idle — same recover path a champion swap uses.
    if (rig) deps.withRestPose(() => {});
    deps.resumeIdle();
    deps.hud('');
  }

  el.btnMirror.addEventListener('click', () => (mirroring ? stopMirror() : startMirror()));
  el.btnRecord.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
  el.btnDownload.addEventListener('click', downloadLastTake);
  if (el.clipInput) {
    el.clipInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      captureFromVideoFile(f);
      el.clipInput.value = '';
    });
  }

  // ------------------------------------------------------------------------------- test surface

  window.__mocap = {
    /** Build the rig and enter mirror mode WITHOUT any camera — injection drives it. */
    testStart() {
      rig = buildRig();
      if (!rig) return false;
      mirroring = true;
      sourceDriven = false;
      beginMirrorUI();
      return true;
    },
    injectWorldPose(landmarks) { if (mirroring) applyPose(landmarks); },
    /** World-space direction bone->child, for harness assertions (e.g. 'leftarm$','leftforearm$'). */
    probeBone(boneReSrc, childReSrc) {
      if (!rig) return null;
      const b = findBone(rig.model, new RegExp(boneReSrc, 'i'));
      const c = findBone(rig.model, new RegExp(childReSrc, 'i'));
      if (!b || !c) return null;
      rig.model.updateMatrixWorld(true);
      const bp = b.getWorldPosition(new THREE.Vector3());
      const cp = c.getWorldPosition(new THREE.Vector3());
      return cp.sub(bp).normalize().toArray().map((v) => +v.toFixed(3));
    },
    startRecording, stopRecording, stopMirror,
    get state() { return { mirroring, recording: !!recording, takes: takeSeq, clip: lastClip ? lastClip.name : null }; },
    exportBase64() {
      if (!lastClip) return Promise.reject(new Error('no take'));
      return exportClipGLB(lastClip).then((buf) => {
        let s = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
      });
    },
  };
}
