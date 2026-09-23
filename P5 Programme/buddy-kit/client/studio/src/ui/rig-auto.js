import { autoRigTargets, prepareAutoRig, parseAutoRig, applyAutoRig, disposeAutoRigResult } from '../rig/auto-rig-model.js';
import { requestAutoRig, autoRigEndpoint, AUTO_RIG_TIMEOUT } from '../rig/auto-rig-service.js';
import './rig-auto.css';

/** The selected-model auto-rig flow. A failed or cancelled request never edits the scene. */
export class RigAuto {
  constructor(studio, toast) {
    this.studio = studio;
    this.toast = toast;
    this.key = ''; // tab memory only; the development proxy uses its own cached CLI login
    this.runId = 0;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'rig-auto-dialog';
    this.dialog.setAttribute('aria-labelledby', 'rig-auto-title');
    this.dialog.innerHTML = `<h2 id="rig-auto-title">Give your model a skeleton</h2>
      <p class="rig-auto-target"></p>
      <p>A temporary light copy goes to your chosen rigging service. Your original detail stays here. You can adjust the joints afterwards, or Undo.</p>
      <fieldset class="rig-auto-connection"><legend>Connection settings</legend>
      <label>Rigging provider<select class="rig-auto-provider"><option value="hugging-face">Hugging Face · UniRig</option><option value="direct">Custom API</option></select></label>
      <label class="rig-auto-local" hidden><input type="checkbox" checked> Use my local Hugging Face login</label>
      <label class="rig-auto-key">Hugging Face access token (this tab only)
        <input type="password" autocomplete="off" spellcheck="false" placeholder="hf_…"></label>
      <div class="rig-auto-direct" hidden>
        <label>API endpoint URL<input class="rig-auto-endpoint" type="url" placeholder="https://your-server.example/rig" autocomplete="off" spellcheck="false"></label>
        <label>API key (optional, this tab only)<input class="rig-auto-api-key" type="password" autocomplete="off" spellcheck="false"></label>
        <p>Use an endpoint that accepts a GLB upload and returns a rigged GLB. API keys are sent as Bearer tokens. The server must allow browser access (CORS).</p>
      </div>
      <p class="rig-auto-settings-note">Connection settings stay in this tab until you reload. They are not saved with your model.</p>
      </fieldset>
      <p class="rig-auto-status" role="status" aria-live="polite"></p>
      <div class="rig-auto-actions"><button type="button" data-action="cancel">Close</button><button type="button" data-action="start">Make skeleton</button></div>`;
    document.body.appendChild(this.dialog);
    this.status = this.dialog.querySelector('.rig-auto-status');
    this.start = this.dialog.querySelector('[data-action=start]');
    this.cancelButton = this.dialog.querySelector('[data-action=cancel]');
    this.keyLabel = this.dialog.querySelector('.rig-auto-key');
    this.input = this.keyLabel.querySelector('input');
    this.connection = this.dialog.querySelector('fieldset');
    this.provider = this.dialog.querySelector('.rig-auto-provider');
    this.localLabel = this.dialog.querySelector('.rig-auto-local');
    this.useLocal = this.localLabel.querySelector('input');
    this.directFields = this.dialog.querySelector('.rig-auto-direct');
    this.endpoint = this.dialog.querySelector('.rig-auto-endpoint');
    this.apiKey = this.dialog.querySelector('.rig-auto-api-key');
    this.provider.addEventListener('change', () => this.updateConnection());
    this.useLocal.addEventListener('change', () => this.updateConnection());
    this.start.addEventListener('click', () => this.generate());
    this.cancelButton.addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.close(); });
  }

  updateConnection() {
    const direct = this.provider.value === 'direct';
    this.directFields.hidden = !direct;
    this.localLabel.hidden = direct || !this.local;
    this.keyLabel.hidden = direct || (this.local && this.useLocal.checked);
    this.status.textContent = direct ? 'Your selected model will be uploaded to this API endpoint.'
      : this.local && this.useLocal.checked ? 'Using your local Hugging Face login. Usually takes about 1–2 minutes.'
        : 'Enter your Hugging Face token to connect. Usually takes about 1–2 minutes.';
  }

  async open() {
    if (this.dialog.open) return;
    try { this.targets = autoRigTargets(this.studio); }
    catch (error) { this.toast.error(error.message); return; }
    const name = this.targets.length === 1 ? this.targets[0].name || 'model' : `${this.targets.length} selected parts`;
    const ignored = this.studio.shapes.filter((m) => !m.userData.isGear && !this.targets.includes(m)).length;
    this.dialog.querySelector('.rig-auto-target').textContent = `Rigging: ${name}${ignored ? ` · ${ignored} other shape${ignored === 1 ? '' : 's'} ignored` : ''}`;
    this.status.textContent = 'Checking connection…';
    this.start.disabled = true;
    this.keyLabel.hidden = true;
    this.input.disabled = false;
    this.connection.disabled = true;
    this.cancelButton.textContent = 'Close';
    this.dialog.showModal();
    const id = ++this.runId;
    this.local = false;
    try {
      const r = await fetch('/__studio/auto-rig', { signal: AbortSignal.timeout(2500) });
      if (r.ok && r.headers.get('content-type')?.includes('application/json')) this.local = !!(await r.json()).available;
    } catch { /* Published builds use the browser's own connection. */ }
    if (id !== this.runId || !this.dialog.open) return;
    this.connection.disabled = false;
    this.updateConnection();
    this.start.disabled = false;
    (this.provider.value === 'direct' ? this.endpoint : this.keyLabel.hidden ? this.start : this.input).focus();
  }

  close() {
    ++this.runId;
    this.abort?.abort();
    this.abort = null;
    this.dialog.close();
  }

  async generate() {
    if (this.start.disabled) return;
    this.key = this.input.value.trim();
    const provider = this.provider.value;
    const local = provider === 'hugging-face' && this.local && this.useLocal.checked;
    const token = provider === 'direct' ? this.apiKey.value.trim() : this.key;
    let endpoint;
    if (provider === 'direct') {
      try { endpoint = autoRigEndpoint(this.endpoint.value.trim()); }
      catch (error) { this.status.textContent = error.message; this.endpoint.focus(); return; }
    } else if (!local && !this.key.startsWith('hf_')) { this.status.textContent = 'Enter a Hugging Face access token first.'; this.input.focus(); return; }
    const id = ++this.runId;
    const controller = new AbortController();
    this.abort = controller;
    const timer = setTimeout(() => controller.abort(), AUTO_RIG_TIMEOUT);
    this.start.disabled = true;
    this.input.disabled = true;
    this.connection.disabled = true;
    this.cancelButton.textContent = 'Cancel auto-rig';
    this.status.textContent = 'Making a temporary light copy…';
    let result;
    try {
      // The targets captured on opening are deliberate; a changed selection must not retarget a job.
      if (this.targets.some((m) => !this.studio.shapes.includes(m))) throw new Error('The selected model changed. Close this panel and choose it again.');
      const capture = await prepareAutoRig(this.studio, this.targets);
      if (id !== this.runId || controller.signal.aborted) return;
      this.status.textContent = 'Building the skeleton… This usually takes about 1–2 minutes.';
      const file = new File([capture.bytes], 'model.glb', { type: 'model/gltf-binary' });
      let bytes;
      if (local) {
        const response = await fetch('/__studio/auto-rig', { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary', 'X-Studio-Auto-Rig': '1' }, body: file, signal: controller.signal });
        if (!response.ok) throw new Error((await response.text()).slice(0, 600) || 'Auto-rig failed.');
        bytes = await response.arrayBuffer();
      } else {
        bytes = await requestAutoRig(file, { provider, endpoint, token, signal: controller.signal });
      }
      if (id !== this.runId || controller.signal.aborted) return;
      this.status.textContent = 'Checking the skeleton…';
      result = await parseAutoRig(bytes);
      if (id !== this.runId || controller.signal.aborted) return;
      const count = applyAutoRig(this.studio, capture, result);
      this.studio.setMode('rig');
      this.toast.show(`${count} joints added. Working out the bending. Undo brings the previous skeleton back.`);
      this.dialog.close();
    } catch (error) {
      if (id === this.runId && this.dialog.open) {
        const message = String(error.message || error).replace(/hf_[A-Za-z0-9]+/g, '[redacted]').slice(0, 600).replace(/[.\s]+$/, '');
        this.status.textContent = controller.signal.aborted ? 'Auto-rig timed out. Your model is unchanged. Try again later.' : `${message}. Your model is unchanged.`;
      }
    } finally {
      clearTimeout(timer);
      disposeAutoRigResult(result);
      if (id === this.runId) { this.start.disabled = false; this.input.disabled = false; this.connection.disabled = false; this.cancelButton.textContent = 'Close'; this.abort = null; }
    }
  }
}
