import * as THREE from 'three';
import { bakeCityStatue, buildCityChampion, buildCityPlacement, cityMotionClips, copyForCity, faceCityFront } from '../io/city-champion.js';
import { downloadGLB } from '../io/gltf.js';
import { CITY_CHAMPION_HEIGHT } from '../../../city-common/model-scale.js';
import './motion-panel.css';

/** City export choices and a viewport preview of the same facing and target height. */
export class CityExportPanel {
  constructor(studio, toast, openMotion) {
    this.studio = studio; this.toast = toast; this.openMotion = openMotion;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'motion-dialog';
    this.dialog.setAttribute('aria-label', 'Export for AI City');
    this.dialog.innerHTML = `<h2>Export for AI City</h2><div class="motion-content">
      <p>Choose the front of your creation. The preview shows its City height and direction.</p>
      <label>Front direction<select data-front><option value="+z">Front (+Z)</option><option value="-z">Back (−Z)</option><option value="+x">Right (+X)</option><option value="-x">Left (−X)</option></select></label>
      <label>Champion movement<select data-mode><option value="studio">Studio animation — Idle, Walk, Run, Jump</option><option value="static">Solid object — move, turn and jump</option></select></label>
      <p data-hint></p><div class="motion-actions" aria-label="Preview actions"><button data-play="idle">Idle</button><button data-play="walk">Walk</button><button data-play="run">Run</button><button data-play="jump">Jump</button></div>
      <button data-edit type="button">Edit motion and body roles</button>
      </div><div class="motion-actions"><button data-place type="button">Place in my city</button><button data-champion type="button">Use as my Champion</button><button data-close type="button">Close</button></div><p class="motion-status" role="status"></p>`;
    document.body.append(this.dialog);
    this.status = this.dialog.querySelector('.motion-status');
    this.dialog.querySelector('[data-front]').onchange = () => this.refreshPreview();
    this.dialog.querySelector('[data-mode]').onchange = () => this.refreshPreview();
    this.dialog.querySelector('[data-close]').onclick = () => this.close();
    this.dialog.querySelector('[data-edit]').onclick = () => { this.close(); this.openMotion(); };
    this.dialog.querySelector('[data-place]').onclick = () => this.export('place');
    this.dialog.querySelector('[data-champion]').onclick = () => this.export('champion');
    for (const button of this.dialog.querySelectorAll('[data-play]')) button.onclick = () => this.play(button.dataset.play);
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
  }

  get forward() { return this.dialog.querySelector('[data-front]').value; }
  get mode() { return this.dialog.querySelector('[data-mode]').value; }
  open() {
    if (this.dialog.open) return;
    if (!this.studio.shapes.length) { this.toast.error('Add or generate a model first.'); return; }
    const rig = this.studio.rig;
    const animated = !!rig?.skinBones?.length;
    this.dialog.querySelector('[data-mode]').value = animated ? 'studio' : 'static';
    this.dialog.querySelector('[data-mode] option[value=studio]').disabled = !animated;
    const saved = rig?.graph.motion?.key === rig.graph.structureKey() ? rig.graph.motion.settings : null;
    this.dialog.querySelector('[data-front]').value = saved?.forward || '+z';
    this.originalVisible = this.studio.group.visible;
    this.studio.group.visible = false;
    this.dialog.showModal();
    this.refreshPreview();
  }

  refreshPreview() {
    this.preview?.removeFromParent(); this.preview = null; this.mixer = null; this.clips = null; this.playing = null;
    const rig = this.studio.rig;
    const animated = this.mode === 'studio';
    const hint = this.dialog.querySelector('[data-hint]');
    hint.textContent = animated ? 'Motion uses your editable Studio leg and body roles. A legless rig can waddle.' : 'Solid object movement: City moves and turns the whole model and gives it a physical jump.';
    this.dialog.querySelector('[data-edit]').hidden = !rig?.skinBones?.length;
    try {
      const copy = animated ? copyForCity(this.studio.group) : bakeCityStatue(this.studio.group, this.forward);
      if (animated) {
        this.clips = cityMotionClips(rig);
        copy.traverse(node => { if (node.isBone) node.quaternion.identity(); });
      }
      if (animated) faceCityFront(copy, this.forward);
      const box = new THREE.Box3().setFromObject(copy);
      if (box.isEmpty()) throw new Error('The creation has no visible body.');
      const centre = box.getCenter(new THREE.Vector3());
      copy.position.x -= centre.x; copy.position.y -= box.min.y; copy.position.z -= centre.z;
      const wrapper = new THREE.Group(); wrapper.name = 'City export preview';
      wrapper.scale.setScalar(CITY_CHAMPION_HEIGHT / Math.max(box.getSize(new THREE.Vector3()).y, .001));
      wrapper.add(copy);
      this.studio.group.parent.add(wrapper);
      this.preview = wrapper;
      this.mixer = new THREE.AnimationMixer(copy);
      this.status.textContent = 'Preview ready. Pick an action or download.';
    } catch (error) { this.status.textContent = error.message; }
  }

  play(name) {
    if (!this.preview) return;
    this.mixer.stopAllAction(); this.preview.position.y = 0;
    if (this.mode === 'studio' && this.clips) {
      const clip = this.clips.find(item => item.name.toLowerCase() === name);
      if (clip) this.mixer.clipAction(clip).reset().play();
    }
    this.playing = name; this.last = null; this.time = 0; this.status.textContent = `${name[0].toUpperCase() + name.slice(1)} preview`;
  }

  update(now) {
    if (!this.dialog.open || !this.playing || !this.preview) return;
    const dt = this.last === null ? 0 : Math.min(.1, (now - this.last) / 1000);
    this.last = now;
    this.mixer?.update(dt);
    if (this.mode === 'static') {
      this.time = (this.time || 0) + dt;
      this.preview.position.y = this.playing === 'jump' ? Math.max(0, Math.sin(this.time * 4)) * .45 : 0;
      if (this.playing === 'walk' || this.playing === 'run') this.preview.rotation.y += dt * (this.playing === 'run' ? 1.1 : .55);
    }
  }

  async export(destination) {
    const buttons = [...this.dialog.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);
    try {
      if (destination === 'place') {
        downloadGLB(await buildCityPlacement(this.studio.group, { forward: this.forward }), 'my-ai-city-creation.glb');
        this.status.textContent = 'Downloaded. In AI City, open My Models → Add a GLB model (12 MB limit), then place it.';
      } else {
        const key = 'passiona_studio_city_champion_v1';
        let identity;
        try { identity = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* start new identity */ }
        const championId = identity?.championId || globalThis.crypto?.randomUUID?.() || `studio-${Date.now()}`;
        const studioRevision = (identity?.studioRevision || 0) + 1;
        const { data } = await buildCityChampion(this.studio.group, this.studio.rig, { championId, studioRevision, forward: this.forward, animationMode: this.mode });
        downloadGLB(data, 'my-ai-city-champion.glb');
        localStorage.setItem(key, JSON.stringify({ championId, studioRevision }));
        this.status.textContent = 'Downloaded. In AI City, use the Champion upload at the entrance or wardrobe.';
      }
    } catch (error) { console.error(error); this.status.textContent = `Export failed: ${error.message}`; this.toast.error(this.status.textContent); }
    finally { buttons.forEach(button => button.disabled = false); }
  }

  close() {
    this.preview?.removeFromParent(); this.preview = null; this.mixer = null;
    this.studio.group.visible = this.originalVisible ?? true;
    this.dialog.close();
  }
}
