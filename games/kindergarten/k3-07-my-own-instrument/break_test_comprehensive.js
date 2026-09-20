const { chromium } = require('@playwright/test');

const GAME_PATH = 'file:///Users/kai/Documents/AI-education-shrink/games/kindergarten/k3-07-my-own-instrument/index.html';
const CHROME_PATH = '/Users/kai/Library/Caches/ms-playwright/chromium-1226/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MACOS/Google Chrome for Testing';

const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0, minor = 0, deadEnd = 0, crash = 0, misleading = 0, silentFail = 0;
let totalTests = 0;
const details = [];

function result(category, scenario, verdict, detail) {
  totalTests++;
  console.log(`  [${verdict}] ${category}: ${scenario}`);
  if (verdict === 'PASS') passed++;
  else if (verdict === 'MINOR') minor++;
  else if (verdict === 'DEAD_END') deadEnd++;
  else if (verdict === 'CRASH') crash++;
  else if (verdict === 'MISLEADING') misleading++;
  else if (verdict === 'SILENT_FAIL') silentFail++;
  details.push({ category, scenario, verdict, detail });
}

function checkAlive(page) {
  return page.evaluate(() => {
    const app = document.getElementById('app');
    const speech = document.getElementById('speech-text');
    return !!app && !!speech && speech.textContent.length > 0;
  });
}

async function setupPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    permissions: opts.noMic ? [] : ['microphone'],
    viewport: opts.viewport || { width: 768, height: 1024 },
    ...(opts.extra || {})
  });
  const page = await ctx.newPage();
  await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
  await sleep(600);
  return { ctx, page };
}

