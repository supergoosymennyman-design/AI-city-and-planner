import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { detectLegs, detectMotionRoles, motionClips } from '../rig/motion.js';
import { exportGLB } from '../io/gltf.js';
import './motion-panel.css';

/** Preview on a cloned document: playback never enters undo, autosave or the user's manual pose. */
export class MotionPanel {
  constructor(studio, toast) {
    this.studio = studio; this.toast = toast;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'motion-dialog';
    this.dialog.setAttribute('aria-labelledby', 'motion-title');
    this.dialog.innerHTML = `<h2 id="motion-title">Walk &amp; Jump</h2>
      <div class="motion-content">
      <p>Automatic motion preview. Check the suggested legs and adjust the direction. Walk stays in place.</p>
      <label>Motion<select data-field="motion" aria-label="Motion"><option>Walk</option><option>Jump</option></select></label>
      <label>Walk style<select data-field="gait" aria-label="Walk style"><option value="auto">Automatic</option><option value="waddle">Waddle — rock and shift weight</option><option value="step">Step — use legs</option></select></label>
      <label>Softness<input data-field="softness" type="range" min="0" max="1" step="0.05" value="0.65"></label>
      <label>Forward direction<select data-field="forward"><option value="+z">Front (+Z)</option><option value="-z">Back (−Z)</option><option value="+x">Right (+X)</option><option value="-x">Left (−X)</option></select></label>
      <label>Cycle duration (seconds)<input data-field="duration" type="number" min="0.4" max="4" step="0.1" value="1.2"></label>
      <label>Motion amount<input data-field="stride" type="range" min="1" max="60" value="25"></label>
      <details><summary>Body roles — edit automatic suggestions</summary><p>Check each knee joint; its parent is the hip. Confirm its foot and bend direction below. Knees stay 8–120° from straight; unreachable targets may slip instead of overextending. Play saves these animations for Export.</p><div class="motion-legs"></div></details>
      </div>
      <div class="motion-actions"><button data-action="play">Play</button><button data-action="stop">Stop</button><button data-action="export">Export Walk + Jump</button><button data-action="close">Close</button></div>
      <p class="motion-status" role="status"></p>`;
    document.body.appendChild(this.dialog);
    this.status = this.dialog.querySelector('.motion-status');
    this.dialog.addEventListener('cancel', (e) => { e.preventDefault(); if (!this.busy) this.close(); });
    this.dialog.querySelector('[data-action=close]').onclick = () => this.close();
    this.dialog.querySelector('[data-action=play]').onclick = () => this.play();
    this.dialog.querySelector('[data-action=stop]').onclick = () => this.stop();
    this.dialog.querySelector('[data-action=export]').onclick = () => this.export();
    this.dialog.addEventListener('change', () => { this.stop(); this.syncMotions(); this.status.textContent = 'Settings changed. Press Play to preview.'; });
  }

