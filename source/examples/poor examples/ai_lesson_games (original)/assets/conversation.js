/**
 * Conversation Manager
 * Handles chat UI, message display, STT/TTS integration, and natural flow
 *
 * IMPORTANT: Load AFTER config.js and utils.js
 */

class ConversationUI {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`ConversationUI: Container #${containerId} not found`);
      return;
    }

    this.messages = [];
    this.isListening = false;
    this.isThinking = false;

    // Options with defaults from CONFIG
    this.autoSpeak =
      options.autoSpeak ??
      (typeof CONFIG !== "undefined" ? CONFIG.ttsEnabled : true);
    this.showTranscripts =
      options.showTranscripts ??
      (typeof CONFIG !== "undefined" ? CONFIG.showTranscripts : true);
    this.aiName = options.aiName || "AI";
    this.userName = options.userName || "You";

    this._initUI();
  }

  _initUI() {
    this.container.innerHTML = `
      <div class="conversation-header">
        <h3>💬 Conversation</h3>
        <div class="header-buttons">
          <button class="btn-small" id="toggleSTT" title="Speak to AI">🎤</button>
          <button class="btn-small" id="clearChat" title="Clear chat">🗑️</button>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <div class="input-area">
        <input type="text" id="userInput" placeholder="Type or press 🎤 to speak..." />
        <button id="sendBtn">Send</button>
      </div>
      <div class="status" id="status"></div>
    `;

    // Cache elements
    this.messagesEl = this.container.querySelector("#messages");
    this.inputEl = this.container.querySelector("#userInput");
    this.sendBtn = this.container.querySelector("#sendBtn");
    this.statusEl = this.container.querySelector("#status");
    this.toggleSTTBtn = this.container.querySelector("#toggleSTT");

    // Bind events
    this.sendBtn.addEventListener("click", () => this._handleSend());
    this.inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this._handleSend();
    });
    this.toggleSTTBtn.addEventListener("click", () => this._toggleListening());
    this.container
      .querySelector("#clearChat")
      .addEventListener("click", () => this.clear());

    // Add initial welcome message
    this.addMessage("Welcome! I'm ready to learn with you. 🎨", "ai", {
      silent: true,
    });
  }

  addMessage(text, sender, options = {}) {
    const message = {
      id: Date.now() + Math.random(),
      text,
      sender,
      timestamp: new Date(),
      spoken: options.spoken ?? false,
      transcript: options.transcript || null,
    };

    this.messages.push(message);
    this._renderMessage(message);

    // Auto-scroll if enabled
    if (typeof CONFIG !== "undefined" ? CONFIG.autoScroll : true) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    // Auto-speak AI messages
    if (sender === "ai" && this.autoSpeak && !options.silent) {
      this._speakMessage(text, options.onSpeakEnd);
    }

    return message;
  }

  _renderMessage(msg) {
    const msgEl = document.createElement("div");
    msgEl.className = `message ${msg.sender}`;
    msgEl.dataset.id = msg.id;

    const time = msg.timestamp.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    let content = "";

    if (msg.sender === "user") {
      if (msg.transcript && this.showTranscripts) {
        content += `<div class="transcript-note">🎤 Heard: "${escapeHtml(msg.transcript)}"</div>`;
      }
      content += `<div class="bubble">${escapeHtml(msg.text)}</div>`;
      content += `<div class="meta">${this.userName} • ${time}</div>`;
    } else {
      content += `<div class="meta">${this.aiName} • ${time}</div>`;
      content += `<div class="bubble">${escapeHtml(msg.text)}</div>`;
      if (msg.spoken && this.showTranscripts) {
        content += `<div class="transcript-note">🔊 Spoken</div>`;
      }
    }

    msgEl.innerHTML = content;
    this.messagesEl.appendChild(msgEl);
  }

  showThinking(show = true) {
    if (show) {
      this.isThinking = true;
      this.statusEl.textContent = `${this.aiName} is thinking...`;
      this.statusEl.className = "status thinking";

      const typingEl = document.createElement("div");
      typingEl.className = "message ai typing";
      typingEl.id = "typing-indicator";
      typingEl.innerHTML = `<div class="bubble">...</div>`;
      this.messagesEl.appendChild(typingEl);
      if (typeof CONFIG !== "undefined" ? CONFIG.autoScroll : true) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    } else {
      this.isThinking = false;
      this.statusEl.textContent = "";
      this.statusEl.className = "status";
      const typing = document.getElementById("typing-indicator");
      if (typing) typing.remove();
    }
  }

  async _toggleListening() {
    if (this.isListening) {
      this.isListening = false;
      if (this.toggleSTTBtn) this.toggleSTTBtn.textContent = "🎤";
      this.statusEl.textContent = "";
      return;
    }

    try {
      this.isListening = true;
      if (this.toggleSTTBtn) this.toggleSTTBtn.textContent = "🔴";
      this.statusEl.textContent = "Listening... (speak now)";
      this.statusEl.className = "status listening";

      const transcript = await listenForSpeech({
        onStart: () => {
          this.statusEl.textContent = "🎤 Listening...";
        },
        onResult: (text) => {
          if (this.showTranscripts) {
            this.statusEl.textContent = `Heard: "${text}"`;
          }
        },
        onEnd: () => {
          this.isListening = false;
          if (this.toggleSTTBtn) this.toggleSTTBtn.textContent = "🎤";
        },
      });

      if (transcript) {
        this._handleUserInput(transcript, { isSpeech: true });
      }
    } catch (error) {
      console.error("Speech recognition failed:", error);
      this.statusEl.textContent = "⚠️ Could not hear you. Try again or type.";
      this.isListening = false;
      if (this.toggleSTTBtn) this.toggleSTTBtn.textContent = "🎤";
    }
  }

  async _handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this._handleUserInput(text);
    this.inputEl.value = "";
  }

  async _handleUserInput(text, options = {}) {
    // Add user message
    this.addMessage(text, "user", {
      transcript: options.isSpeech ? text : null,
    });

    // Show AI is thinking
    this.showThinking(true);

    try {
      const response = await this.getAIResponse(text);
      this.showThinking(false);
      this.addMessage(response, "ai");

      if (this.onAIResponse) {
        await this.onAIResponse(text, response);
      }
    } catch (error) {
      this.showThinking(false);
      this.addMessage(
        "Sorry, I had trouble thinking. Please try again! 🙏",
        "ai",
      );
      console.error("AI response error:", error);
    }
  }

  async getAIResponse(userMessage) {
    // Default response - override in lesson-specific classes
    return `You said: "${userMessage}". I'm learning! ✨`;
  }

  async onAIResponse(userMessage, aiResponse) {
    // Override in subclasses for lesson-specific behavior
  }

  _speakMessage(text, onEnd) {
    speakText(text, {
      onEnd: () => {
        if (onEnd) onEnd();
      },
    });
  }

  clear() {
    this.messages = [];
    this.messagesEl.innerHTML = "";
    this.addMessage("Chat cleared! Ready for a fresh start. 🌟", "ai", {
      silent: true,
    });
  }

  setStatus(text, className = "") {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.className = `status ${className}`;
    }
  }

  // Expose listening toggle for external buttons
  toggleListening() {
    return this._toggleListening();
  }
}

// Export for browser
if (typeof window !== "undefined") {
  window.ConversationUI = ConversationUI;
}

// Export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ConversationUI };
}
