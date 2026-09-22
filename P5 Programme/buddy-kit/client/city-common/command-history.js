// Shared bounded editor history. Commands are deliberately session-only: the
// durable project state is saved separately, while undo/redo resets on reload
// or navigation between the planner and 3D editor.

export const DEFAULT_HISTORY_LIMIT = 50;

function validCommand(command) {
  return command && typeof command.execute === 'function'
    && typeof command.undo === 'function';
}

export function createCommandHistory({ limit = DEFAULT_HISTORY_LIMIT, onChange = () => {} } = {}) {
  const max = Math.max(1, Math.min(200, Math.floor(Number(limit) || DEFAULT_HISTORY_LIMIT)));
  const undoStack = [];
  const redoStack = [];

  const notify = () => onChange({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
  });

  function execute(command) {
    if (!validCommand(command)) return { ok: false, error: 'Invalid command.' };
    try {
      command.execute();
      undoStack.push(command);
      if (undoStack.length > max) undoStack.shift();
      redoStack.length = 0;
      notify();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  // Record a command whose effect has already been applied by an existing
  // editor. This avoids replacing live object references while finalising a
  // drag/keyboard gesture.
  function record(command) {
    if (!validCommand(command)) return { ok: false, error: 'Invalid command.' };
    undoStack.push(command);
    if (undoStack.length > max) undoStack.shift();
    redoStack.length = 0;
    notify();
    return { ok: true };
  }

  function undo() {
    const command = undoStack.pop();
    if (!command) return { ok: false, error: 'Nothing to undo.' };
    try {
      command.undo();
      redoStack.push(command);
      notify();
      return { ok: true };
    } catch (error) {
      undoStack.push(command);
      notify();
      return { ok: false, error: error?.message || String(error) };
    }
  }

  function redo() {
    const command = redoStack.pop();
    if (!command) return { ok: false, error: 'Nothing to redo.' };
    try {
      (command.redo || command.execute)();
      undoStack.push(command);
      notify();
      return { ok: true };
    } catch (error) {
      redoStack.push(command);
      notify();
      return { ok: false, error: error?.message || String(error) };
    }
  }

  function reset() {
    undoStack.length = 0;
    redoStack.length = 0;
    notify();
  }

  function clearRedo() {
    if (!redoStack.length) return;
    redoStack.length = 0;
    notify();
  }

  notify();
  return {
    execute, record, undo, redo, reset, clearRedo,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get size() { return undoStack.length; },
  };
}

// Adapter for existing editors that mutate an object after calling pushUndo().
// `capture()` records the before-state and finalises it lazily when the next
// capture/undo/redo occurs. This keeps a drag gesture as one history action.
export function createSnapshotHistory({ snapshot, restore, clone: cloneValue, equals, limit = DEFAULT_HISTORY_LIMIT, onChange = () => {} }) {
  let pending = null;
  let lastStatus = { canUndo: false, canRedo: false, undoCount: 0, redoCount: 0 };
  const publish = status => {
    lastStatus = status;
    onChange(pending === null ? status : { ...status, canUndo: true, undoCount: status.undoCount + 1 });
  };
  const history = createCommandHistory({ limit, onChange: publish });
  const clone = cloneValue || (value => typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)));

  function finalise() {
    if (pending === null) return;
    const before = pending;
    const after = clone(snapshot());
    pending = null;
    if ((equals && equals(before, after)) || (!equals && JSON.stringify(before) === JSON.stringify(after))) return;
    history.record({
      execute: () => restore(clone(after)),
      undo: () => restore(clone(before)),
      redo: () => restore(clone(after)),
    });
  }

  return {
    capture() { finalise(); history.clearRedo(); pending = clone(snapshot()); publish(lastStatus); },
    undo() { finalise(); return history.undo(); },
    redo() { finalise(); return history.redo(); },
    reset() { pending = null; history.reset(); },
    flush() { finalise(); },
    get canUndo() { finalise(); return history.canUndo; },
    get canRedo() { finalise(); return history.canRedo; },
    get size() { finalise(); return history.size; },
  };
}
