/**
 * main.js — Application initialization and module wiring
 *
 * This is a thin entry point. Core initialization is in game.js.
 * All modules are loaded in dependency order via <script> tags in index.html.
 */

(function() {
  'use strict';

  // Show the game container when fonts are loaded
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('game-container');
    if (container) {
      container.classList.add('ready');
    }

    // Game.init() is called at the bottom of game.js via DOMContentLoaded
  });

  // Handle page visibility changes (pause/resume as needed)
  document.addEventListener('visibilitychange', () => {
    // Game loop continues via requestAnimationFrame in Belt
  });

  // Prevent accidental zoom on double-tap
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.email-card')) {
      e.preventDefault();
    }
  }, { passive: false });

  // Log ready state
  console.log('🧠 Nova\'s AI Sorting Lab — ready');
})();

// ── AI Exam ──
const EXAM_QUESTIONS = [
  {concept:'Supervised Learning',emoji:'📚',
    question:'Nova learns that "bus" goes to Transit and "park" goes to Parks. What AI method is this?',
    choices:[
      {text:'Sentiment analysis — reading emotion in text',correct:false},
      {text:'Priority routing — deciding what goes first',correct:false},
      {text:'Supervised learning — learning from labeled examples',correct:true},
      {text:'Crisis response — handling emergencies',correct:false},
    ],explanation:'Supervised learning means showing the AI labeled examples. When you drag "bus" to Transit, you tell the AI: this word belongs here. Nova learns the pattern from your examples.'},
  {concept:'Sentiment Analysis',emoji:'😊',
    question:'An email says "The park is beautiful!" (+5) compared to "The trash stinks!" (-5). What does the score tell Nova?',
    choices:[
      {text:'The score tells which department to route the email to',correct:false},
      {text:'The score measures how long the email is',correct:false},
      {text:'The score shows how strongly positive or negative the emotion is',correct:true},
      {text:'The score shows how important the sender is',correct:false},
    ],explanation:'Sentiment analysis measures emotion in text on a scale from -5 (very angry) to +5 (very happy). Nova uses this to prioritize — angry citizens get helped first because their problems are more urgent.'},
  {concept:'Pattern Recognition',emoji:'🧩',
    question:'After 50 emails, Nova can route keywords in 0.5 seconds instead of 5 seconds. Why?',
    choices:[
      {text:'Nova got a software update',correct:false},
      {text:'The conveyor belt was sped up',correct:false},
      {text:'Nova recognizes patterns from the training data you provided',correct:false},
      {text:'More training data helps Nova recognize patterns faster',correct:true},
    ],explanation:'Pattern recognition improves with more data. Like how you get faster at a video game the more you play — Nova\'s AI gets faster at routing because she has seen more examples and learned the patterns.'},
  {concept:'Priority Routing',emoji:'⚡',
    question:'Negative emails (-5 sentiment) score 4x more points than positive ones (+5). What is the game teaching?',
    choices:[
      {text:'Negative emails are longer and harder to read',correct:false},
      {text:'Not all problems are equally urgent — angry citizens need help first',correct:true},
      {text:'Positive emails should be ignored',correct:false},
      {text:'The AI prefers negative people',correct:false},
    ],explanation:'Priority routing teaches that not all emails are equally important. A citizen whose trash hasn\'t been picked up for 3 weeks is more urgent than someone saying "nice park." AI must learn to prioritize by urgency, just like a real 911 dispatch system.'},
  {concept:'Throughput at Speed',emoji:'⚡',
    question:'The conveyor belt gets faster in each level, with more emails arriving per minute. What real-world AI problem does this teach?',
    choices:[
      {text:'AI must handle increasing workloads as the system grows',correct:true},
      {text:'AI should slow down to avoid mistakes',correct:false},
      {text:'Emails should be processed one at a time forever',correct:false},
      {text:'Speed is not important for AI systems',correct:false},
    ],explanation:'Throughput is about handling volume at scale. A real city help center gets thousands of emails daily. AI must learn to process them fast without sacrificing accuracy — like a factory conveyor belt that speeds up as workers get more efficient.'},
  {concept:'Topic Disambiguation',emoji:'🔀',
    question:'An email says "I love the park but the trash is overflowing!" It mentions both parks AND trash, but sentiment is -3. Where should Nova route it?',
    choices:[
      {text:'Parks & Recreation — the park is mentioned first',correct:false},
      {text:'Both departments — split the email in half',correct:false},
      {text:'Waste Management — negative sentiment about trash means urgent',correct:true},
      {text:'Transit Authority — it\'s about city services',correct:false},
    ],explanation:'When an email has mixed topics, the AI must disambiguate by looking at the sentiment. The negative score (-3) about trash means this is urgent. The positive mention of a park can wait. Nova learns to use sentiment to resolve ambiguity.'},
  {concept:'Crisis Response',emoji:'🚨',
    question:'12 urgent negative emails arrive at once on max-speed belt. What is the right approach for Nova?',
    choices:[
      {text:'Process them one at a time slowly',correct:false},
      {text:'Ask a human for help on each email',correct:false},
      {text:'Ignore the positive ones and only process negatives',correct:false},
      {text:'Use all learned skills — speed, priority, and pattern recognition together',correct:true},
    ],explanation:'A crisis combines everything the AI has learned: speed (throughput), priority (negatives first), and pattern recognition (knowing departments without thinking). Like a fire department that trains for emergencies by practicing all their skills together.'},
  {concept:'Autonomous AI',emoji:'🤖',
    question:'After 7 lessons, Nova sorts 25 emails in 2 seconds with 100% accuracy. How is this possible?',
    choices:[
      {text:'The game got easier',correct:false},
      {text:'The student\'s training taught Nova all the patterns she needs',correct:true},
      {text:'Nova is just lucky today',correct:false},
      {text:'The emails were pre-sorted by a human',correct:false},
    ],explanation:'Autonomous AI means Nova can work on her own because YOU trained her well. Like a student who practices enough to pass a test without help — Nova has seen enough examples that she knows what to do without being told each time.'},
];

