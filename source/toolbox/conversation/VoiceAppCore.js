/**
 * VoiceAppCore.js - Unified audio pipeline, WebLLM controller, and VAD gatekeeper.
 */
// import * as webllm from "https://esm.run"; google's proposal
// Using esm.sh (Recommended for stability)
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// OR using unpkg
// import * as webllm from "https://unpkg.com/@mlc-ai/web-llm/dist/index.js";

/**
 * VoiceAppCore.js - Real-time Voice Architecture with Custom Model Overrides.
 */

export class VoiceAppCore {
  constructor(config = {}) {
    this.modelId = config.modelId || "Qwen3-0.6B-q4f16_1-MLC";
    this.onStateChange = config.onStateChange || (() => {});
    this.onTranscription = config.onTranscription || (() => {});
    this.onAiOutput = config.onAiOutput || (() => {});

    this.engine = null;
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.micStream = null;

    this.conversationHistory = [];
    this.isAiSpeaking = false;
    this.isUserSpeaking = false;
    this.isGenerationActive = false;
    this.abortController = null;

    // VAD Configuration Constants
    this.vadThreshold = config.vadThreshold || 0.015;
    this.eouSilenceDuration = config.eouSilenceDuration || 800;
    this.lastAudioVolumeTime = Date.now();
    this.lastUserTranscript = null;

    // AppConfig Mapping Registry for WebLLM custom loading overrides
    this.appConfig = {
      model_list: [
        {
          model: "https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC",
          model_id: "Qwen3-0.6B-q4f16_1-MLC",
          model_lib:
            webllm.modelLibURLPrefix +
            webllm.modelVersion +
            "/Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm",
          vram_required_MB: 1200.0,
          low_resource_required: true,
          overrides: { context_window_size: 4096 },
        },
        {
          model:
            "https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC",
          model_id: "Qwen3.5-0.8B-q4f16_1-MLC",
          model_lib:
            webllm.modelLibURLPrefix +
            webllm.modelVersion +
            "/Qwen3.5-0.8B-q4f16_1_cs1k-webgpu.wasm",
          vram_required_MB: 1300.0,
          low_resource_required: true,
          overrides: { context_window_size: 4096 },
        },
        {
          model:
            "https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC",
          model_id: "SmolLM2-360M-Instruct-q4f16_1-MLC",
          model_lib:
            webllm.modelLibURLPrefix +
            webllm.modelVersion +
            "/SmolLM2-360M-Instruct-q4f16_1_cs1k-webgpu.wasm",
          vram_required_MB: 800.0,
          low_resource_required: true,
          overrides: { context_window_size: 2048 },
        },
        {
          model:
            "https://huggingface.co/mlc-ai/gemma3-1b-it-q4f16_1-MLC",
          model_id: "gemma3-1b-it-q4f16_1-MLC",
          model_lib:
            webllm.modelLibURLPrefix +
            webllm.modelVersion +
            "/gemma3-1b-it-q4f16_1_cs1k-webgpu.wasm",
          vram_required_MB: 711.0,
          low_resource_required: true,
          overrides: {
            context_window_size: -1,
            sliding_window_size: 512,
            attention_sink_size: 4,
            prefill_chunk_size: 512,
          },
        },
      ],
    };
  }

  async initialize() {
    this.updateState("loading", "Initializing WebLLM Engine...");

    // Build instance leveraging customized library registry definitions
    this.engine = await webllm.CreateMLCEngine(this.modelId, {
      appConfig: this.appConfig,
      initProgressCallback: (report) => {
        this.updateState(
          "loading",
          `Loading Model: ${Math.round(report.progress * 100)}%`,
        );
      },
    });

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error(
        "Native Speech Recognition API is unavailable in this environment.",
      );
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.setupSpeechRecognition();
    this.setupAudioPipeline();

    this.updateState("ready", "Voice pipeline ready.");
  }

  setupSpeechRecognition() {
    this.recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = finalTranscript || interimTranscript;
      if (activeText.trim().length > 0) {
        this.lastUserTranscript = activeText.trim();
        this.onTranscription({ text: activeText, isFinal: !!finalTranscript });

        if (this.isAiSpeaking || this.isGenerationActive) {
          this.handleBargeIn();
        }
      }
    };

    this.recognition.onerror = (err) => {
      if (err.error !== "no-speech")
        console.error("STT Pipeline Exception:", err);
    };

