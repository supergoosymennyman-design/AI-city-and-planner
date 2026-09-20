/* quiz.js — Level 6 "Safety Department Vision Briefing" 10 questions, 7/10 pass */
const Quiz = (() => {
  const QUESTIONS = [
    { q: 'What does Edge Mode do to a scene?',
      choices: [
        { t: 'It adds colours and shadows to make it look real', ok: false },
        { t: 'It strips away colour and leaves only outlines for the AI to analyse', ok: true },
        { t: 'It makes the image black and white', ok: false }],
      concept: 'Edge Detection', explain: 'Edge Mode removes visual clutter so AI can focus on the shapes that matter.' },
    { q: 'Why do shadows confuse Iris in RGB mode?',
      choices: [
        { t: 'Shadows are darker than real objects', ok: false },
        { t: 'Shadows create false edges that look like real outlines', ok: true },
        { t: 'Shadows move too fast for AI to track', ok: false }],
      concept: 'Feature Extraction', explain: 'AI can mistake shadows for real objects because both have edges. Edge Mode removes the shadow\'s colour so the real outlines stand out.' },
    { q: 'What is "supervised learning" in computer vision?',
      choices: [
        { t: 'The AI watches a supervisor do the work', ok: false },
        { t: 'You show the AI labelled examples so it learns what things look like', ok: true },
        { t: 'The AI learns by itself without any help', ok: false }],
      concept: 'Supervised Labeling', explain: 'You labelled shapes as Person, Car, or Bike. Those labels taught Iris what each category looks like.' },
    { q: 'When people overlap in a photo, what should Iris do?',
      choices: [
        { t: 'Count them as one blob', ok: false },
        { t: 'Use the separation slider to split them into individuals', ok: true },
        { t: 'Ignore them completely', ok: false }],
      concept: 'Semantic Segmentation', explain: 'Overlapping objects merge into one blob. Adjusting the separation threshold lets Iris split them apart.' },
    { q: 'What happens if you set the sensitivity too high in a rainy scene?',
      choices: [
        { t: 'Raindrops become false edges that Iris mistakes for objects', ok: true },
        { t: 'The image becomes clearer', ok: false },
        { t: 'Iris stops working', ok: false }],
      concept: 'Noise Filtering', explain: 'High sensitivity makes Iris detect every tiny edge — including raindrops and glare. That creates false alarms.' },
    { q: 'What happens if you set the line thickness too high?',
      choices: [
        { t: 'Edges become very detailed and show everything', ok: false },
        { t: 'Edges become too thick and small objects disappear', ok: true },
        { t: 'Nothing changes', ok: false }],
      concept: 'Noise Filtering', explain: 'A thick line only shows the strongest edges — small or faint objects can vanish completely.' },
    { q: 'Why can AI count cars in a busy street faster than a human?',
      choices: [
        { t: 'AI never gets distracted by colours and shadows', ok: true },
        { t: 'AI has faster eyes than humans', ok: false },
        { t: 'AI can see through buildings', ok: false }],
      concept: 'Object Detection', explain: 'AI processes pixels directly. It doesn\'t get distracted by colours, glare, or movement the way human eyes do.' },
    { q: 'What does a "bounding box" tell you about an object?',
      choices: [
        { t: 'What colour the object is', ok: false },
        { t: 'Where the object is located in the image', ok: true },
        { t: 'How heavy the object is', ok: false }],
      concept: 'Object Detection', explain: 'A bounding box is a rectangle around a detected object — it shows the AI found something there.' },
    { q: 'Can computer vision AI recognise objects it has never seen before?',
      choices: [
        { t: 'Yes, AI recognises everything automatically', ok: false },
        { t: 'No, AI can only recognise what it has been trained on', ok: true },
        { t: 'Yes, but only at night', ok: false }],
      concept: 'All Concepts', explain: 'AI learns from training data. If Iris has only seen cars and people, it can\'t recognise a bicycle without being taught first.' },
    { q: 'What is the most important thing YOU taught Iris today?',
      choices: [
        { t: 'How to turn on a camera', ok: false },
        { t: 'How to label, extract edges, segment, detect, and filter visual noise', ok: true },
        { t: 'How to change TV channels', ok: false }],
      concept: 'All Concepts', explain: 'You taught Iris the full pipeline: label → extract edges → segment → detect → filter noise. That\'s computer vision!' }
  ];
  const PASS = 7;
  let host = null, idx = 0, score = 0, answered = false, onComplete = () => {};

  function mount(el, cb) { host = el; onComplete = cb || (() => {}); idx = 0; score = 0; answered = false; render(); }
  function unmount() { if (host) host.innerHTML = ''; }

  function render() {
    if (!host) return;
    const item = QUESTIONS[idx];
    host.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'quiz-panel';
    panel.innerHTML =
      `<div class="quiz-progress"><span>Briefing ${idx+1} of ${QUESTIONS.length}</span><span class="quiz-score">Dept. Trust: ${score}</span></div>
       <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${(idx/QUESTIONS.length)*100}%"></div></div>
       <div class="quiz-concept-tag">${item.concept}</div>
       <h2 class="quiz-question">${item.q}</h2>
       <div class="quiz-choices"></div>
       <div class="quiz-feedback"></div>
       <button class="primary-btn quiz-next" hidden>Advise →</button>`;
    const choicesEl = panel.querySelector('.quiz-choices');
    const feedback = panel.querySelector('.quiz-feedback');
    const nextBtn = panel.querySelector('.quiz-next');
    item.choices.forEach((c, ci) => {
      const b = document.createElement('button'); b.className = 'quiz-choice';
      b.textContent = String.fromCharCode(65+ci) + '.  ' + c.t;
      b.addEventListener('click', () => select(b, c, item, choicesEl, feedback, nextBtn));
      choicesEl.appendChild(b);
    });
    nextBtn.addEventListener('click', () => { idx++; answered = false; if (idx >= QUESTIONS.length) finish(); else render(); });
    host.appendChild(panel);
  }

  function select(btn, choice, item, choicesEl, feedback, nextBtn) {
    if (answered) return; answered = true;
    [...choicesEl.children].forEach(b => b.disabled = true);
    if (choice.ok) {
      score++; btn.classList.add('correct');
      feedback.className = 'quiz-feedback ok';
      feedback.innerHTML = `✅ The Safety Department agrees! <strong>${item.concept}.</strong> ${item.explain}`;
      SFX.play.correct();
    } else {
      btn.classList.add('wrong');
      [...choicesEl.children].forEach((b,i) => { if (item.choices[i].ok) b.classList.add('correct'); });
      feedback.className = 'quiz-feedback bad';
      const correct = item.choices.find(c => c.ok);
      feedback.innerHTML = `❌ Not quite. The answer is <strong>${correct.t}</strong>. <em>(${item.concept})</em> ${item.explain}`;
      SFX.play.wrong();
    }
    const se = host && host.querySelector('.quiz-score');
    if (se) se.textContent = 'Dept. Trust: ' + score;
    nextBtn.hidden = false;
    nextBtn.textContent = idx+1 >= QUESTIONS.length ? 'View Briefing →' : 'Advise →';
    nextBtn.focus();
  }

  function finish() {
    const passed = score >= PASS;
    host.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'quiz-panel result';
    if (passed) SFX.play.fanfare(); else SFX.play.wrong();
    panel.innerHTML =
      `<div class="quiz-final-icon">${passed ? '🏆' : '📋'}</div>
       <h2 class="quiz-final-title">${passed ? 'SAFETY DEPARTMENT READY!' : 'Almost there'}</h2>
       <p class="quiz-final-score">Dept. Trust: <strong>${score}/${QUESTIONS.length}</strong></p>
       <p>${passed ? 'The Safety Department understands computer vision. Iris can watch the city clearly.' : 'Need 7/10 to pass. Review the concepts and brief the department again!'}</p>
       <div class="quiz-final-actions"></div>`;
    const actions = panel.querySelector('.quiz-final-actions');
    if (passed) {
      const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '🏙️ Dept. Clearance';
      b.addEventListener('click', () => onComplete(true, score)); actions.appendChild(b);
    } else {
      const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '↻ Re-brief';
      b.addEventListener('click', () => { mount(host, onComplete); }); actions.appendChild(b);
      const c = document.createElement('button'); c.className = 'secondary-btn'; c.textContent = 'Return to City';
      c.addEventListener('click', () => onComplete(false, score)); actions.appendChild(c);
    }
    host.appendChild(panel);
  }

  function renderCertificate(canvas, name) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0D1117'); g.addColorStop(1, '#161B22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#00FF41'; ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, W-48, H-48);
    ctx.strokeStyle = 'rgba(0,255,65,0.3)'; ctx.lineWidth = 2;
    ctx.strokeRect(38, 38, W-76, H-76);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#00FF41';
    ctx.font = "48px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('👁️ CITY CLEARANCE 👁️', W/2, 120);
    ctx.fillStyle = '#C9D1D9';
    ctx.font = "26px 'Nunito',sans-serif";
    ctx.fillText('The Safety Department confirms', W/2, 175);
    ctx.fillStyle = '#00BFFF';
    ctx.font = "40px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText(name || 'AI Trainer', W/2, 230);
    ctx.fillStyle = '#C9D1D9';
    ctx.font = "24px 'Nunito',sans-serif";
    ctx.fillText('briefed our AI on', W/2, 275);
    ctx.fillStyle = '#00FF41';
    ctx.font = "34px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('SAFETY DEPT. VISION AI', W/2, 315);
    ctx.fillStyle = '#8B949E';
    ctx.font = "16px 'Nunito',sans-serif";
    ctx.fillText('Concepts briefed:', W/2, 370);
    const concepts = ['✓ Labeling', '✓ Edge Extraction', '✓ Segmentation', '✓ Object Detection', '✓ Noise Filtering'];
    ctx.fillStyle = '#00FF41';
    ctx.font = "18px 'Nunito',sans-serif";
    concepts.forEach((c, i) => { const col=i%3, row=Math.floor(i/3); ctx.fillText(c, W/2+(col-1)*250, 405+row*34); });
    ctx.fillStyle = '#F39C12';
    ctx.font = "22px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('👁️ Iris — City Safety Surveillance AI', W/2, H-55);
    ctx.fillStyle = '#8B949E';
    ctx.font = "14px 'Nunito',sans-serif";
    ctx.fillText('You taught me to see. Thank you, Trainer.', W/2, H-32);
  }
  return { QUESTIONS, PASS, mount, unmount, renderCertificate };
})();
