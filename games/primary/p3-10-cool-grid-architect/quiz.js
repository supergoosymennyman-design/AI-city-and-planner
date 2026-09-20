/* quiz.js — Level 6 "Power Department AI Briefing" 10 questions, 7/10 pass */
const Quiz = window.Quiz = (() => {
  const QUESTIONS = [
    { q: 'What does Edge Computing mean?',
      choices: [{t:'Placing AI compute power close to where data is generated (like a Data Center in a city)',ok:true},{t:'Building computers shaped like triangles',ok:false},{t:'Putting all servers in one central location far away',ok:false}],
      concept:'Edge Computing', explain:'Edge computing puts compute resources NEAR where data is created — so the AI can make decisions faster.' },
    { q: 'Why do AI Data Centers need cool locations?',
      choices: [{t:'Because computers generate heat and need cooling to avoid damage',ok:true},{t:'Because AI only works in cold weather',ok:false},{t:'To save electricity on lights',ok:false}],
      concept:'Edge Computing', explain:'AI servers generate enormous heat. Natural cooling from mountains or rivers reduces energy costs and prevents overheating.' },
    { q: 'Which terrain is BEST for solar panels?',
      choices: [{t:'Forest',ok:false},{t:'Desert',ok:true},{t:'Mountain',ok:false}],
      concept:'Load Balancing', explain:'Deserts have maximum sun exposure → solar panels produce the most power. Mountains are better for wind turbines.' },
    { q: 'What happens if you put a Solar Panel on a Mountain tile?',
      choices: [{t:'It produces maximum power',ok:false},{t:'It produces very little power because mountains are bad for solar',ok:true},{t:'It catches on fire',ok:false}],
      concept:'Load Balancing', explain:'Mountains are cool and shaded — terrible for solar. Only 5% solar efficiency! Use deserts for solar, mountains for wind.' },
    { q: 'What is Load Balancing in a power grid?',
      choices: [{t:'Making sure power sources are spread across different types so the grid stays stable',ok:true},{t:'Making all loads weigh the same',ok:false},{t:'Turning off power at night',ok:false}],
      concept:'Load Balancing', explain:'Load balancing means using a mix of power sources (solar, wind, battery) so if one fails, others keep the city running.' },
    { q: 'Why does a Data Center need to be close to the city?',
      choices: [{t:'So the internet signal is strong',ok:false},{t:'To reduce distance delay and cable costs',ok:true},{t:'Data Centers don\'t need to be near cities',ok:false}],
      concept:'Trade-off Optimization', explain:'The further a DC is from the city, the longer data must travel (higher latency). But cool mountains are far from the city — that\'s the trade-off!' },
    { q: 'What does a Cooling Tower do in this game?',
      choices: [{t:'It generates electricity',ok:false},{t:'It adds +30 cooling to any tile, helping cool nearby Data Centers',ok:true},{t:'It blocks the sun',ok:false}],
      concept:'System Design', explain:'Cooling Towers provide flat +30 cooling bonus regardless of terrain — useful when you must place DCs on warm tiles.' },
    { q: 'What does the Battery Storage item do?',
      choices: [{t:'It stores excess power and provides 20 steady backup power',ok:true},{t:'It creates electricity from nothing',ok:false},{t:'It makes the grid look nicer',ok:false}],
      concept:'System Design', explain:'Batteries store power from solar and wind for when the sun isn\'t shining or wind isn\'t blowing.' },
    { q: 'What is the Eco-Score measuring?',
      choices: [{t:'How much noise the grid makes',ok:false},{t:'How well your placement balances cooling, power output, and distance to the city',ok:true},{t:'The number of items placed',ok:false}],
      concept:'System Optimization', explain:'Eco-Score = DC cooling × 2 + total power × 1.5 − total distance × 5. Higher is better — you want cool DCs, strong power, close to city.' },
    { q: 'What is the most important AI lesson from this game?',
      choices: [{t:'Everything should be in one place',ok:false},{t:'AI infrastructure needs careful placement balancing cooling, power, distance, and budget — just like real data centers',ok:true},{t:'More items always means higher score',ok:false}],
      concept:'All Concepts', explain:'Real AI systems need data centers near users, cool environments, renewable power, and careful budget management. You optimized all of these!' }
  ];
  const PASS = 7;
  let host = null, idx = 0, score = 0, answered = false, onComplete = () => {};
  function mount(el, cb) { host = el; onComplete = cb || (() => {}); idx = 0; score = 0; answered = false; render(); }
  function render() {
    if (!host) return; const item = QUESTIONS[idx];
    host.innerHTML = ''; const panel = document.createElement('div'); panel.className = 'quiz-panel';
    panel.innerHTML =
      `<div class="quiz-progress"><span>Briefing ${idx+1}/${QUESTIONS.length}</span><span class="quiz-score">Dept. Trust: ${score}</span></div>
       <div class="quiz-bar"><div class="quiz-bar-fill" style="width:${(idx/QUESTIONS.length)*100}%"></div></div>
       <div class="quiz-concept-tag">${item.concept}</div>
       <h2 class="quiz-question">${item.q}</h2>
       <div class="quiz-choices"></div>
       <div class="quiz-feedback"></div>
       <button class="primary-btn quiz-next" hidden>Advise →</button>`;
    const ch = panel.querySelector('.quiz-choices'), fb = panel.querySelector('.quiz-feedback'), nx = panel.querySelector('.quiz-next');
    item.choices.forEach((c, ci) => {
      const b = document.createElement('button'); b.className = 'quiz-choice';
      b.textContent = String.fromCharCode(65+ci) + '.  ' + c.t;
      b.addEventListener('click', () => select(b, c, item, ch, fb, nx)); ch.appendChild(b);
    });
    nx.addEventListener('click', () => { idx++; answered = false; if (idx >= QUESTIONS.length) finish(); else render(); });
    host.appendChild(panel);
  }
  function select(btn, choice, item, ch, fb, nx) {
    if (answered) return; answered = true;
    [...ch.children].forEach(b => b.disabled = true);
    if (choice.ok) { score++; btn.classList.add('correct'); fb.className = 'quiz-feedback ok'; fb.innerHTML = `✅ The Department agrees! <strong>${item.concept}.</strong> ${item.explain}`; SFX.play.correct(); }
    else { btn.classList.add('wrong'); [...ch.children].forEach((b,i) => { if (item.choices[i].ok) b.classList.add('correct'); });
      fb.className = 'quiz-feedback bad'; const c = item.choices.find(c => c.ok); fb.innerHTML = `❌ <strong>${c.t}</strong> <em>(${item.concept})</em> ${item.explain}`; SFX.play.wrong(); }
    const se = host?.querySelector('.quiz-score'); if (se) se.textContent = 'Dept. Trust: ' + score;
    nx.hidden = false; nx.textContent = idx+1 >= QUESTIONS.length ? 'View Briefing →' : 'Advise →';
  }
  function finish() {
    const passed = score >= PASS;
    host.innerHTML = ''; const panel = document.createElement('div'); panel.className = 'quiz-panel result';
    if (passed) SFX.play.fanfare(); else SFX.play.wrong();
    panel.innerHTML =
      `<div class="quiz-final-icon">${passed ? '🏆' : '📋'}</div>
       <h2 class="quiz-final-title">${passed ? 'POWER DEPARTMENT READY!' : 'Almost there'}</h2>
       <p>Dept. Trust: <strong>${score}/${QUESTIONS.length}</strong></p>
       <p>${passed ? 'The Power Department understands AI grid design!' : 'Need 7/10. Review concepts and brief the department again.'}</p>
       <div class="quiz-final-actions"></div>`;
    const acts = panel.querySelector('.quiz-final-actions');
    if (passed) { const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '🏙️ Dept. Clearance'; b.addEventListener('click', () => onComplete(true, score)); acts.appendChild(b); }
    else { const b = document.createElement('button'); b.className = 'primary-btn'; b.textContent = '↻ Re-brief'; b.addEventListener('click', () => mount(host, onComplete)); acts.appendChild(b); const c = document.createElement('button'); c.className = 'secondary-btn'; c.textContent = 'Return to City'; c.addEventListener('click', () => onComplete(false, score)); acts.appendChild(c); }
    host.appendChild(panel);
  }
  function renderCertificate(el) {
    el.innerHTML = `<div class="cert-inner"><div class="cert-badge">🏙️</div><h2>Power Department Clearance</h2><p>You briefed the Power Department on smart, balanced AI grid design.</p><p class="cert-concepts">🥶Edge Computing · ⚡Load Balancing · ⚖️Trade-offs · 🌐System Design</p><p style="margin-top:1rem;color:var(--muted)">Every placement mattered. Great optimization!</p></div>`;
  }
  return { QUESTIONS, PASS, mount, renderCertificate };
})();