    this.recognition.onend = () => {
      this.recognition.start();
    };
  }

  async setupAudioPipeline() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )();
      const source = this.audioContext.createMediaStreamSource(this.micStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      this.recognition.start();
      this.monitorVAD();
    } catch (err) {
      console.error("Hardware pipeline configuration failed:", err);
      this.updateState("error", "Microphone access denied.");
    }
  }

  monitorVAD() {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const checkAudio = () => {
      this.analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0.0;
      for (const amplitude of dataArray) {
        sumSquares += amplitude * amplitude;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      if (rms > this.vadThreshold) {
        if (!this.isUserSpeaking) {
          this.isUserSpeaking = true;
          if (this.isAiSpeaking || this.isGenerationActive) {
            this.handleBargeIn();
          }
        }
        this.lastAudioVolumeTime = Date.now();
      } else {
        if (
          this.isUserSpeaking &&
          Date.now() - this.lastAudioVolumeTime > this.eouSilenceDuration
        ) {
          this.isUserSpeaking = false;
          console.log("[VAD] end-of-utterance detected, calling processUserUtterance");
          this.processUserUtterance();
        }
      }
      requestAnimationFrame(checkAudio);
    };
    requestAnimationFrame(checkAudio);
  }

  handleBargeIn() {
    console.log("Barge-in pipeline interruption invoked.");
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isGenerationActive = false;

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.isAiSpeaking = false;

    try {
      this.recognition.stop();
    } catch (e) {}

    this.updateState("interrupted", "AI Interrupted. Listening...");
  }

  async processUserUtterance() {
    console.log("[processUserUtterance] invoked, lastUserTranscript:", this.lastUserTranscript?.substring(0, 50));
    if (!this.lastUserTranscript) {
      console.log("[processUserUtterance] no transcript, skipping");
      this.updateState("ready", "Waiting for input...");
      return;
    }

    console.log("[processUserUtterance] transcript:", this.lastUserTranscript);
    console.log("[processUserUtterance] history length:", this.conversationHistory.length);

    this.updateState("processing", "AI thinking...");
    this.isGenerationActive = true;
    this.abortController = new AbortController();

    const userMessage = {
      role: "user",
      content: this.lastUserTranscript,
    };
    this.conversationHistory.push(userMessage);
    this.lastUserTranscript = null;

    try {
      const stream = await this.engine.chat.completions.create(
        {
          messages: this.conversationHistory,
          stream: true,
          temperature: 0.6,
          presence_penalty: 1.2,
          extra_body: {
            enable_thinking: false,
          },
        },
        { signal: this.abortController.signal },
      );

      console.log("[processUserUtterance] API stream started");

      let currentSentence = "";
      let fullResponseText = "";
      let chunkCount = 0;

      for await (const chunk of stream) {
        chunkCount++;
        const rawDelta = chunk.choices?.[0]?.delta;
        if (chunkCount <= 5) {
          console.log("[processUserUtterance] chunk", chunkCount, "raw delta:", JSON.stringify(rawDelta));
        }

        let content = chunk.choices?.[0]?.delta?.content || "";

        // Strip thinking or reasoning tags out dynamically
        const beforeStrip = content;
        content = content.replace(/<\/?think>/gi, "");
        if (chunkCount <= 5 && beforeStrip !== content) {
          console.log("[processUserUtterance] think stripped, before:", beforeStrip.substring(0, 80), "after:", content.substring(0, 80));
        }
        if (!content) continue;

        fullResponseText += content;
        currentSentence += content;

        this.onAiOutput({ delta: content, fullText: fullResponseText });

        if (/[.!?\n]/.test(content)) {
          this.speakTextChunk(currentSentence.trim());
          currentSentence = "";
        }
      }

      if (currentSentence.trim().length > 0) {
        this.speakTextChunk(currentSentence.trim());
      }

      this.conversationHistory.push({
        role: "assistant",
        content: fullResponseText,
      });
      this.isGenerationActive = false;
      this.updateState("ready", "Waiting for input...");
      console.log("[processUserUtterance] done, fullResponseText length:", fullResponseText.length);
    } catch (err) {
      console.error("[processUserUtterance] error:", err.name, err.message, err.stack);
      this.isGenerationActive = false;
      if (
        this.conversationHistory.length > 0 &&
        this.conversationHistory[this.conversationHistory.length - 1] ===
          userMessage
      ) {
        this.conversationHistory.pop();
      }
      if (err.name === "AbortError") {
        console.log("Active request context discarded cleanly.");
      } else {
        console.error("Execution bounds error:", err);
        this.updateState("ready", "Error processing response.");
      }
    }
  }

  speakTextChunk(text) {
    if (!text || text.length < 1) return;
    console.log("[speakTextChunk] speaking:", text.substring(0, 100));
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      this.isAiSpeaking = true;
    };
    utterance.onend = () => {
      if (!window.speechSynthesis.speaking) this.isAiSpeaking = false;
    };
    window.speechSynthesis.speak(utterance);
  }

  addUserDirectMessage(text) {
    this.conversationHistory.push({ role: "user", content: text });
  }

  updateState(status, message) {
    this.onStateChange({ status, message });
  }

  async terminate() {
    if (this.engine) {
      await this.engine.terminate();
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
    }
  }
}
