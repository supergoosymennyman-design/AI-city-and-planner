/** Shared, text-only credits panel. PIN material never enters the champion or Buddy state.
 *
 * WALLET: this panel shows the SHARED envelope wallet when one is reachable — the
 * caller may pass an async `wallet()` provider, and a classic-script page with the
 * `window.PassionaLearning` shim is detected automatically. A teacher award is
 * likewise routed to the envelope via `awardTo` (or the shim's `teacherAward`); the
 * teacher PIN is still verified first, so the gate is unchanged. With no envelope,
 * every path falls back to the session economy exactly as before.
 */
(function(root) {
  function credits(session, { before = async () => {}, changed = () => {}, legacy = null, wallet = null, awardTo = null, importLegacy = null } = {}) {
    const shim = root && root.PassionaLearning ? root.PassionaLearning : null;
    const walletFn = typeof wallet === 'function' ? wallet : (typeof shim?.wallet === 'function' ? () => shim.wallet() : null);
    const awardFn = typeof awardTo === 'function' ? awardTo : (typeof shim?.teacherAward === 'function' ? (op) => shim.teacherAward(op) : null);
    const d = document.createElement('dialog'); d.className = 'champion-credits';
    d.style.cssText = 'max-width:560px;width:calc(100% - 40px);max-height:85vh;overflow:auto;border:2px solid #334155;border-radius:16px;padding:24px;background:#fff;color:#14213d;font:16px system-ui';
    const add = (tag, text, parent = d) => { const e = document.createElement(tag); e.textContent = text; parent.append(e); return e; };
    const button = (text, fn) => { const b = add('button', text); b.style.cssText = 'min-height:44px;margin:6px;padding:8px 14px'; b.onclick = fn; return b; };
    add('h2', 'Credits & Owned Gear');
    const info = add('p', ''), owned = add('p', ''), history = add('ol', ''), status = add('p', ''); status.setAttribute('role','status');
    add('p', 'Save a Champion File after working. Open that same file in Workshop or Studio on another device. Opening replaces the snapshot; it never adds credits.');
    // The wallet is authoritative when a provider exists; the session economy is the fallback.
    let paintToken = 0;
    function renderEconomy(economy) {
      const valid = economy && economy.version === 1;
      info.textContent = session.file.champion.name + ' · ' + (valid ? economy.balance + ' credits' : 'Economy read-only');
      owned.textContent = 'Owned catalog IDs: ' + (valid ? (economy.owned.join(', ') || 'None') : 'Read-only');
      history.textContent = '';
      for (const t of (valid ? economy.transactions : []).slice(-30).reverse()) add('li', `${t.title} · ${t.type} · ${t.amount} · ${t.at}`, history);
    }
    async function paint() {
      const token = ++paintToken;
      let economy = session.file.economy;
      if (walletFn) {
        try { const shared = await walletFn(); if (shared) economy = shared; }
        catch (e) { /* keep the session economy when the shared wallet cannot be read */ }
      }
      if (token !== paintToken) return;
      renderEconomy(economy);
    }
    const field = (title, type = 'text') => { const label = add('label', title + ' '); label.style.display = 'block'; const input = add('input','',label); input.type = type; input.style.cssText = 'min-height:40px;margin:6px;max-width:90%'; return input; };
    const pin = field('Teacher PIN', 'password'); pin.autocomplete = 'off'; pin.inputMode = 'numeric';
    const activity = field('Activity title'); activity.maxLength = 160;
    const amount = field('Award credits', 'number'); amount.min = '1'; amount.step = '1';
    let award = null, pending = false;
    button('Set up teacher PIN', async () => {
      try { await ChampionSession.setupPIN(pin.value); pin.value = ''; status.textContent = 'Teacher PIN set on this browser.'; } catch(e) { status.textContent = e.message; }
    });
    button('Award credits', async () => {
      if (pending) return; pending = true;
      try {
        await before();
        const title = activity.value.trim(), n = Number(amount.value), champion = session.file.champion;
        if (!title || !Number.isSafeInteger(n) || n <= 0) throw Error('Enter an activity and positive whole-number amount.');
        if (!award || award.title !== title || award.amount !== n || award.champion !== champion.id) award = { id: ChampionSession.id(), title, amount: n, champion: champion.id };
        if (!window.confirm(`Award ${n} credits to ${champion.name} for “${title}”?`)) return;
        if (awardFn) {
          // The shared envelope is authoritative: verify the teacher PIN, then
          // record the adjustment through the store's teacher path.
          await ChampionSession.verifyPIN(pin.value);
          const result = await awardFn(award);
          if (result && result.ok === false) throw Error(result.error || 'The award could not be saved.');
          pin.value = ''; changed(session.file); await paint();
          status.textContent = 'Award saved once to the shared wallet. Save your Champion File.';
        } else {
          await session.award(pin.value, award); pin.value = ''; changed(session.file); await paint();
          status.textContent = 'Award saved once. Save your Champion File.';
        }
        // Keep the same ID for a retry of the displayed activity. Explicitly clear to start another.
      } catch(e) { status.textContent = e.message; }
      finally { pending = false; }
    });
    button('Start another award', () => { if (!pending) { award = null; activity.value = ''; amount.value = ''; } });
    if (legacy) button('Import legacy owned gear once', async () => {
      try {
        await before(); const record = legacy();
        if (!record || record.version !== 1) throw Error('No supported legacy shop record.');
        if (!window.confirm(`Import legacy gear into ${session.file.champion.name}? Old coins stay archived.`)) return;
        if (typeof importLegacy === 'function') {
          const result = await importLegacy(record.owned || []);
          if (result && result.ok === false) throw Error(result.error || 'Legacy gear could not be imported.');
        } else {
          await session.transaction({ id: 'legacy-studio-ownership', type: 'legacy-ownership', amount: 0, title: 'Legacy Studio gear', owned: record.owned || [] });
        }
        changed(session.file); await paint();
      } catch(e) { status.textContent = e.message; }
    });
    button('Close', () => d.close());
    d.addEventListener('close', () => { pin.value = ''; d.remove(); });
    paint(); document.body.append(d); d.showModal();
  }
  root.ChampionControls = { credits };
})(typeof window !== 'undefined' ? window : globalThis);
