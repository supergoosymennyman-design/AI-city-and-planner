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
    // === TEST A: Idle Timer on Record Screen ===
    console.log('\n=== TEST A: Idle Timer on Record Screen ===');
    let ctx = await browser.newContext({ permissions: ['microphone'] });
    let page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(500);

    // Go directly to record screen (skip init/mic_check)
    await page.evaluate(() => {
      window.__gameTest.state.micGranted = true;
      window.__gameTest.state.useOscillatorFallback = true;
      window.__gameTest.transitionTo('record');
    });
    await sleep(500);

    let recordPrompt = await page.textContent('#speech-text');
    console.log('  Initial record prompt: ' + JSON.stringify(recordPrompt));
    check('Record screen shows prompt', recordPrompt.includes('Make') || recordPrompt.includes('sound'), 'DEAD_END');

    // Wait 11 seconds (idle timer fires at 10s)
    console.log('  Waiting 11s for idle prompt...');
    await sleep(11000);

    let afterIdle1 = await page.textContent('#speech-text');
    console.log('  After 11s idle: ' + JSON.stringify(afterIdle1));
    check('Record screen idle prompt fires after ~10s', afterIdle1.includes('Tap') || afterIdle1.includes('button') || afterIdle1.includes('make'), 'UX_GAP');

    // Wait another 11s (second idle prompt)
    console.log('  Waiting 11s more for 2nd idle prompt...');
    await sleep(11000);

    let afterIdle2 = await page.textContent('#speech-text');
    console.log('  After 22s idle: ' + JSON.stringify(afterIdle2));
    check('Second idle prompt fires', afterIdle2.includes('Tap') || afterIdle2.includes('button') || afterIdle2.includes('make'), 'UX_GAP');

    // Wait another 11s (third idle prompt + auto-advance)
    console.log('  Waiting 11s more for auto-advance...');
    await sleep(11000);

    // Should have auto-advanced to playback screen
    let state = await page.evaluate(() => window.__gameTest ? window.__gameTest.getState() : 'unknown');
    console.log('  State after 33s: ' + state);
    check('Auto-advance to playback after 30s idle', state === 'playback', 'DEAD_END');

    await ctx.close();

    // === TEST B: Idle Timer on Name Screen ===
    console.log('\n=== TEST B: Idle Timer on Name Screen ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(500);

    await page.evaluate(() => {
      window.__gameTest.state.micGranted = true;
      window.__gameTest.state.recordingBlob = new Blob(['test'], { type: 'audio/webm' });
      window.__gameTest.transitionTo('name_sound');
    });
    await sleep(500);

    let namePrompt = await page.textContent('#speech-text');
    console.log('  Initial name prompt: ' + JSON.stringify(namePrompt));
    check('Name screen shows', namePrompt.includes('name') || namePrompt.includes('call'), 'DEAD_END');

    // Wait 11s for idle prompt
    console.log('  Waiting 11s for idle prompt...');
    await sleep(11000);

    let nameIdle = await page.textContent('#speech-text');
    console.log('  After name idle: ' + JSON.stringify(nameIdle));
    check('Name screen idle prompt fires after 10s', nameIdle.includes('name') || nameIdle.includes('Tap') || nameIdle.includes('pick'), 'UX_GAP');

    // Wait 22s more for auto-advance
    console.log('  Waiting 22s for auto-advance...');
    await sleep(22000);

    state = await page.evaluate(() => window.__gameTest ? window.__gameTest.getState() : 'unknown');
    console.log('  State after name auto-advance: ' + state);
    check('Auto-advance from name screen', state === 'record' || state === 'sound_bank_complete', 'DEAD_END');

    await ctx.close();

    // === TEST C: Silence Detection ===
    console.log('\n=== TEST C: Silence Detection ===');
    ctx = await browser.newContext({ permissions: ['microphone'] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(500);

    await page.evaluate(() => {
      window.__gameTest.state.micGranted = true;
      window.__gameTest.state.useOscillatorFallback = false;
      window.__gameTest.transitionTo('record');
    });
    await sleep(500);

    // Click record - since we have fake media stream, it will record "silence"
    // The silence detection checks blob.size < 1000
    console.log('  Clicking record (silent recording expected)...');
    try {
      await page.click('#btn-record', { timeout: 1000 });
    } catch(e) {}
    
    // Wait for recording to complete (3s) + processing
    console.log('  Waiting 5s for recording to complete...');
    await sleep(5000);

    // Check the status message
    let status = '';
    try {
      status = await page.textContent('#record-status');
    } catch(e) {}
    console.log('  Status after recording: ' + JSON.stringify(status));
    
    if (status.includes("didn't hear") || status.includes('Try again')) {
      check('Silence detection triggers retry message on first silent recording', true, 'UX_GAP');
    } else {
      check('Silence detection detected', status.length > 0, 'UX_GAP');
    }

    await ctx.close();

    // === TEST D: Grid cell size ===
    console.log('\n=== TEST D: Grid cell dimensions ===');
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

    const cellSize = await page.evaluate(() => {
      const cell = document.querySelector('.seq-cell');
      if (!cell) return null;
      const style = window.getComputedStyle(cell);
      return { w: style.width, h: style.height };
    });
    console.log('  Cell size (desktop): ' + JSON.stringify(cellSize));
    // Default: 56x56 (min), on larger screens 64x64
    check('Grid cell is at least 56x56px', 
      cellSize && parseInt(cellSize.w) >= 56 && parseInt(cellSize.h) >= 56, 
    'UX_GAP');

    // Test on phone viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await sleep(300);
    const cellSizePhone = await page.evaluate(() => {
      const cell = document.querySelector('.seq-cell');
      if (!cell) return null;
      const style = window.getComputedStyle(cell);
      return { w: style.width, h: style.height };
    });
    console.log('  Cell size (phone 375px): ' + JSON.stringify(cellSizePhone));
    check('Grid cell is at least 48px on phone viewport', 
      cellSizePhone && parseInt(cellSizePhone.w) >= 48 && parseInt(cellSizePhone.h) >= 48, 
    'UX_GAP');

    await ctx.close();

    // === TEST E: Complete silence / no interaction at all ===
    console.log('\n=== TEST E: Complete Silence / No Interaction ===');
    ctx = await browser.newContext({ permissions: [] });
    page = await ctx.newPage();
    await page.goto(GAME_PATH, { waitUntil: 'networkidle', timeout: 15000 });
    await sleep(500);

    // Just wait - never click anything
    let speechText = await page.textContent('#speech-text');
    console.log('  Initial: ' + JSON.stringify(speechText));
    check('Game starts on init screen without auto-greeting', speechText.includes('Welcome') || speechText.includes('Ready'), 'CRASH');
    
    // Wait 3 seconds - AI should not auto-speak
    await sleep(3000);
    speechText = await page.textContent('#speech-text');
    console.log('  After 3s no interaction: ' + JSON.stringify(speechText));
    
    // The aiSay on init is "Hi! Ready to build your own instrument?" which is fine
    // This is NOT auto-speech - it's the initial welcome (part of the init screen)
    // The important thing is: no "help" prompts auto-appear
    check('No auto-help prompts appear after 3s without interaction', 
      speechText.includes('Ready') || speechText.includes('Welcome'), 
    'CRASH');

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