async function fullFallbackFlow(page) {
  for (let i = 0; i < 5; i++) {
    await page.click('#btn-record', { timeout: 1000 }).catch(() => {});
    await sleep(4000);
    let state = await page.evaluate(() => window.__gameTest.getState());
    if (state === 'playback') {
      await page.click('#btn-keep', { timeout: 1000 }).catch(() => {});
      await sleep(300);
    }
    state = await page.evaluate(() => window.__gameTest.getState());
    if (state === 'name_sound') {
      const nameBtns = await page.$$('.name-btn');
      if (nameBtns.length > 0) {
        await nameBtns[0].click();
        await sleep(300);
      }
    }
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH, headless: true,
    args: ['--no-sandbox','--disable-gpu','--use-fake-device-for-media-stream','--allow-file-access-from-files','--disable-web-security','--use-fake-ui-for-media-stream']
  });

  try {
    // ===================================================================
    // SCENARIO 1: RAPID BUTTON MASHING
    // ===================================================================
    console.log('\n========== SCENARIO 1: RAPID BUTTON MASHING ==========');

    console.log('\n--- 1a. Rapid mic button (20x) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(300);
      for (let i = 0; i < 20; i++) {
        try { await page.click('#btn-record', { timeout: 5 }); } catch(e) {}
      }
      await sleep(500);
      const alive = await checkAlive(page);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('1a', '20 rapid mic clicks', alive ? 'PASS' : 'CRASH', 'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 1b. Rapid name button clicks (15x) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await fullFallbackFlow(page);
      await page.evaluate(() => {
        window.__gameTest.state.recordingBlob = new Blob(['test'], {type:'audio/webm'});
        window.__gameTest.state.soundIndex = 0;
        window.__gameTest.transitionTo('name_sound');
      });
      await sleep(300);
      for (let iter = 0; iter < 15; iter++) {
        const btns = await page.$$('.name-btn');
        for (const b of btns) { try { await b.click({ timeout: 5 }); } catch(e) {} }
      }
      await sleep(500);
      const alive = await checkAlive(page);
      result('1b', '15x rapid name button mashing', alive ? 'PASS' : 'CRASH', '');
      await ctx.close();
    }

    console.log('\n--- 1c. Rapid grid cell toggle (20x) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(300);
      const cell = await page.$('.seq-cell[data-row="0"][data-beat="0"]');
      for (let i = 0; i < 20; i++) {
        try { await cell.click({ timeout: 5 }); } catch(e) {}
      }
      await sleep(300);
      const alive = await checkAlive(page);
      const filled = await page.evaluate(() => window.__gameTest.state.grid[0][0]);
      result('1c', '20 rapid grid cell toggles', alive ? 'PASS' : 'CRASH', 'cell_filled=' + filled);
      await ctx.close();
    }

    console.log('\n--- 1d. Rapid clear button (10x) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.state.grid[0][0] = true;
        window.__gameTest.state.grid[0][1] = true;
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(300);
      for (let i = 0; i < 10; i++) {
        try { await page.click('#btn-seq-clear', { timeout: 10 }); } catch(e) {}
      }
      await sleep(300);
      const alive = await checkAlive(page);
      result('1d', '10 rapid clear button clicks', alive ? 'PASS' : 'CRASH', '');
      await ctx.close();
    }

    console.log('\n--- 1e. Rapid play button (10x with empty grid) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(300);
      for (let i = 0; i < 10; i++) {
        try { await page.click('#btn-seq-play', { timeout: 10 }); } catch(e) {}
      }
      await sleep(500);
      const alive = await checkAlive(page);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('1e', '10 rapid play clicks with empty grid', alive ? 'PASS' : 'CRASH', 'state=' + state);
      await ctx.close();
    }

    // ===================================================================
    // SCENARIO 2: SILENCE SIMULATION
    // ===================================================================
    console.log('\n========== SCENARIO 2: SILENCE SIMULATION ==========');

    console.log('\n--- 2a. Idle timer on record screen (10s) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(300);
      await sleep(11000);
      const alive = await checkAlive(page);
      const text = await page.textContent('#speech-text');
      const hasPrompt = text.includes('Tap') || text.includes('button') || text.includes('make');
      result('2a', 'Idle prompt after ~10s record screen', alive && hasPrompt ? 'PASS' : 'MINOR',
        'text="' + text.substring(0, 80) + '"');
      await ctx.close();
    }

    console.log('\n--- 2b. Auto-advance from record after prolonged idle ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.state.idlePromptCount = 0;
        window.__gameTest.transitionTo('record');
      });
      await sleep(300);
      for (let i = 0; i < 10; i++) {
        const s = await page.evaluate(() => window.__gameTest.getState());
        if (s !== 'record') break;
        await sleep(5000);
      }
      const state = await page.evaluate(() => window.__gameTest.getState());
      const alive = await checkAlive(page);
      result('2b', 'Auto-advance from record after idle',
        state === 'playback' ? 'PASS' : state === 'record' && alive ? 'MINOR' : 'DEAD_END',
        'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 2c. Idle timer on name screen ---');
    {
      const { ctx, page } = await setupPage(browser);
      await fullFallbackFlow(page);
      // Force to name_sound
      await page.evaluate(() => {
        window.__gameTest.state.soundIndex = 0;
        window.__gameTest.state.recordingBlob = new Blob(['test'], {type:'audio/webm'});
        window.__gameTest.transitionTo('name_sound');
      });
      await sleep(300);
      await sleep(11000);
      const alive = await checkAlive(page);
      const text = await page.textContent('#speech-text');
      const hasPrompt = text.includes('name') || text.includes('Tap') || text.includes('pick');
      result('2c', 'Idle prompt on name screen after 10s', alive && hasPrompt ? 'PASS' : 'MINOR',
        'text="' + text.substring(0, 80) + '"');
      await ctx.close();
    }

    // ===================================================================
    // SCENARIO 3: OUT-OF-ORDER
    // ===================================================================
    console.log('\n========== SCENARIO 3: OUT-OF-ORDER ==========');

    console.log('\n--- 3a. Open settings during recording ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(200);
      await page.click('#settings-toggle');
      await sleep(300);
      const modalVisible = await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        return m ? m.style.display !== 'none' : false;
      });
      result('3a', 'Settings open during recording', modalVisible ? 'PASS' : 'MINOR', '');
      // Close settings
      await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.style.display = 'none';
      });
      await sleep(200);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('3a.2', 'Game state preserved after settings', state === 'record' ? 'PASS' : 'CRASH',
        'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 3b. Force sequencer without sounds ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.sounds = [];
        window.__gameTest.state.soundIndex = 0;
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(400);
      const alive = await checkAlive(page);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('3b', 'Force sequencer without sounds', alive ? 'PASS' : 'CRASH', 'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 3c. Jump back to record from sequencer ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(300);
      await page.evaluate(() => {
        window.__gameTest.state.soundIndex = 2;
        window.__gameTest.transitionTo('record');
      });
      await sleep(500);
      const alive = await checkAlive(page);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('3c', 'Back to record from sequencer',
        alive && state === 'record' ? 'PASS' : 'CRASH', 'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 3d. Lock song (force playthrough count) ---');
    {
      const { ctx, page } = await setupPage(browser);
      const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
      await page.evaluate((names) => {
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.state.grid[0][0] = true;
        window.__gameTest.state.grid[0][4] = true;
        window.__gameTest.state.totalPlaythroughs = 2;
        window.__gameTest.transitionTo('sequencer_edit');
      }, names);
      await sleep(300);
      const lockBtn = await page.$('#btn-lock');
      if (lockBtn) {
        await lockBtn.click();
        await sleep(500);
        const state = await page.evaluate(() => window.__gameTest.getState());
        const alive = await checkAlive(page);
        result('3d', 'Lock song after forced playthroughs',
          alive && state === 'lock_song' ? 'PASS' : 'MINOR', 'state=' + state);
      } else {
        result('3d', 'Lock song after forced playthroughs', 'MINOR', 'button not found');
      }
      await ctx.close();
    }

    console.log('\n--- 3e. Settings during AI composing ---');
    {
      const { ctx, page } = await setupPage(browser);
      const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
      await page.evaluate((names) => {
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.state.grid[0][0] = true;
        window.__gameTest.transitionTo('lock_song');
      }, names);
      await sleep(100);
      await page.evaluate(() => window.__gameTest.transitionTo('ai_composing'));
      await sleep(100);
      await page.click('#settings-toggle');
      await sleep(300);
      const modalVisible = await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        return m ? m.style.display !== 'none' : false;
      });
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('3e', 'Settings during AI composing', modalVisible && state ? 'PASS' : 'MINOR',
        'modal=' + modalVisible + ' state=' + state);
      await ctx.close();
    }

    // ===================================================================
    // SCENARIO 4: MIC DENIAL / FALLBACK
    // ===================================================================
    console.log('\n========== SCENARIO 4: MIC DENIAL / FALLBACK ==========');

    console.log('\n--- 4a. Mic check AI opener ---');
    {
      const { ctx, page } = await setupPage(browser, { noMic: true });
      await page.click('#btn-start');
      await sleep(500);
      const text = await page.textContent('#speech-text');
      const hasNarrative = text.includes("don't know") && text.includes("instrument");
      result('4a', 'AI ignorance opener on mic check', hasNarrative ? 'PASS' : 'MINOR',
        'text="' + text.substring(0, 80) + '"');
      await ctx.close();
    }

    console.log('\n--- 4b. 3 mic denials → fallback ---');
    {
      const { ctx, page } = await setupPage(browser, { noMic: true });
      await page.evaluate(() => window.__gameTest.transitionTo('mic_check'));
      await sleep(300);
      // Click mic button 3 times (using evaluate to avoid Playwright click timing issues)
      for (let i = 0; i < 3; i++) {
        await page.evaluate(async () => {
          const btn = document.getElementById('btn-mic-check');
          if (btn && !btn.disabled) {
            btn.click();
          }
        });
        await sleep(1000);
      }
      await sleep(200);
      const skipVisible = await page.evaluate(() => {
        const btn = document.getElementById('btn-mic-skip');
        return btn ? btn.style.display !== 'none' && btn.style.display !== '' : false;
      });
      const hasBuiltIn = await page.evaluate(() => {
        const err = document.getElementById('mic-error');
        return err ? err.textContent.includes('built-in') : false;
      });
      result('4b', '3 mic denials shows fallback',
        skipVisible || hasBuiltIn ? 'PASS' : 'MINOR',
        'skip=' + skipVisible + ' builtin=' + hasBuiltIn);
      
      if (skipVisible) {
        await page.click('#btn-mic-skip');
        await sleep(500);
        const state = await page.evaluate(() => window.__gameTest.getState());
        const isFallback = await page.evaluate(() => window.__gameTest.state.useOscillatorFallback);
        result('4b.2', 'Skip to fallback mode',
          state === 'record' && isFallback ? 'PASS' : 'MINOR',
          'state=' + state + ' fallback=' + isFallback);
      }
      await ctx.close();
    }

    console.log('\n--- 4c. Full fallback flow (5 sounds) ---');
    {
      const { ctx, page } = await setupPage(browser);
      // Manually set up with fallback
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(200);
      await fullFallbackFlow(page);
      const soundCount = await page.evaluate(() => window.__gameTest.state.sounds.length);
      const state = await page.evaluate(() => window.__gameTest.getState());
      const alive = await checkAlive(page);
      result('4c', 'Full fallback flow 5 sounds',
        alive && soundCount >= 5 ? 'PASS' : 'SILENT_FAIL',
        'sounds=' + soundCount + ' state=' + state);
      await ctx.close();
    }

    // ===================================================================
    // SCENARIO 5: CREATIVE DESTRUCTION
    // ===================================================================
    console.log('\n========== SCENARIO 5: CREATIVE DESTRUCTION ==========');

    console.log('\n--- 5a. Invalid cell coordinates ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(200);
      // Call toggleCell with edge values
      await page.evaluate(() => {
        window.__gameTest.toggleCell(-1, 0);
        window.__gameTest.toggleCell(0, -1);
        window.__gameTest.toggleCell(999, 0);
        window.__gameTest.toggleCell(0, 999);
        window.__gameTest.toggleCell(-5, -10);
        window.__gameTest.toggleCell(5, 8); // exactly out of bounds
        window.__gameTest.toggleCell(0, 8);
      });
      await sleep(200);
      const alive = await checkAlive(page);
      result('5a', 'Invalid cell toggle coordinates', alive ? 'PASS' : 'CRASH', '');
      await ctx.close();
    }

    console.log('\n--- 5b. Fill all 40 cells ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        for (let r = 0; r < 5; r++)
          for (let c = 0; c < 8; c++)
            window.__gameTest.state.grid[r][c] = true;
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(300);
      const filled = await page.evaluate(() => {
        let c = 0;
        for (let r = 0; r < 5; r++)
          for (let b = 0; b < 8; b++)
            if (window.__gameTest.state.grid[r][b]) c++;
        return c;
      });
      const alive = await checkAlive(page);
      result('5b', 'All 40 cells filled', alive && filled === 40 ? 'PASS' : 'MINOR',
        'filled=' + filled);
      await ctx.close();
    }

    console.log('\n--- 5c. Clear button cooldown (1.5s) ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.state.grid[0][0] = true;
        window.__gameTest.state.grid[1][1] = true;
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(200);
      const cdBefore = await page.evaluate(() => window.__gameTest.state.clearCooldown);
      await page.click('#btn-seq-clear');
      await sleep(100);
      const cdAfter = await page.evaluate(() => window.__gameTest.state.clearCooldown);
      const gridAfter = await page.evaluate(() => window.__gameTest.state.grid[0][0]);
      await page.click('#btn-seq-clear').catch(() => {});
      await sleep(100);
      const alive = await checkAlive(page);
      result('5c', 'Clear button 1.5s cooldown',
        alive && cdBefore === false && cdAfter === true && gridAfter === false ? 'PASS' : 'MINOR',
        'cdBefore=' + cdBefore + ' cdAfter=' + cdAfter + ' grid=' + gridAfter);
      await ctx.close();
    }

    console.log('\n--- 5d. Window resize during gameplay ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(200);
      await page.setViewportSize({ width: 375, height: 667 });
      await sleep(200);
      await page.setViewportSize({ width: 320, height: 480 });
      await sleep(200);
      await page.setViewportSize({ width: 1024, height: 768 });
      await sleep(200);
      await page.setViewportSize({ width: 768, height: 1024 });
      await sleep(200);
      const alive = await checkAlive(page);
      const state = await page.evaluate(() => window.__gameTest.getState());
      result('5d', 'Multiple window resizes', alive && state === 'record' ? 'PASS' : 'MINOR',
        'state=' + state);
      await ctx.close();
    }

    console.log('\n--- 5e. Page refresh during recording ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(200);
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      const alive = await checkAlive(page);
      const text = await page.textContent('#speech-text');
      result('5e', 'Page refresh during recording', alive ? 'PASS' : 'CRASH',
        'text="' + text.substring(0, 60) + '"');
      await ctx.close();
    }

    console.log('\n--- 5f. Two game instances simultaneously ---');
    {
      const ctx = await browser.newContext({ permissions: [] });
      const page1 = await ctx.newPage();
      const page2 = await ctx.newPage();
      await page1.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
      await page2.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
      await sleep(500);
      const t1 = await page1.textContent('#speech-text');
      const t2 = await page2.textContent('#speech-text');
      result('5f', 'Two instances simultaneously',
        t1.length > 0 && t2.length > 0 ? 'PASS' : 'MINOR', '');
      await ctx.close();
    }

    console.log('\n--- 5g. Orientation change during sequencer ---');
    {
      const { ctx, page } = await setupPage(browser);
      await page.evaluate(() => {
        const names = ['La-la','Clap','Stomp','Tap','Whoosh'];
        for (let i = 0; i < 5; i++) {
          window.__gameTest.state.sounds.push({
            name: names[i], color: ['red','teal','gold','green','purple'][i],
            colorHex: ['#FF6B6B','#4ECDC4','#FFD93D','#6BCB77','#A084E8'][i],
            blob: new Blob(['test'+i], {type:'audio/webm'}), url: null, fallback: true
          });
        }
        window.__gameTest.state.soundIndex = 5;
        window.__gameTest.initGrid();
        window.__gameTest.transitionTo('sequencer_edit');
      });
      await sleep(200);
      await page.setViewportSize({ width: 1024, height: 768 });
      await sleep(200);
      await page.setViewportSize({ width: 768, height: 1024 });
      await sleep(200);
      const alive = await checkAlive(page);
      result('5g', 'Orientation change during sequencer', alive ? 'PASS' : 'CRASH', '');
      await ctx.close();
    }

    // ===================================================================
    // FULL GAME FLOW
    // ===================================================================
    console.log('\n========== ADDITIONAL: FULL GAME FLOW ==========');
    console.log('\n--- Full flow: init→record→sequencer→play→lock→compose→celebrate ---');
    {
      const { ctx, page } = await setupPage(browser);
      
      let state = await page.evaluate(() => window.__gameTest.getState());
      result('flow.0', 'Initial state init', state === 'init' ? 'PASS' : 'CRASH', state);
      
      await page.click('#btn-start');
      await sleep(300);
      state = await page.evaluate(() => window.__gameTest.getState());
      result('flow.1', 'Start → mic_check', state === 'mic_check' ? 'PASS' : 'CRASH', state);
      
      await page.evaluate(() => {
        window.__gameTest.state.micGranted = true;
        window.__gameTest.state.useOscillatorFallback = true;
        window.__gameTest.transitionTo('record');
      });
      await sleep(200);
      await fullFallbackFlow(page);
      
      const soundCount = await page.evaluate(() => window.__gameTest.state.sounds.length);
      state = await page.evaluate(() => window.__gameTest.getState());
      result('flow.2', soundCount + '/5 sounds recorded',
        soundCount >= 5 ? 'PASS' : 'DEAD_END',
        'sounds=' + soundCount + ' state=' + state);
      
      if (soundCount >= 5) {
        if (state === 'sound_bank_complete') await sleep(3500);
        else if (state === 'sequencer_intro') {
          await page.click('#btn-start-grid');
          await sleep(300);
        }
        state = await page.evaluate(() => window.__gameTest.getState());
        
        if (state === 'sequencer_edit') {
          await page.evaluate(() => {
            window.__gameTest.state.grid[0][0] = true;
            window.__gameTest.state.grid[0][4] = true;
            window.__gameTest.state.grid[1][2] = true;
            window.__gameTest.state.grid[2][6] = true;
            window.__gameTest.transitionTo('sequencer_edit');
          });
          await sleep(200);
          
          await page.click('#btn-seq-play');
          await sleep(6000);
          state = await page.evaluate(() => window.__gameTest.getState());
          result('flow.3', 'Sequencer play-thru 1', state === 'sequencer_edit' ? 'PASS' : 'MINOR',
            'state=' + state);
          
          await page.click('#btn-seq-play');
          await sleep(6000);
          
          const hasLock = await page.$('#btn-lock');
          result('flow.4', 'Lock button after 2 plays', !!hasLock ? 'PASS' : 'MINOR', '');
          
          if (hasLock) {
            await hasLock.click();
            await sleep(500);
            state = await page.evaluate(() => window.__gameTest.getState());
            result('flow.5', 'Lock song', state === 'lock_song' ? 'PASS' : 'MINOR', 'state=' + state);
            
            await sleep(3000);
            state = await page.evaluate(() => window.__gameTest.getState());
            result('flow.6', 'AI composing', state !== 'lock_song' ? 'PASS' : 'MINOR',
              'state=' + state);
          }
        }
      }
      
      const finalAlive = await checkAlive(page);
      result('flow.end', 'Game alive at end', finalAlive ? 'PASS' : 'CRASH', '');
      await ctx.close();
    }

    // ===================================================================
    // SUMMARY
    // ===================================================================
    console.log('\n' + '='.repeat(60));
    console.log('COMPREHENSIVE ADVERSARIAL TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('  Total tests: ' + totalTests);
    console.log('  PASS:        ' + passed);
    console.log('  MINOR:       ' + minor);
    console.log('  DEAD_END:    ' + deadEnd);
    console.log('  CRASH:       ' + crash);
    console.log('  MISLEADING:  ' + misleading);
    console.log('  SILENT_FAIL: ' + silentFail);
    console.log('');
    if (crash + deadEnd + misleading + silentFail === 0) {
      console.log('✓ No CRASH, DEAD_END, MISLEADING, or SILENT_FAIL issues found');
    }
    if (minor > 0) {
      console.log('\nMinor issues:');
      details.filter(d => d.verdict === 'MINOR').forEach(d => {
        console.log('  - ' + d.category + ': ' + d.scenario);
        if (d.detail) console.log('    ' + d.detail);
      });
    }
    console.log('='.repeat(60));
    console.log('VERDICT: ' + (
      crash > 0 ? 'FAIL — CRASH(es) detected' :
      deadEnd > 0 ? 'FAIL — DEAD_END(s) detected' :
      misleading > 0 ? 'FAIL — MISLEADING feedback detected' :
      silentFail > 0 ? 'FAIL — SILENT_FAIL(s) detected' :
      minor > 0 ? 'PASS with minor issues' :
      'PASS — Game is robust'
    ));

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
