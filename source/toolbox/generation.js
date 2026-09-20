/**
 * GenerationManager — Text-to-Image & Text Generation wrapper.
 *
 * Provides a unified interface for:
 *   - Text-to-Image: Pollinations.ai (free, no key), HuggingFace Inference API,
 *     or template-based SVG compositing (offline fallback).
 *   - Text Generation: SmolLM2 via Transformers.js (on-device) or template-based
 *     responses (offline fallback).
 *
 * All generation is asynchronous. Each method returns a result object with
 * { status: 'success'|'error', data: ..., method: 'api'|'local'|'template' }.
 *
 * Usage (TTI):
 *   const gm = new GenerationManager({ ttiMethod: 'pollinations' });
 *   const result = await gm.generateImage('a red robot with square head');
 *   // result.data is a blob URL or data URL
 *
 * Usage (text gen with SmolLM2):
 *   const gm = new GenerationManager({ textMethod: 'smolm2' });
 *   await gm.loadModel(); // downloads SmolLM2-135M (~80MB) to browser
 *   const result = await gm.generateText('What is a triangle?', {
 *     systemPrompt: 'You are a friendly robot teaching shapes to a 5-year-old.'
 *   });
 */

const GenerationManager = (() => {
  // Template responses for offline text generation (no model needed)
  const DEFAULT_TEMPLATES = {
    greeting: [
      'Hello! I am ready to learn with you.',
      'Hi there! What would you like to teach me today?'
    ],
    ask_shape: [
      'That looks like a wonderful drawing! Can you tell me what shape it is?',
      'I see your drawing! What did you draw?'
    ],
    celebrate: [
      'Great job! You are teaching me so well!',
      'Amazing! I am learning so much from you!'
    ],
    nudge_back: [
      'Let us get back to our shapes! Can you draw me something?',
      'That is interesting! Now, can you show me another shape?'
    ]
  };

  // Pre-defined SVG component library for offline image compositing
  const SVG_COMPONENTS = {
    shapes: {
      circle: '<circle cx="100" cy="100" r="60" fill="{color}" />',
      square: '<rect x="40" y="40" width="120" height="120" fill="{color}" rx="8" />',
      triangle: '<polygon points="100,30 170,150 30,150" fill="{color}" />',
      heart: '<path d="M100,160 C40,120 0,80 0,40 C0,0 40,-20 60,0 C80,-20 120,0 120,40 C120,80 80,120 20,160 L100,180 L180,160 C120,120 80,80 80,40 C80,0 120,-20 140,0 C160,-20 200,0 200,40 C200,80 160,120 100,160Z" fill="{color}" />',
      star: '<polygon points="100,10 118,65 176,65 128,98 146,155 100,120 54,155 72,98 24,65 82,65" fill="{color}" />'
    },
    faces: {
      happy: '<circle cx="100" cy="100" r="80" fill="{color}" /><circle cx="70" cy="85" r="8" fill="#333" /><circle cx="130" cy="85" r="8" fill="#333" /><path d="M65,110 Q100,150 135,110" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" />',
      sad: '<circle cx="100" cy="100" r="80" fill="{color}" /><circle cx="70" cy="85" r="8" fill="#333" /><circle cx="130" cy="85" r="8" fill="#333" /><path d="M65,130 Q100,95 135,130" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" />',
      angry: '<circle cx="100" cy="100" r="80" fill="{color}" /><circle cx="70" cy="85" r="8" fill="#333" /><circle cx="130" cy="85" r="8" fill="#333" /><path d="M65,130 Q100,110 135,130" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" /><line x1="55" y1="70" x2="80" y2="80" stroke="#333" stroke-width="4" stroke-linecap="round" /><line x1="145" y1="70" x2="120" y2="80" stroke="#333" stroke-width="4" stroke-linecap="round" />'
    },
    robots: {
      basic: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220"><rect x="40" y="30" width="120" height="100" rx="20" fill="{color}" /><circle cx="75" cy="65" r="12" fill="white" /><circle cx="125" cy="65" r="12" fill="white" /><circle cx="75" cy="65" r="6" fill="#333" /><circle cx="125" cy="65" r="6" fill="#333" /><rect x="80" y="85" width="40" height="6" rx="3" fill="#333" /><rect x="80" y="100" width="40" height="6" rx="3" fill="#333" /><rect x="75" y="105" width="50" height="6" rx="3" fill="#333" /><line x1="100" y1="25" x2="100" y2="10" stroke="{color}" stroke-width="3" stroke-linecap="round" /><circle cx="100" cy="7" r="5" fill="#ff6666" /><rect x="60" y="130" width="15" height="60" rx="6" fill="{color}" /><rect x="125" y="130" width="15" height="60" rx="6" fill="{color}" /><rect x="15" y="60" width="25" height="50" rx="8" fill="{color}" /><rect x="160" y="60" width="25" height="50" rx="8" fill="{color}" /></svg>'
    }
  };

  class GenerationManager {
    constructor(options = {}) {
      this._ttiMethod = options.ttiMethod || 'pollinations'; // 'pollinations', 'huggingface', 'svg', 'none'
      this._textMethod = options.textMethod || 'template'; // 'smolm2', 'template'
      this._hfToken = options.huggingfaceToken || null;
      this._textPipeline = null;
      this._modelLoaded = false;
      this._modelProgress = 0;
      this._onProgress = options.onProgress || null;
      this._templates = { ...DEFAULT_TEMPLATES, ...(options.templates || {}) };
    }

    // ---- Model Loading ----

    /**
     * Load SmolLM2 model into browser via Transformers.js.
     * Reports progress via _onProgress callback.
     * @returns {Promise<boolean>}
     */
    async loadModel() {
      if (this._modelLoaded) return true;

      try {
        const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js');

        this._textPipeline = await pipeline(
          'text-generation',
          'HuggingFaceTB/SmolLM2-135M-Instruct',
          {
            progress_callback: (progress) => {
              this._modelProgress = progress.progress || 0;
              if (this._onProgress) {
                this._onProgress({
                  status: 'loading',
                  progress: this._modelProgress,
                  file: progress.file || ''
                });
              }
            }
          }
        );

        this._modelLoaded = true;
        if (this._onProgress) {
          this._onProgress({ status: 'ready', progress: 1 });
        }
        return true;
      } catch (err) {
        console.warn('GenerationManager: SmolLM2 failed to load', err);
        this._modelLoaded = false;
        return false;
      }
    }

    get modelProgress() { return this._modelProgress; }
    get isModelReady() { return this._modelLoaded; }

    // ---- Text-to-Image ----

    /**
     * Generate an image from a text prompt.
     * @param {string} prompt - description of the image to generate
     * @param {object} [options]
     * @param {number} [options.width] - image width (for API methods)
     * @param {number} [options.height] - image height (for API methods)
     * @returns {Promise<{status: string, data: string|null, method: string, error?: string}>}
     */
    async generateImage(prompt, options = {}) {
      switch (this._ttiMethod) {
        case 'pollinations':
          return this._generatePollinations(prompt, options);
        case 'huggingface':
          return this._generateHuggingFace(prompt, options);
        case 'svg':
          return this._generateSVG(prompt, options);
        default:
          return { status: 'error', data: null, method: 'none', error: 'No TTI method configured' };
      }
    }

    /**
     * Generate using Pollinations.ai free API.
     */
    async _generatePollinations(prompt, options = {}) {
      try {
        const encoded = encodeURIComponent(prompt);
        const width = options.width || 512;
        const height = options.height || 512;
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        const dataUrl = URL.createObjectURL(blob);

        return { status: 'success', data: dataUrl, method: 'pollinations' };
      } catch (err) {
        console.warn('GenerationManager: Pollinations.ai failed', err);
        // Fall back to SVG if available
        if (this._ttiMethod === 'pollinations') {
          return this._generateSVG(prompt, options);
        }
        return { status: 'error', data: null, method: 'pollinations', error: err.message };
      }
    }

    /**
     * Generate using HuggingFace Inference API.
     */
    async _generateHuggingFace(prompt, options = {}) {
      if (!this._hfToken) {
        return { status: 'error', data: null, method: 'huggingface', error: 'No HuggingFace token configured' };
      }

      try {
        const response = await fetch(
          'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this._hfToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                width: options.width || 512,
                height: options.height || 512
              }
            })
          }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        const dataUrl = URL.createObjectURL(blob);

        return { status: 'success', data: dataUrl, method: 'huggingface' };
      } catch (err) {
        console.warn('GenerationManager: HuggingFace API failed', err);
        return this._generateSVG(prompt, options);
      }
    }

    /**
     * Generate using SVG component compositing (offline fallback).
     * Parses prompt for known keywords and assembles SVG.
     */
    _generateSVG(prompt, options = {}) {
      const lower = prompt.toLowerCase();
      const color = this._extractColor(lower) || '#6B7FD6';

      // Try robot
      if (lower.includes('robot')) {
        const svg = SVG_COMPONENTS.robots.basic.replace(/\{color\}/g, color);
        const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
        return { status: 'success', data: dataUrl, method: 'svg' };
      }

      // Try faces
      if (lower.includes('happy') || lower.includes('smile')) {
        const svg = SVG_COMPONENTS.faces.happy.replace('{color}', color);
        const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
        return { status: 'success', data: dataUrl, method: 'svg' };
      }
      if (lower.includes('sad')) {
        const svg = SVG_COMPONENTS.faces.sad.replace('{color}', color);
        const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
        return { status: 'success', data: dataUrl, method: 'svg' };
      }
      if (lower.includes('angry')) {
        const svg = SVG_COMPONENTS.faces.angry.replace('{color}', color);
        const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
        return { status: 'success', data: dataUrl, method: 'svg' };
      }

      // Try shapes
      for (const [shape, template] of Object.entries(SVG_COMPONENTS.shapes)) {
        if (lower.includes(shape)) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${template.replace('{color}', color)}</svg>`;
          const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
          return { status: 'success', data: dataUrl, method: 'svg' };
        }
      }

      // Generic fallback: colored circle
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${SVG_COMPONENTS.shapes.circle.replace('{color}', color)}</svg>`;
      const dataUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
      return { status: 'success', data: dataUrl, method: 'svg' };
    }

    // ---- Text Generation ----

    /**
     * Generate text from a prompt.
     * @param {string} prompt - user message
     * @param {object} [options]
     * @param {string} [options.systemPrompt] - system-level instruction
     * @param {number} [options.maxTokens] - max new tokens (default 50)
     * @returns {Promise<{status: string, data: string|null, method: string}>}
     */
    async generateText(prompt, options = {}) {
      if (this._textMethod === 'smolm2' && this._modelLoaded) {
        return this._generateSmolLM2(prompt, options);
      }
      return this._generateTemplate(prompt, options);
    }

    /**
     * Generate using SmolLM2 on-device.
     */
    async _generateSmolLM2(prompt, options = {}) {
      try {
        const messages = [
          { role: 'system', content: options.systemPrompt || 'You are a friendly AI teaching assistant for children aged 4-12. Keep responses under 25 words. Be encouraging.' },
          { role: 'user', content: prompt }
        ];

        const maxTokens = options.maxTokens || 50;
        const result = await this._textPipeline(messages, {
          max_new_tokens: maxTokens,
          temperature: 0.3,
          do_sample: true
        });

        const text = result[0].generated_text;
        // Extract just the assistant's response from the chat format
        const assistantMessage = text.at(-1)?.content || text;

        return { status: 'success', data: assistantMessage, method: 'smolm2' };
      } catch (err) {
        console.warn('GenerationManager: SmolLM2 generation failed', err);
        return this._generateTemplate(prompt, options);
      }
    }

    /**
     * Generate using template-based responses (offline).
     * Matches prompt keywords to template categories.
     */
    _generateTemplate(prompt, options = {}) {
      const lower = prompt.toLowerCase();

      // Intent matching
      let category = 'nudge_back';
      if (lower.includes('hello') || lower.includes('hi ') || lower.includes('hey')) {
        category = 'greeting';
      } else if (lower.includes('what') && (lower.includes('this') || lower.includes('shape') || lower.includes('draw'))) {
        category = 'ask_shape';
      } else if (lower.includes('good') || lower.includes('great') || lower.includes('yay')) {
        category = 'celebrate';
      }

      const templates = this._templates[category] || this._templates['nudge_back'];
      const response = templates[Math.floor(Math.random() * templates.length)];

      return { status: 'success', data: response, method: 'template' };
    }

    /**
     * Load custom templates.
     * @param {object} templates - { category: string[] }
     */
    setTemplates(templates) {
      this._templates = { ...this._templates, ...templates };
    }

    // ---- Helpers ----

    _extractColor(text) {
      const colors = {
        red: '#E74C3C', blue: '#3498DB', yellow: '#F1C40F',
        green: '#2ECC71', orange: '#E67E22', purple: '#9B59B6',
        pink: '#FD79A8', black: '#2C3E50', white: '#ECF0F1'
      };
      for (const [name, hex] of Object.entries(colors)) {
        if (text.includes(name)) return hex;
      }
      return null;
    }

    destroy() {
      this._textPipeline = null;
      this._modelLoaded = false;
    }
  }

  return GenerationManager;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GenerationManager;
}
