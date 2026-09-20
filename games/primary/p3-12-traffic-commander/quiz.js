/* =========================================================================
   quiz.js — Level 6 "Transport Department Briefing".
   10 multiple-choice questions (1:1 with the AI concepts), immediate feedback,
   scoring (7/10 to pass), and canvas clearance rendering.
   Mounts its own DOM into a host element; game.js toggles it on/off.
   ========================================================================= */
const Quiz = (() => {
  'use strict';

  const QUESTIONS = [
    {
      q: 'How does Flux know when cars are waiting at a red light?',
      choices: [
        { t: 'Inductive loop sensors under the road detect the cars', ok: true },
        { t: 'A camera watches the road', ok: false },
        { t: 'Cars honk their horns', ok: false }
      ],
      concept: 'Sensor Data',
      explain: 'Metal loops buried under the road sense the metal in cars — that is Flux\'s sensor data.'
    },
    {
      q: 'Why should Flux NOT flush the light for a bicycle?',
      choices: [
        { t: 'Bikes can go through red lights', ok: false },
        { t: 'Bikes have less metal so the sensor barely registers them', ok: true },
        { t: 'Bikes don\'t need roads', ok: false }
      ],
      concept: 'Signal Filtering',
      explain: 'A bike has little metal, so it is a weak signal. Flux filters it out and waits for real traffic.'
    },
    {
      q: 'When the bar graph fills faster than normal, what does Flux know?',
      choices: [
        { t: 'It\'s a holiday', ok: false },
        { t: 'The sensor is broken', ok: false },
        { t: 'More cars are arriving = risk of overflow soon', ok: true }
      ],
      concept: 'Load Prediction',
      explain: 'A faster-rising bar means more cars. Flux predicts overflow and acts early.'
    },
    {
      q: 'With 4 lanes and one green light, which lane should Flux flush first?',
      choices: [
        { t: 'The one with the most green paint', ok: false },
        { t: 'The lane with the highest bar (longest queue)', ok: true },
        { t: 'Lane A because it\'s first', ok: false }
      ],
      concept: 'Priority',
      explain: 'Flux compares every lane and serves the longest queue first — that is prioritisation.'
    },
    {
      q: 'What happens if you set Flux\'s trigger level to 40%?',
      choices: [
        { t: 'Flux flushes too often and wastes green lights', ok: true },
        { t: 'Traffic flows perfectly', ok: false },
        { t: 'Nothing changes', ok: false }
      ],
      concept: 'Automation',
      explain: 'A low trigger makes Flux flush almost-empty lanes, wasting green time.'
    },
    {
      q: 'What happens if you set Flux\'s trigger level to 90%?',
      choices: [
        { t: 'Flux flushes every 2 seconds', ok: false },
        { t: 'Traffic flows perfectly', ok: false },
        { t: 'Flux barely flushes and lanes overflow', ok: true }
      ],
      concept: 'Automation',
      explain: 'A very high trigger makes Flux wait too long, so lanes fill up and overflow.'
    },
    {
      q: 'What\'s the difference between the sensor reading for a bike vs. a car?',
      choices: [
        { t: 'Nothing, they look the same', ok: false },
        { t: 'Bikes are faster', ok: false },
        { t: 'A car has more metal, so the sensor reading is much stronger', ok: true }
      ],
      concept: 'Signal Filtering',
      explain: 'More metal = stronger signal. That is how Flux tells cars from bikes.'
    },
    {
      q: 'Why does Flux need sensors buried under the road?',
      choices: [
        { t: 'AI needs data from the physical world to make decisions', ok: true },
        { t: 'Sensors look cool', ok: false },
        { t: 'Sensors power the traffic lights', ok: false }
      ],
      concept: 'Sensor Data',
      explain: 'AI can only decide well when it has real data about the world.'
    },
    {
      q: 'Can Flux manage traffic perfectly without any human help?',
      choices: [
        { t: 'Yes, AI is perfect', ok: false },
        { t: 'No, Flux needs a human to set the right trigger level', ok: true },
        { t: 'No, AI never works', ok: false }
      ],
      concept: 'Automation',
      explain: 'AI follows rules that people set. A human chooses the right trigger level.'
    },
    {
      q: 'What is the most important thing YOU taught Flux today?',
      choices: [
        { t: 'How to beep loudly', ok: false },
        { t: 'How to count cars', ok: false },
        { t: 'How to sense traffic, predict overflow, filter noise, prioritise lanes, and run on its own', ok: true }
      ],
      concept: 'All Concepts',
      explain: 'You taught Flux the whole pipeline: sense, predict, filter, prioritise, and automate!'
    }
  ];

  const PASS = 7;
  let host = null;
  let idx = 0;
  let score = 0;
  let answered = false;
  let onComplete = () => {};

  function mount(hostEl, cb) {
    host = hostEl;
    onComplete = cb || (() => {});
    resetQuiz();          // FIX 4: quiz score is fully independent of gameplay stats; always start fresh at 0
    render();
  }

  /* FIX 4: single source of truth for resetting the quiz's OWN score/index.
     Called on mount (i.e. whenever setupLevel(6) starts the exam) and on retake. */
  function resetQuiz() { idx = 0; score = 0; answered = false; }

  function unmount() { if (host) host.innerHTML = ''; }

  function render() {
    if (!host) return;
    const item = QUESTIONS[idx];
    host.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'quiz-panel';

    panel.innerHTML =
      `<div class="quiz-progress"><span>Briefing ${idx + 1} of ${QUESTIONS.length}</span>
         <span class="quiz-score">Dept. Trust: ${score}</span></div>
       <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${(idx / QUESTIONS.length) * 100}%"></div></div>
       <div class="quiz-concept-tag">${item.concept}</div>
       <h2 class="quiz-question">${item.q}</h2>
       <div class="quiz-choices"></div>
       <div class="quiz-feedback" aria-live="polite"></div>
       <button class="primary-btn quiz-next" hidden>Advise →</button>`;

    const choicesEl = panel.querySelector('.quiz-choices');
    const feedback = panel.querySelector('.quiz-feedback');
    const nextBtn = panel.querySelector('.quiz-next');

    // Shuffle-preserving? Keep order stable (choices already positioned per PLAN).
    item.choices.forEach((c, ci) => {
      const b = document.createElement('button');
      b.className = 'quiz-choice';
      b.textContent = String.fromCharCode(65 + ci) + '.  ' + c.t;
      b.setAttribute('aria-label', c.t);
      b.addEventListener('click', () => select(b, c, item, choicesEl, feedback, nextBtn));
      choicesEl.appendChild(b);
    });

    nextBtn.addEventListener('click', () => {
      idx++;
      answered = false;
      if (idx >= QUESTIONS.length) finish();
      else render();
    });

    host.appendChild(panel);
  }

  function select(btn, choice, item, choicesEl, feedback, nextBtn) {
    if (answered) return;
    answered = true;
    [...choicesEl.children].forEach((b) => { b.disabled = true; });

    if (choice.ok) {
      score++;                       // FIX 4: ONLY a correct answer increments the quiz's own score
      btn.classList.add('correct');
      feedback.className = 'quiz-feedback ok';
      feedback.innerHTML = `✅ The Transport Department agrees! <strong>${item.concept}.</strong> ${item.explain}`;
      SFX.play.correct();
    } else {
      // FIX 4: a wrong answer leaves the score unchanged (no increment).
      btn.classList.add('wrong');
      // reveal correct answer
      [...choicesEl.children].forEach((b, i) => { if (item.choices[i].ok) b.classList.add('correct'); });
      feedback.className = 'quiz-feedback bad';
      const correct = item.choices.find((c) => c.ok);
      feedback.innerHTML = `❌ Not quite. The answer is <strong>${correct.t}</strong>. <em>(${item.concept})</em> ${item.explain}`;
      SFX.play.wrong();
    }
    // FIX 4: reflect the quiz's own independent score immediately (never a shared gameplay stat).
    const scoreEl = host && host.querySelector('.quiz-score');
    if (scoreEl) scoreEl.textContent = 'Dept. Trust: ' + score;
    nextBtn.hidden = false;
    nextBtn.textContent = idx + 1 >= QUESTIONS.length ? 'View Briefing →' : 'Advise →';
    nextBtn.focus();
  }

  function finish() {
    const passed = score >= PASS;
    host.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'quiz-panel result';
    if (passed) SFX.play.fanfare(); else SFX.play.wrong();

    panel.innerHTML =
      `<div class="quiz-final-icon">${passed ? '🏆' : '📋'}</div>
       <h2 class="quiz-final-title">${passed ? 'TRANSPORT DEPARTMENT READY!' : 'Almost there'}</h2>
       <p class="quiz-final-score">Dept. Trust: <strong>${score} / ${QUESTIONS.length}</strong></p>
       <p class="quiz-final-msg">${passed
          ? 'The Transport Department understands traffic AI. Flux can run the city\'s intersections!'
          : 'You need 7 out of 10 to pass. Review the concepts and brief the department again — you\'ve got this!'}</p>
       <div class="quiz-final-actions"></div>`;

    const actions = panel.querySelector('.quiz-final-actions');
    if (passed) {
      const b = document.createElement('button');
      b.className = 'primary-btn';
      b.textContent = '🏙️ Dept. Clearance';
      b.addEventListener('click', () => onComplete(true, score));
      actions.appendChild(b);
    } else {
      const b = document.createElement('button');
      b.className = 'primary-btn';
      b.textContent = '↻ Re-brief';
      b.addEventListener('click', () => { mount(host, onComplete); });
      actions.appendChild(b);
      const cb = document.createElement('button');
      cb.className = 'secondary-btn';
      cb.textContent = 'Return to City';
      cb.addEventListener('click', () => onComplete(false, score));
      actions.appendChild(cb);
    }
    host.appendChild(panel);
  }

  /* ---------- Certificate rendering ---------- */
  function renderCertificate(canvas, name) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#26344a'); g.addColorStop(1, '#1C2331');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // border
    ctx.strokeStyle = '#F1C40F'; ctx.lineWidth = 8;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.strokeStyle = '#3498DB'; ctx.lineWidth = 2;
    ctx.strokeRect(38, 38, W - 76, H - 76);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F1C40F';
    ctx.font = "48px 'Fredoka One','Comic Sans MS',sans-serif";
    ctx.fillText('🚦 CITY CLEARANCE 🚦', W / 2, 120);

    ctx.fillStyle = '#ECF0F1';
    ctx.font = "26px 'Nunito',sans-serif";
    ctx.fillText('The Transport Department confirms', W / 2, 175);

    ctx.fillStyle = '#2ECC71';
    ctx.font = "40px 'Fredoka One','Comic Sans MS',sans-serif";
    ctx.fillText(name || 'Junior Engineer', W / 2, 230);

    ctx.fillStyle = '#ECF0F1';
    ctx.font = "24px 'Nunito',sans-serif";
    ctx.fillText('briefed our AI on', W / 2, 275);
    ctx.fillStyle = '#3498DB';
    ctx.font = "34px 'Fredoka One','Comic Sans MS',sans-serif";
    ctx.fillText('TRANSPORT DEPT. TRAFFIC AI', W / 2, 315);

    // concepts briefed
    ctx.fillStyle = '#9FB0C0';
    ctx.font = "16px 'Nunito',sans-serif";
    ctx.fillText('Concepts briefed:', W / 2, 370);
    const concepts = ['✓ Sensor Data', '✓ Load Prediction', '✓ Signal Filtering', '✓ Priority Optimisation', '✓ Automation'];
    ctx.fillStyle = '#2ECC71';
    ctx.font = "18px 'Nunito',sans-serif";
    concepts.forEach((c, i) => {
      const perRow = 3;
      const col = i % perRow, row = Math.floor(i / perRow);
      const x = W / 2 + (col - 1) * 250;
      const y = 405 + row * 34;
      ctx.fillText(c, x, y);
    });

    // Flux signature
    ctx.fillStyle = '#F39C12';
    ctx.font = "22px 'Fredoka One','Comic Sans MS',sans-serif";
    ctx.fillText('🤖 Flux — City Transport AI Traffic Control', W / 2, H - 55);
    ctx.fillStyle = '#9FB0C0';
    ctx.font = "14px 'Nunito',sans-serif";
    ctx.fillText('You trained this AI. It did not come out of a box this way.', W / 2, H - 32);
  }

  return { QUESTIONS, PASS, mount, unmount, resetQuiz, renderCertificate };
})();