let examState = null;
const examLetters = ['A','B','C','D'];

function startExam() {
  document.getElementById('level-menu').classList.add('hidden');
  document.getElementById('main-area').style.display = 'none';
  document.getElementById('nova-area').style.display = 'none';
  document.getElementById('instruction-bar').style.display = 'none';
  examState = { q: 0, correct: 0, results: [] };
  document.getElementById('exam-overlay').classList.remove('hidden');
  showExamQ(0);
}

function showExamQ(idx) {
  const q = EXAM_QUESTIONS[idx];
  if (!q) { finishExam(); return; }
  const total = EXAM_QUESTIONS.length;
  document.getElementById('exam-header').textContent = '📝 AI Exam — ' + q.concept;
  document.getElementById('exam-badge').textContent = q.emoji + ' ' + q.concept;
  document.getElementById('exam-count').textContent = (idx + 1) + '/' + total;
  document.getElementById('exam-question').textContent = q.question;
  document.getElementById('exam-feedback').style.display = 'none';
  document.getElementById('exam-complete').style.display = 'none';
  document.getElementById('exam-progress-fill').style.width = ((idx / total) * 100) + '%';

  const cEl = document.getElementById('exam-choices');
  cEl.innerHTML = '';
  q.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'exam-choice';
    btn.innerHTML = '<span class="exam-letter">' + examLetters[i] + '</span>' + c.text;
    btn.onclick = function() { handleExam(idx, i); };
    cEl.appendChild(btn);
  });
}

function handleExam(qIdx, cIdx) {
  const q = EXAM_QUESTIONS[qIdx];
  const choice = q.choices[cIdx];
  const isCorrect = choice.correct;
  if (isCorrect) examState.correct++;
  examState.results[qIdx] = isCorrect;

  const btns = document.getElementById('exam-choices').querySelectorAll('.exam-choice');
  btns.forEach((b, i) => {
    b.disabled = true;
    b.classList.toggle('correct', q.choices[i].correct);
    if (i === cIdx && !isCorrect) b.classList.add('wrong');
  });

  document.getElementById('exam-result').textContent = isCorrect ? '✅ Correct!' : '❌ Wrong';
  document.getElementById('exam-result').style.color = isCorrect ? '#39FF14' : '#FF6B35';
  document.getElementById('exam-concept-name').textContent = '🧠 AI Concept: ' + q.concept;
  document.getElementById('exam-explanation').textContent = q.explanation;
  document.getElementById('exam-feedback').style.display = 'block';

  const nextBtn = document.getElementById('exam-next-btn');
  if (qIdx + 1 < EXAM_QUESTIONS.length) {
    nextBtn.textContent = 'Next Question →';
    nextBtn.onclick = function() { showExamQ(qIdx + 1); };
  } else {
    nextBtn.textContent = '🎓 See Results';
    nextBtn.onclick = finishExam;
  }
}

function finishExam() {
  const total = EXAM_QUESTIONS.length;
  const correct = examState.correct;
  const pct = correct / total;
  const stars = pct >= 0.875 ? 3 : pct >= 0.625 ? 2 : pct > 0 ? 1 : 0;
  const titles = {3:'🏆 Nova Master!',2:'👩‍🏫 Senior Teacher',1:'📖 AI Apprentice'};
  const msgs = {3:'You understand all the AI concepts! Nova is proud of her teacher!',
    2:'Good job! You know most AI concepts. Review the ones you missed and try again!',
    1:'Keep learning! Each question teaches an AI concept. Try again to improve your score!'};
  document.getElementById('exam-header').textContent = '📝 AI Exam Complete!';
  document.getElementById('exam-question-area').style.display = 'none';
  document.getElementById('exam-progress-fill').style.width = '100%';
  document.getElementById('exam-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('exam-score').textContent = correct + '/' + total + ' Concepts Mastered';
  document.getElementById('exam-msg').innerHTML = '<b>' + (titles[stars] || '📚 Keep Trying') + '</b><br>' + (msgs[stars] || '');
  
  let recap = '';
  EXAM_QUESTIONS.forEach((q, i) => {
    const ok = examState.results[i];
    recap += '<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;background:rgba(255,255,255,0.03);border-radius:4px;font-size:10px">' +
      '<span>' + (ok ? '✅' : '❌') + '</span><span>' + q.emoji + '</span><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + q.concept + '</span></div>';
  });
  document.getElementById('exam-recap').innerHTML = recap;
  document.getElementById('exam-complete').style.display = 'block';
}

// Wire exam button
document.addEventListener('DOMContentLoaded', () => {
  const examBtn = document.getElementById('btn-exam');
  if (examBtn) examBtn.addEventListener('click', startExam);
  const examMenuBtn = document.getElementById('exam-menu-btn');
  if (examMenuBtn) {
    examMenuBtn.addEventListener('click', function() {
      document.getElementById('main-area').style.display = '';
      document.getElementById('nova-area').style.display = '';
      document.getElementById('instruction-bar').style.display = '';
      document.getElementById('exam-overlay').classList.add('hidden');
      document.getElementById('exam-question-area').style.display = 'block';
      document.getElementById('exam-complete').style.display = 'none';
      document.getElementById('level-menu').classList.remove('hidden');
    });
  }
});