  open() {
    if (this.dialog.open) return;
    const rig = this.studio.rig;
    if (!rig?.skinBones.length) { this.toast.error('Give the model a skeleton and wait for bending to finish first.'); return; }
    this.rig = rig;
    this.studio.select(null); // outline userData contains editor object references, not cloneable model data
    const restore = rig.detachHelpers();
    try { this.preview = clone(this.studio.group); }
    catch (error) { this.toast.error(`Could not prepare animation preview: ${error.message}`); return; }
    finally { restore(); }
    // Outlines are editor decoration; retain the original pose only on the real document.
    const remove = [];
    this.preview.traverse((o) => { if (o.userData.isOutline || o.name === '__outline') remove.push(o); if (o.isBone) o.quaternion.identity(); });
    for (const o of remove) o.removeFromParent();
    this.preview.visible = true;
    this.visibleBefore = this.studio.group.visible;
    this.studio.group.visible = false;
    this.studio.group.parent.add(this.preview);
    this.mixer = new THREE.AnimationMixer(this.preview);
    this.last = null;
    const list = this.dialog.querySelector('.motion-legs'); list.replaceChildren();
    const saved = rig.graph.motion?.key === rig.graph.structureKey() ? rig.graph.motion.settings : null;
    if (saved) {
      this.mapping = { key: rig.graph.structureKey(), legs: saved.legs, roles: saved.roles, knees: saved.knees };
      for (const key of ['gait', 'softness', 'forward', 'stride', 'duration']) this.dialog.querySelector(`[data-field=${key}]`).value = saved[key];
    }
    const suggestions = new Set(this.mapping?.key === rig.graph.structureKey() ? this.mapping.legs : detectLegs(rig.graph, (id) => rig.worldOf(id)));
    const roles = this.mapping?.key === rig.graph.structureKey() ? this.mapping.roles : detectMotionRoles(rig);
    for (const joint of rig.graph.joints.filter((j) => j.parent !== null)) {
      const row = document.createElement('div'); row.className = 'motion-leg';
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.value = joint.id; input.checked = suggestions.has(joint.id);
      if (!rig.graph.children(joint.id).length) { input.checked = false; input.disabled = true; input.title = 'An end joint cannot be a knee: it needs a foot joint below it.'; }
      label.append(input, ` Use ${joint.id} as knee (hip ${joint.parent})`);
      const role = document.createElement('select'); role.dataset.joint = joint.id; role.setAttribute('aria-label', `Role for ${joint.id}`);
      for (const [value, title] of [['', 'Still'], ['head', 'Head'], ['arm', 'Arm'], ['tail', 'Tail']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = title; role.append(option);
      }
      role.value = roles?.[joint.id] || '';
      const button = document.createElement('button'); button.textContent = 'Highlight'; button.setAttribute('aria-label', `Highlight ${joint.id}`);
      button.onclick = () => this.highlight(joint.id);
      const options = document.createElement('div'); options.className = 'motion-knee-options';
      const footLabel = document.createElement('label'); footLabel.textContent = 'Foot / ankle joint';
      const foot = document.createElement('select'); foot.dataset.foot = joint.id; foot.setAttribute('aria-label', `Foot for knee ${joint.id}`);
      const descendants = rig.graph.children(joint.id);
      for (const id of descendants) { const option = document.createElement('option'); option.value = id; option.textContent = id; foot.append(option); }
      const lowest = [...descendants].sort((a, b) => rig.worldOf(a)[1] - rig.worldOf(b)[1])[0];
      let savedFoot = this.mapping?.key === rig.graph.structureKey() && this.mapping.knees?.[joint.id]?.foot;
      while (savedFoot && rig.graph.has(savedFoot) && !descendants.includes(savedFoot) && savedFoot !== joint.id) savedFoot = rig.graph.get(savedFoot).parent;
      foot.value = descendants.includes(savedFoot) ? savedFoot : lowest || '';
      footLabel.append(foot);
      const bendLabel = document.createElement('label'); bendLabel.textContent = 'Knee bends';
      const bend = document.createElement('select'); bend.dataset.bend = joint.id; bend.setAttribute('aria-label', `Bend direction for knee ${joint.id}`);
      for (const [value, title] of [['1', 'Rest-pose side'], ['-1', 'Opposite side']]) { const option = document.createElement('option'); option.value = value; option.textContent = title; bend.append(option); }
      bend.value = String(this.mapping?.key === rig.graph.structureKey() && this.mapping.knees?.[joint.id]?.bend || 1);
      bendLabel.append(bend); options.append(footLabel, bendLabel);
      row.append(label, role, button, options); list.append(row);
    }
    this.syncMotions();
    this.status.textContent = suggestions.size ? `${suggestions.size} leg segments suggested. Automatic uses Step; try Waddle for a different style. Review body roles.` : 'Automatic uses Waddle: shift weight and rock the body without legs. Review the suggested head and arm roles.';
    this.dialog.showModal();
  }

  settings() {
    const field = (name) => this.dialog.querySelector(`[data-field=${name}]`).value;
    const legs = [...this.dialog.querySelectorAll('.motion-legs input:checked')].map((i) => i.value);
    const knees = Object.fromEntries(legs.map((id) => [id, { foot: this.dialog.querySelector(`[data-foot=${id}]`).value, bend: Number(this.dialog.querySelector(`[data-bend=${id}]`).value), minFlex: 8, maxFlex: 120 }]));
    return { legs, knees, roles: Object.fromEntries([...this.dialog.querySelectorAll('[data-joint]')].filter((s) => s.value).map((s) => [s.dataset.joint, s.value])), gait: field('gait'), softness: Number(field('softness')), forward: field('forward'), stride: Number(field('stride')), duration: Number(field('duration')) };
  }

  syncMotions() {
    this.dialog.querySelector('[data-action=export]').textContent = 'Export Walk + Jump';
    for (const row of this.dialog.querySelectorAll('.motion-leg')) row.querySelector('.motion-knee-options').hidden = !row.querySelector('input').checked;
  }

  highlight(id) {
    this.stop();
    this.marker?.removeFromParent();
    if (this.marker) this.marker.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.marker = new THREE.Group();
    const joint = this.rig.graph.get(id);
    const foot = this.dialog.querySelector(`[data-foot=${id}]`)?.value;
    for (const [point, color] of [[joint.parent, '#ffc857'], [id, '#00e5ff'], [foot, '#79ee99']]) {
      if (!point) continue;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      marker.position.fromArray(this.rig.worldOf(point)); marker.renderOrder = 1000; this.marker.add(marker);
    }
    this.preview.add(this.marker);
    this.status.textContent = `Hip ${joint.parent}: gold. Knee ${id}: blue. Ankle ${foot || 'unassigned'}: green. Confirm the three points before playing.`;
  }

  play() {
    try {
      this.stop();
      const clips = motionClips(this.rig, this.settings());
      this.rig.graph.setMotion(this.settings()); this.studio.emit('changed');
      const kind = this.dialog.querySelector('[data-field=motion]').value;
      this.mixer.clipAction(clips.find((c) => c.name === kind)).play();
      this.playing = true; this.last = null;
      this.status.textContent = `${kind} playing on a preview copy. Stop restores the resting preview; Close returns to your original pose.`;
    } catch (error) { this.status.textContent = `Could not start animation: ${error.message}`; this.toast.error(this.status.textContent); }
  }

  stop() {
    this.playing = false; this.last = null;
    this.mixer?.stopAllAction();
    this.marker?.removeFromParent();
    if (this.status) this.status.textContent = 'Stopped. Preview returned to rest.';
  }

  /** Called from the render loop; time is in milliseconds. */
  update(now) {
    if (!this.dialog.open || !this.playing) return;
    if (this.last !== null) this.mixer.update(Math.min((now - this.last) / 1000, 0.1));
    this.last = now;
  }

  async export() {
    this.stop();
    this.busy = true;
    const controls = [...this.dialog.querySelectorAll('button, input, select')];
    controls.forEach((c) => { c.disabled = true; });
    try {
      const clips = motionClips(this.rig, this.settings());
      this.rig.graph.setMotion(this.settings()); this.studio.emit('changed');
      const graph = this.rig.graph.toJSON(); graph.pose = {};
      await exportGLB(this.preview, clips, 'my-model-animated.glb', graph);
      this.status.textContent = `Downloaded my-model-animated.glb with ${clips.map((clip) => clip.name).join(' and ')} animation.`;
    } catch (error) { this.status.textContent = `Export failed: ${error.message}`; }
    finally { this.busy = false; controls.forEach((c) => { c.disabled = false; }); for (const c of this.dialog.querySelectorAll('.motion-legs input')) c.disabled = !this.rig.graph.children(c.value).length; this.syncMotions(); }
  }

  close() {
    if (this.busy) return;
    if (this.rig) this.mapping = { key: this.rig.graph.structureKey(), legs: this.settings().legs, roles: this.settings().roles, knees: this.settings().knees };
    this.stop();
    this.mixer?.uncacheRoot(this.preview);
    this.preview?.removeFromParent();
    if (this.marker) { this.marker.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); this.marker = null; }
    this.studio.group.visible = this.visibleBefore ?? true;
    this.preview = null; this.mixer = null;
    this.dialog.close();
  }
}
