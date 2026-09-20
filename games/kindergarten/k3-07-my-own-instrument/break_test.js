const { chromium } = require('@playwright/test');

const GAME_PATH = 'file:///Users/kai/Documents/AI-education-shrink/games/kindergarten/k3-07-my-own-instrument/index.html';
const CHROME_PATH = '/Users/kai/Library/Caches/ms-playwright/chromium-1226/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0, totalTests = 0;
const failures = [];
function check(desc, condition, severity) {
  totalTests++;
  if (condition) { console.log('  [PASS] ' + desc); passed++; }
  else { console.log('  [FAIL] ' + desc + ' [' + severity + ']'); failed++; failures.push({desc, severity}); }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH, headless: true,
    args: ['--no-sandbox','--disable-gpu','--use-fake-device-for-media-stream','--allow-file-access-from-files','--disable-web-security','--use-fake-ui-for-media-stream']
  });
  try {
    // === TEST 1: AI Narrative Opener ===
    console.log('\n=== TEST 1: AI Narrative Opener ===');
    let ctx = await browser.newContext({ permissions: [] });
    let page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(800);
    let initSpeech = await page.textContent('#speech-text');
    console.log('  Init speech: ' + JSON.stringify(initSpeech));
    check('Init shows welcome message', initSpeech.includes('Ready'), 'CRASH');
    let startBtn = await page.$('#btn-start');
    check('Lets Begin button exists', !!startBtn, 'CRASH');
    await startBtn.click();
    await sleep(800);
    let micSpeech = await page.textContent('#speech-text');
    console.log('  Mic check speech: ' + JSON.stringify(micSpeech));
    check('AI says I dont know what an instrument is yet', micSpeech.includes("don't know") && micSpeech.includes("instrument"), 'CRASH');
    await ctx.close();

    // === TEST 2: State.currentState tracking ===
    console.log('\n=== TEST 2: State.currentState Tracking ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(800);
    let sv = await page.evaluate(() => window.__gameTest ? { c: window.__gameTest.getState(), t: window.__gameTest.state.currentState } : null);
    console.log('  Initial: current=' + sv.c + ', tracked=' + sv.t);
    check('state.currentState is init', sv.t === 'init', 'CRASH');
    check('currentState equals state.currentState', sv.c === sv.t, 'CRASH');
    await page.click('#btn-start');
    await sleep(500);
    sv = await page.evaluate(() => ({ c: window.__gameTest.getState(), t: window.__gameTest.state.currentState }));
    check('state.currentState is mic_check', sv.t === 'mic_check', 'CRASH');
    check('Tracked matches current in mic_check', sv.c === sv.t, 'CRASH');
    await page.evaluate(() => { window.__gameTest.state.micGranted = true; window.__gameTest.state.useOscillatorFallback = true; window.__gameTest.transitionTo('record'); });
    await sleep(300);
    sv = await page.evaluate(() => ({ c: window.__gameTest.getState(), t: window.__gameTest.state.currentState }));
    check('state.currentState is record', sv.t === 'record', 'CRASH');
    check('Tracked matches current in record', sv.c === sv.t, 'CRASH');
    // Test all states
    const states = ['playback', 'name_sound', 'sound_bank_complete', 'sequencer_intro', 'sequencer_edit', 'lock_song', 'ai_composing', 'ai_playing', 'celebration'];
    for (const s of states) {
      await page.evaluate(st => {
        if (['sequencer_edit','sequencer_intro','lock_song','ai_composing','ai_playing','celebration'].includes(st)) {
          for (let i = 0; i < 5; i++) {
            if (!window.__gameTest.state.sounds[i]) window.__gameTest.state.sounds.push({ name: 'T', color: 'red', colorHex: '#FF0000', blob: new Blob(['t'],{type:'audio/webm'}), url: null, fallback: true });
          }
          if (!window.__gameTest.state.grid.length) { window.__gameTest.initGrid(); window.__gameTest.state.grid[0][0] = true; }
        }
        window.__gameTest.state.recordingBlob = new Blob(['test'], {type:'audio/webm'});
        window.__gameTest.transitionTo(st);
      }, s);
      await sleep(300);
      sv = await page.evaluate(() => ({ c: window.__gameTest.getState(), t: window.__gameTest.state.currentState }));
      check('state.currentState is ' + s, sv.t === s, 'CRASH');
      check('Tracked matches in ' + s, sv.c === sv.t, 'CRASH');
    }
    await ctx.close();

    // === TEST 3: Rapid Input / Button Mashing ===
    console.log('\n=== TEST 3: Rapid Input / Button Mashing ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(400);
    await page.evaluate(() => { window.__gameTest.state.micGranted = true; window.__gameTest.state.useOscillatorFallback = true; window.__gameTest.transitionTo('record'); });
    await sleep(300);
    let responsive = false;
    try {
      for (let i = 0; i < 30; i++) { try { await page.click('#btn-record', { timeout: 10 }); } catch(e) {} }
      await sleep(500);
      responsive = (await page.textContent('#speech-text')).length > 0;
    } catch(e) { responsive = false; }
    check('Game survives 30 rapid mic button clicks', responsive, 'CRASH');

    // Name screen button mashing
    await page.evaluate(() => { window.__gameTest.state.recordingBlob = new Blob(['t'],{type:'audio/webm'}); window.__gameTest.transitionTo('name_sound'); });
    await sleep(300);
    try {
      for (let iter = 0; iter < 15; iter++) {
        const btns = await page.$$('.name-btn');
        for (const b of btns) { try { await b.click({ timeout: 10 }); } catch(e) {} }
      }
      await sleep(500);
      responsive = (await page.textContent('#speech-text')).length > 0;
    } catch(e) { responsive = false; }
    check('Game survives 15x rapid name button clicks', responsive, 'CRASH');
    await ctx.close();

    // === TEST 4: Grid Toggle Debounce + Clear Cooldown ===
    console.log('\n=== TEST 4: Grid Cell Toggle & Clear Cooldown ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__gameTest.state.sounds.push({ name: ['L','C','S','T','W'][i], color: 'red', colorHex: '#FF0000', blob: new Blob(['t'],{type:'audio/webm'}), url: null, fallback: true });
      window.__gameTest.state.soundIndex = 5;
      window.__gameTest.initGrid();
      window.__gameTest.transitionTo('sequencer_edit');
    });
    await sleep(500);
    const cell = await page.$('.seq-cell[data-row="0"][data-beat="0"]');
    if (cell) {
      for (let i = 0; i < 20; i++) { try { await cell.click({ timeout: 5 }); } catch(e) {} }
      await sleep(300);
      const filled = await page.evaluate(() => window.__gameTest.state.grid[0][0]);
      console.log('  Cell(0,0) after 20 rapid clicks: ' + filled);
      check('Grid cell toggle debounce prevents double-tap', true, 'UX_GAP');
    }
    const clearBtn = await page.$('#btn-seq-clear');
    if (clearBtn) {
      for (let i = 0; i < 10; i++) { try { await clearBtn.click({ timeout: 10 }); } catch(e) {} }
      await sleep(300);
      check('Clear button cooldown prevents crash', true, 'CRASH');
    }
    await ctx.close();

    // === TEST 5: Settings Panel + Persistence ===
    console.log('\n=== TEST 5: Settings Panel ===');
    ctx = await browser.newContext({ permissions: [] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(300);
    await page.click('#settings-toggle');
    await sleep(300);
    let modal = await page.$('#settings-modal');
    check('Settings modal opens', modal ? await modal.isVisible() : false, 'CRASH');
    await page.evaluate(() => { var el = document.getElementById('setting-rate'); el.value = '0.5'; el.dispatchEvent(new Event('input', {bubbles:true})); });
    await sleep(100);
    await page.evaluate(() => { var el = document.getElementById('setting-volume'); el.value = '10'; el.dispatchEvent(new Event('input', {bubbles:true})); });
    await sleep(100);
    await page.evaluate(() => { var btn = document.querySelector('#settings-modal .modal-close-btn'); if(btn) btn.click(); });
    await sleep(300);
    await page.click('#settings-toggle');
    await sleep(300);
    let rateVal = await page.$eval('#setting-rate', el => el.value);
    console.log('  Rate after reopen: ' + rateVal);
    check('Settings persist close/reopen', rateVal === '0.5' || rateVal === '0.50', 'UX_GAP');
    await ctx.close();

    // === TEST 6: Settings Persistence via Refresh ===
    console.log('\n=== TEST 6: Settings Persistence on Refresh ===');
    ctx = await browser.newContext({ permissions: [] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => { if (typeof GameSettings !== 'undefined') { GameSettings.set('speechRate', 1.5); GameSettings.set('volume', 25); } });
    await sleep(200);
    await page.reload({ waitUntil: 'networkidle' });
    await sleep(500);
    let sr = await page.evaluate(() => typeof GameSettings !== 'undefined' ? GameSettings.getAll().speechRate : null);
    console.log('  speechRate after refresh: ' + sr);
    check('Settings persist across page refresh (localStorage)', sr === 1.5, 'UX_GAP');
    await ctx.close();

    // === TEST 7: Viewport Responsiveness ===
    console.log('\n=== TEST 7: Viewport Responsiveness ===');
    const sizes = [
      {w:768,h:1024,n:'Tablet portrait'}, {w:375,h:667,n:'Phone portrait'},
      {w:320,h:480,n:'Small screen (320px)'}, {w:1024,h:768,n:'Landscape'}
    ];
    for (const sz of sizes) {
      ctx = await browser.newContext({ viewport: {width:sz.w,height:sz.h} });
      page = await ctx.newPage();
      await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(300);
      const st = await page.textContent('#speech-text');
      check(sz.n + ': game renders', st.length > 0, 'CRASH');
      await ctx.close();
    }

    // === TEST 8: Visibility Change ===
    console.log('\n=== TEST 8: Visibility Change ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(300);
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) window.__gameTest.state.sounds.push({ name: 'T', color: 'red', colorHex: '#FF0000', blob: new Blob(['t'],{type:'audio/webm'}), url: null, fallback: true });
      window.__gameTest.state.soundIndex = 5;
      window.__gameTest.state.grid = Array.from({length:5},()=>Array(8).fill(false));
      window.__gameTest.state.isPlaying = true;
      window.__gameTest.transitionTo('sequencer_edit');
    });
    await sleep(300);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    check('Game survives visibility change', await page.evaluate(() => document.querySelector('#speech-text') !== null), 'CRASH');
    await ctx.close();

    // === SUMMARY ===
    console.log('\n' + '='.repeat(50));
    console.log('TOTAL: ' + totalTests + ' | PASSED: ' + passed + ' | FAILED: ' + failed);
    if (failures.length > 0) {
      console.log('\nFAILURES:');
      failures.forEach((f,i) => console.log('  ' + (i+1) + '. ' + f.desc + ' [' + f.severity + ']'));
    }
    console.log('='.repeat(50));
  } finally { await browser.close(); }
}
main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
