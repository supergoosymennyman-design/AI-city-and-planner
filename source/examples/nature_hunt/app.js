(async () => {
  const $ = (id) => document.getElementById(id);

  const elements = {
    loadingScreen: $('loading-screen'),
    loadText: $('load-text'),
    loadSub: $('load-sub'),
    headerBadge: $('header-badge'),
    cameraFeed: $('camera-feed'),
    cameraPlaceholder: $('camera-placeholder'),
    aiOverlay: $('ai-overlay'),
    learnedBadges: $('learned-badges'),
    speechText: $('speech-text'),
    speechSub: $('speech-sub'),
    speechBubble: $('speech-bubble'),
    btnCamera: $('btn-camera'),
    btnListen: $('btn-listen'),
    btnQuiz: $('btn-quiz'),
    btnKnow: $('btn-know'),
    btnForget: $('btn-forget'),
    quickPhrases: $('quick-phrases'),
    teachInputArea: $('teach-input-area'),
    teachInput: $('teach-input'),
    btnTeach: $('btn-teach'),
    btnCancelTeach: $('btn-cancel-teach'),
    knowModal: $('know-modal'),
    knowList: $('know-list'),
    closeKnow: $('close-know'),
  };

  let cameraStream = null;
  let cameraActive = false;
  let quizActive = false;
  let quizLabel = null;
  let pendingTeach = false;

  // ─── Loading steps ────────────────────────────────────────────

  function setLoadStatus(text, sub) {
    elements.loadText.textContent = text;
    if (sub) elements.loadSub.textContent = sub;
  }

  setLoadStatus('🌿 Nature Hunt is loading...', 'Warming up the AI brain');
  await sleep(500);

  // Init ML
  setLoadStatus('Loading vision model...', 'Teaching the AI to see');
  try {
    await Vision.init();
  } catch (e) {
    setLoadStatus('Vision model failed to load', 'Check internet connection');
    console.error(e);
    await sleep(2000);
  }

  // Init TTS
  setLoadStatus('Loading voice...', 'Teaching the AI to speak');
  try {
    await Speech.initTTS();
  } catch (e) {
    console.warn('TTS init failed, will use browser TTS fallback', e);
  }

  // Init STT
  setLoadStatus('Setting up microphone...', 'Teaching the AI to listen');
  Speech.initSTT();

  // Load saved knowledge
  setLoadStatus('Loading memories...', 'Remembering what the AI knows');
  try {
    const saved = await Storage.load();
    if (saved && saved.length) {
      Vision.loadDataset(saved);
    }
  } catch (e) {
    console.warn('Could not load saved data', e);
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }

  // Hide loading screen
  setTimeout(() => {
    elements.loadingScreen.classList.add('hidden');
  }, 500);

  updateBadges();

  // ─── Camera ───────────────────────────────────────────────────

  elements.btnCamera.addEventListener('click', toggleCamera);

  async function toggleCamera() {
    if (cameraActive) {
      stopCamera();
    } else {
      await startCamera();
    }
  }

  async function startCamera() {
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };
      cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      elements.cameraFeed.srcObject = cameraStream;
      await elements.cameraFeed.play();
      cameraActive = true;
      elements.cameraPlaceholder.style.display = 'none';
      elements.cameraFeed.style.display = 'block';
      elements.btnCamera.textContent = '📷 Camera Off';
      elements.btnCamera.classList.add('active');
      elements.aiOverlay.style.display = 'block';
      elements.aiOverlay.textContent = '👀 I am looking...';
      elements.btnListen.disabled = false;
    } catch (e) {
      console.error('Camera error:', e);
      elements.aiOverlay.textContent = '❌ Camera not available';
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraActive = false;
    elements.cameraFeed.style.display = 'none';
    elements.cameraPlaceholder.style.display = 'block';
    elements.btnCamera.textContent = '📷 Camera On';
    elements.btnCamera.classList.remove('active');
    elements.aiOverlay.style.display = 'none';
    elements.btnListen.disabled = true;
    elements.teachInputArea.classList.remove('visible');
  }

  // ─── Speech / Voice commands ──────────────────────────────────

  elements.btnListen.addEventListener('click', startVoiceInput);

  function startVoiceInput() {
    if (!cameraActive) {
      aiSay('Turn on the camera first!');
      return;
    }
    if (!Speech.isSTTAvailable()) {
      showQuickTeach();
      return;
    }
    if (Speech.isListeningNow()) {
      Speech.stopListening();
      return;
    }
    elements.btnListen.classList.add('listening');
    elements.btnListen.textContent = '🎤 Listening...';
    elements.speechBubble.classList.add('listening');
    aiSay('I\'m listening...');

    Speech.startListening(
      (transcript) => {
        elements.btnListen.classList.remove('listening');
        elements.btnListen.textContent = '🎤 Listen';
        elements.speechBubble.classList.remove('listening');
        handleCommand(transcript);
      },
      () => {
        elements.btnListen.classList.remove('listening');
        elements.btnListen.textContent = '🎤 Listen';
        elements.speechBubble.classList.remove('listening');
      }
    );
  }

  // Quick phrase buttons
  document.querySelectorAll('[data-phrase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const phrase = btn.dataset.phrase;
      handleCommand(phrase);
    });
  });

  // Teach input
  elements.btnTeach.addEventListener('click', () => {
    const label = elements.teachInput.value.trim().toLowerCase();
    if (label) {
      doTeach(label);
      elements.teachInput.value = '';
      elements.teachInputArea.classList.remove('visible');
    }
  });

  elements.teachInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') elements.btnTeach.click();
  });

  elements.btnCancelTeach.addEventListener('click', () => {
    elements.teachInputArea.classList.remove('visible');
    pendingTeach = false;
  });

  function showQuickTeach(promptLabel) {
    elements.teachInputArea.classList.add('visible');
    elements.teachInput.focus();
    if (promptLabel) elements.teachInput.value = promptLabel;
  }

  // ─── Command handling ─────────────────────────────────────────

  function handleCommand(text) {
    if (!text) return;
    console.log('Command:', text);

    if (quizActive) {
      handleQuizResponse(text);
      return;
    }

    // "stop" / "cancel"
    if (/^(stop|cancel|thank you|thanks)$/i.test(text)) {
      aiSay('Okay! Let me know when you need me!');
      return;
    }

    // "what do you know" / "what have you learned"
    if (/what (do you know|have you learned|can you do)/i.test(text)) {
      showKnowledge();
      return;
    }

    // "forget [label]"
    const forgetMatch = text.match(/^forget\s+(.+)/i);
    if (forgetMatch) {
      const label = forgetMatch[1].trim();
      Vision.removeLabel(label);
      Storage.save(Vision.exportDataset());
      updateBadges();
      aiSay(`Okay, I forgot "${label}".`);
      return;
    }

    // "this is a [label]" or "this is [label]" or "teach [label]"
    const teachMatch = text.match(/^(?:this is(?: a)?|teach(?: me)?)\s+(.+)/i);
    if (teachMatch) {
      const label = teachMatch[1].trim().toLowerCase();
      doTeach(label);
      return;
    }

    // "can you find me a [label]" or "find [label]" or "find me [label]"
    const findMatch = text.match(/(?:can you find me|find me|find)\s+(?:a\s+)?(.+)/i);
    if (findMatch) {
      const label = findMatch[1].trim().toLowerCase();
      startQuiz(label);
      return;
    }

    // "what is this" / "what's this"
    if (/what(?: is|'s)\s+this/i.test(text)) {
      doClassify();
      return;
    }

    // "quiz me" / "test me"
    if (/quiz|test/i.test(text)) {
      const labels = Vision.getLabels();
      if (labels.length === 0) {
        aiSay('I don\'t know anything yet! Teach me something first.');
        return;
      }
      const randomLabel = labels[Math.floor(Math.random() * labels.length)];
      startQuiz(randomLabel);
      return;
    }

    // Unknown command
    aiSay('I didn\'t understand. Try saying "this is a flower" or "what is this"?');
  }

  // ─── Teaching ─────────────────────────────────────────────────

  async function doTeach(label) {
    if (!cameraActive || !label) return;
    elements.aiOverlay.textContent = '🧠 Learning...';
    await sleep(300);
    const success = await Vision.teach(elements.cameraFeed, label);
    if (success) {
      await Storage.save(Vision.exportDataset());
      updateBadges();
      aiSay(`Thank you! I have learned "${label}".`);
      elements.aiOverlay.textContent = `✅ Learned "${label}"`;
    } else {
      aiSay('Hmm, I couldn\'t see clearly. Try again?');
      elements.aiOverlay.textContent = '❌ Could not see clearly';
    }
  }

  // ─── Classification ───────────────────────────────────────────

  async function doClassify() {
    if (!cameraActive) {
      aiSay('Turn on the camera first!');
      return;
    }
    elements.aiOverlay.textContent = '🤔 Thinking...';
    await sleep(400);
    const result = await Vision.predict(elements.cameraFeed);
    if (result && result.confidence >= 0.5) {
      aiSay(`That is a ${result.label}!`, () => {
        elements.aiOverlay.textContent = `✅ ${result.label}`;
      });
    } else {
      aiSay('Hmm, I don\'t know what that is. Can you teach me?');
      elements.aiOverlay.textContent = '❓ I don\'t know';
    }
  }

  // ─── Quiz mode ────────────────────────────────────────────────

  function startQuiz(label) {
    const labels = Vision.getLabels();
    if (labels.length === 0) {
      aiSay('I don\'t know anything yet! Teach me something first.');
      return;
    }
    if (!labels.includes(label)) {
      aiSay(`I don't know "${label}" yet. Teach me first!`);
      return;
    }
    quizActive = true;
    quizLabel = label;
    elements.btnQuiz.textContent = `🎯 Find ${label}`;
    elements.btnQuiz.classList.add('active');
    aiSay(`Can you find me a ${label}? Point the camera at it!`);
    elements.aiOverlay.textContent = `🔍 Looking for ${label}...`;
  }

  async function handleQuizResponse(text) {
    if (/^yes/i.test(text) || /^(is|this)\s+(is|looks)/i.test(text)) {
      const result = await Vision.predict(elements.cameraFeed);
      if (result && result.label === quizLabel && result.confidence >= 0.5) {
        aiSay(`Yes! That's a ${quizLabel}! Great job! 🎉`);
        endQuiz(true);
      } else if (result) {
        aiSay(`That looks like a ${result.label} to me. Try again!`);
      } else {
        aiSay('I can\'t see clearly. Get closer!');
      }
      return;
    }

    if (/^(no|nope|wrong|not)/i.test(text)) {
      aiSay('Keep looking! You can do it!');
      return;
    }

    if (/^(stop|cancel|done|quit)/i.test(text)) {
      aiSay('Okay, quiz ended!');
      endQuiz();
      return;
    }

    const classifyResult = await Vision.predict(elements.cameraFeed);
    if (classifyResult) {
      quizActive = true;
      if (classifyResult.label === quizLabel && classifyResult.confidence >= 0.5) {
        elements.aiOverlay.textContent = `✅ That's a ${quizLabel}!`;
        aiSay(`That looks like a ${quizLabel}! Is that what you were looking for?`);
      } else {
        elements.aiOverlay.textContent = `🤔 That looks like ${classifyResult.label}`;
        aiSay(`I see ${classifyResult.label}. Keep looking for a ${quizLabel}!`);
      }
    } else {
      aiSay('I can\'t see anything clearly. Point the camera at something!');
    }
  }

  function endQuiz(success) {
    quizActive = false;
    quizLabel = null;
    elements.btnQuiz.textContent = '🎯 Quiz Me';
    elements.btnQuiz.classList.remove('active');
    if (!success) {
      elements.aiOverlay.textContent = '👀 I am looking...';
    }
  }

  // ─── Knowledge ────────────────────────────────────────────────

  function showKnowledge() {
    const labels = Vision.getLabels();
    if (labels.length === 0) {
      aiSay('I don\'t know anything yet. Teach me something!');
      return;
    }
    elements.knowList.innerHTML = labels
      .map((l) => `<li>🌱 ${l}</li>`)
      .join('');
    elements.knowModal.classList.add('visible');
    const count = labels.length;
    aiSay(`I know ${count} thing${count !== 1 ? 's' : ''}: ${labels.join(', ')}`);
  }

  elements.closeKnow.addEventListener('click', () => {
    elements.knowModal.classList.remove('visible');
  });

  elements.knowModal.addEventListener('click', (e) => {
    if (e.target === elements.knowModal) {
      elements.knowModal.classList.remove('visible');
    }
  });

  elements.btnKnow.addEventListener('click', showKnowledge);

  elements.btnQuiz.addEventListener('click', () => {
    if (quizActive) {
      endQuiz();
      aiSay('Quiz ended!');
      return;
    }
    const labels = Vision.getLabels();
    if (labels.length === 0) {
      aiSay('I don\'t know anything yet! Teach me something first.');
      return;
    }
    const randomLabel = labels[Math.floor(Math.random() * labels.length)];
    startQuiz(randomLabel);
  });

  elements.btnForget.addEventListener('click', () => {
    const labels = Vision.getLabels();
    if (labels.length === 0) {
      aiSay('I don\'t know anything, nothing to forget!');
      return;
    }
    Vision.clearAll();
    Storage.clear();
    updateBadges();
    aiSay('I have forgotten everything! Time to teach me again.');
  });

  // ─── AI Speak ─────────────────────────────────────────────────

  function aiSay(text, callback) {
    elements.speechText.textContent = text;
    elements.speechSub.textContent = '';
    Speech.speak(text, () => {
      if (callback) callback();
    });
  }

  // ─── Badges ──────────────────────────────────────────────────

  function updateBadges() {
    const labels = Vision.getLabels();
    const count = labels.length;
    elements.headerBadge.textContent = `🌟 ${count} known`;
    elements.learnedBadges.innerHTML = labels
      .map((l) => `<span class="learned-badge">🌱 ${l}</span>`)
      .join('');
  }

  // ─── Utilities ───────────────────────────────────────────────

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Auto-camera for demo ────────────────────────────────────
  // Delay camera start to let the page settle
  setTimeout(() => {
    if (!cameraActive) {
      startCamera();
    }
  }, 1500);
})();
