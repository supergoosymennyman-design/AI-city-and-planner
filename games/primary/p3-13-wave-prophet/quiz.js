/* quiz.js — Level 6 "Transport Department Prediction Briefing" */
const Quiz = (() => {
  const QUESTIONS = [
    { q: 'What does a wider forecast band tell you?',
      choices: [{t:'More cars are arriving soon',ok:true},{t:'The light is about to turn red',ok:false},{t:'The road is empty',ok:false}],
      concept:'Predictive Modeling', explain:'Wider band = more cars predicted to arrive. It tells you to prepare a longer green light.' },
    { q: 'Why is it better to act on a forecast than to wait until cars arrive?',
      choices: [{t:'Forecasts are always wrong',ok:false},{t:'Acting early prevents jams from forming in the first place',ok:true},{t:'Waiting is easier',ok:false}],
      concept:'Predictive Modeling', explain:'Waiting until cars are at the light means the jam has already started. A forecast lets you act BEFORE the wave hits.' },
    { q: 'What is a traffic shockwave?',
      choices: [{t:'A wave that travels backwards as cars brake',ok:true},{t:'A sonic boom from a fast car',ok:false},{t:'The light turning green',ok:false}],
      concept:'Shockwave Theory', explain:'When cars brake, cars behind also brake, creating a backwards-moving wave. Absorbing cars early stops the wave before it starts.' },
    { q: 'When two forecast bands arrive from different directions, what should you do?',
      choices: [{t:'Always serve the left lane first',ok:false},{t:'Let the biggest wave pass first, then handle the smaller one',ok:true},{t:'Ignore both and keep the current light',ok:false}],
      concept:'Multi-Signal Coordination', explain:'Compare the band widths. Give the biggest wave green first — it needs the most time to clear.' },
    { q: 'What makes a traffic surge an "anomaly"?',
      choices: [{t:'It happens at the same time every day',ok:false},{t:'It is unexpected and much larger than normal traffic',ok:true},{t:'It only happens at night',ok:false}],
      concept:'Anomaly Detection', explain:'An anomaly is something unusual — like a stadium letting out. AI must detect it and react quickly.' },
    { q: 'What happens if you coordinate two traffic lights in a "Green Corridor"?',
      choices: [{t:'Cars hit both lights red',ok:false},{t:'Cars pass both lights without stopping',ok:true},{t:'The lights turn off',ok:false}],
      concept:'Multi-Agent Coordination', explain:'Two lights timed together create a green wave — cars pass both without braking, keeping traffic flowing.' },
    { q: 'What does Cascade\'s "Flow Score" measure?',
      choices: [{t:'How fast the cars are painted',ok:false},{t:'How smoothly traffic is moving through the intersection',ok:true},{t:'The temperature of the road',ok:false}],
      concept:'Optimization', explain:'Flow Score measures how well traffic is moving. High score = cars flow without jams.' },
    { q: 'Can Cascade predict traffic perfectly every time?',
      choices: [{t:'Yes, AI is perfect',ok:false},{t:'No, predictions are estimates — unexpected events can change traffic',ok:true},{t:'No, AI can\'t predict anything',ok:false}],
      concept:'Predictive Modeling', explain:'Predictions are educated guesses based on current data. Unexpected events (anomalies) can change what happens.' },
    { q: 'Why does Cascade show the forecast as a coloured band instead of a number?',
      choices: [{t:'Because AI can\'t use numbers',ok:false},{t:'The band\'s width makes the size of the wave easy to see at a glance',ok:true},{t:'It looks cooler',ok:false}],
      concept:'Predictive Modeling', explain:'A wide band is easy to compare — a human can glance at the intersection and spot the biggest wave instantly.' },
    { q: 'What is the most important thing YOU taught Cascade today?',
      choices: [{t:'How to flash pretty colours',ok:false},{t:'How to predict, coordinate, detect anomalies, and optimise traffic flow',ok:true},{t:'How to paint road lines',ok:false}],
      concept:'All Concepts', explain:'You taught Cascade the full predictive pipeline: forecast multi-direction waves, coordinate lights, detect surprises, and optimise flow.' }
  ];
  const PASS = 7;
  let host = null, idx = 0, score = 0, answered = false, onComplete = () => {};
  function mount(el, cb) { host = el; onComplete = cb || (() => {}); idx = 0; score = 0; answered = false; render(); }
  function render() {
    if (!host) return;
    const item = QUESTIONS[idx];
    host.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'quiz-panel';
    panel.innerHTML =
      `<div class="quiz-progress"><span>Briefing ${idx+1}/${QUESTIONS.length}</span><span class="quiz-score">Dept. Trust: ${score}</span></div>
       <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${(idx/QUESTIONS.length)*100}%"></div></div>
       <div class="quiz-concept-tag">${item.concept}</div>
       <h2 class="quiz-question">${item.q}</h2>
       <div class="quiz-choices"></div>
       <div class="quiz-feedback"></div>
       <button class="primary-btn quiz-next" hidden>Advise →</button>`;
    const choicesEl = panel.querySelector('.quiz-choices'), feedback = panel.querySelector('.quiz-feedback'), nextBtn = panel.querySelector('.quiz-next');
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
    if (choice.ok) { score++; btn.classList.add('correct'); feedback.className = 'quiz-feedback ok'; feedback.innerHTML = `✅ The Transport Department agrees! <strong>${item.concept}.</strong> ${item.explain}`; SFX.play.correct(); }
    else { btn.classList.add('wrong'); [...choicesEl.children].forEach((b,i) => { if (item.choices[i].ok) b.classList.add('correct'); });
      feedback.className = 'quiz-feedback bad'; const c = item.choices.find(c => c.ok); feedback.innerHTML = `❌ Not quite. <strong>${c.t}</strong> <em>(${item.concept})</em> ${item.explain}`; SFX.play.wrong(); }
    const se = host?.querySelector('.quiz-score'); if (se) se.textContent = 'Dept. Trust: ' + score;
    nextBtn.hidden = false; nextBtn.textContent = idx+1 >= QUESTIONS.length ? 'View Briefing →' : 'Advise →';
  }
  function finish() {
    const passed = score >= PASS;
    host.innerHTML = '';
    const panel = document.createElement('div'); panel.className = 'quiz-panel result';
    if (passed) SFX.play.fanfare(); else SFX.play.wrong();
    panel.innerHTML =
      `<div class="quiz-final-icon">${passed ? '🏆' : '📋'}</div>
       <h2 class="quiz-final-title">${passed ? 'TRANSPORT DEPARTMENT READY!' : 'Almost there'}</h2>
       <p class="quiz-final-score">Dept. Trust: <strong>${score}/${QUESTIONS.length}</strong></p>
       <p>${passed ? 'The Transport Department understands predictive traffic AI. Cascade can see the waves coming!' : 'Need 7/10 to pass. Review and brief the department again.'}</p>
       <div class="quiz-final-actions"></div>`;
    const actions = panel.querySelector('.quiz-final-actions');
    if (passed) { const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '🏙️ Dept. Clearance'; b.addEventListener('click', () => onComplete(true, score)); actions.appendChild(b); }
    else { const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '↻ Re-brief'; b.addEventListener('click', () => mount(host, onComplete)); actions.appendChild(b); const c = document.createElement('button'); c.className = 'secondary-btn'; c.textContent = 'Return to City'; c.addEventListener('click', () => onComplete(false, score)); actions.appendChild(c); }
    host.appendChild(panel);
  }
  function renderCertificate(canvas, name) {
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0B132B'); g.addColorStop(1, '#111C3F');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3498DB'; ctx.lineWidth = 6; ctx.strokeRect(24, 24, W-48, H-48);
    ctx.strokeStyle = 'rgba(52,152,219,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(38, 38, W-76, H-76);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3498DB'; ctx.font = "48px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('🌊 CITY CLEARANCE 🌊', W/2, 120);
    ctx.fillStyle = '#C9D1D9'; ctx.font = "26px 'Nunito',sans-serif"; ctx.fillText('The Transport Department confirms', W/2, 175);
    ctx.fillStyle = '#2ECC71'; ctx.font = "40px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText(name || 'Traffic Manager', W/2, 230);
    ctx.fillStyle = '#C9D1D9'; ctx.font = "24px 'Nunito',sans-serif"; ctx.fillText('briefed our AI on', W/2, 275);
    ctx.fillStyle = '#3498DB'; ctx.font = "34px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('TRANSPORT DEPT. PREDICTION AI', W/2, 315);
    ctx.fillStyle = '#8B949E'; ctx.font = "16px 'Nunito',sans-serif"; ctx.fillText('Concepts briefed:', W/2, 370);
    const c = ['✓ Predictive Modeling', '✓ Multi-Agent Coordination', '✓ Anomaly Detection', '✓ Optimization'];
    ctx.fillStyle = '#2ECC71'; ctx.font = "18px 'Nunito',sans-serif";
    c.forEach((x, i) => { const col=i%2, row=Math.floor(i/2); ctx.fillText(x, W/2+(col-0.5)*300, 400+row*34); });
    ctx.fillStyle = '#F39C12'; ctx.font = "22px 'Fredoka','Comic Sans MS',sans-serif";
    ctx.fillText('🌊 Cascade — City Predictive Traffic AI', W/2, H-55);
    ctx.fillStyle = '#8B949E'; ctx.font = "14px 'Nunito',sans-serif";
    ctx.fillText('The forecast is clear because of you, Trainer.', W/2, H-32);
  }
  return { QUESTIONS, PASS, mount, renderCertificate };
})();
