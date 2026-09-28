export const ACTIVE_KEY = 'passiona_active_project_v1';
export const LEGACY_OWNER_KEY = 'passiona_legacy_owner_v1';
export const WORKSPACE_GENERATION_KEY = 'passiona_workspace_generation_v1';
let pageProject, pageGeneration;
export function activeProjectId() { return globalThis.localStorage?.getItem(ACTIVE_KEY) || null; }
export function bindWorkspace(id, { rebind = false } = {}) {
  if (!rebind) assertWorkspace();
  if (pageProject && pageProject !== id && !rebind) throw Error('Project changed in another tab. Reload before editing.');
  pageProject = id; pageGeneration = globalThis.localStorage?.getItem(WORKSPACE_GENERATION_KEY);
}
if (typeof window !== 'undefined') {
  const check = () => {
    try { assertWorkspace(); }
    catch {
      if (document.getElementById('project-rebind')) return;
      const dialog = document.createElement('dialog'); dialog.id = 'project-rebind';
      const message = document.createElement('p');
      message.textContent = 'Project changed in another tab. Reload to continue. / 專案已在另一分頁切換，請重新載入。';
      const button = document.createElement('button'); button.textContent = 'Reload / 重新載入';
      button.onclick = () => location.reload(); dialog.append(message, button);
      dialog.addEventListener('cancel', event => event.preventDefault());
      document.body.append(dialog); dialog.showModal();
    }
  };
  window.addEventListener('storage', check); window.addEventListener('focus', check);
}
export function assertWorkspace() {
  if (globalThis[Symbol.for('passiona.workspace.adapters')]?.suspended) throw Error('Workspace is suspended. Reload before editing.');
  if (pageProject && (activeProjectId() !== pageProject || globalThis.localStorage?.getItem(WORKSPACE_GENERATION_KEY) !== pageGeneration)) throw Error('Project changed in another tab. Reload before editing.');
}
export function projectAssetKey(key, projectId = activeProjectId()) { return projectId ? `${projectId}:${key}` : key; }
export function ownsLegacyAssets(projectId = activeProjectId()) {
  return !projectId || globalThis.localStorage?.getItem(LEGACY_OWNER_KEY) === projectId;
}
