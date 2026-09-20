/**
 * SoundMaker — Sound recording + beat sequencing for K2/K3 music lessons.
 *
 * Handles microphone recording, sound playback, and a beat sequencer grid.
 * Optional Tone.js integration for richer music generation.
 *
 * Usage (recording):
 *   const sm = new SoundMaker();
 *   await sm.startRecording();
 *   // ... user makes sound ...
 *   const blob = await sm.stopRecording();
 *   sm.playSound(blob);
 *
 * Usage (beat sequencer):
 *   const sm = new SoundMaker();
 *   sm.setBeats(4); // 4-beat grid
 *   sm.setSoundAt(0, 'kick', kickBlob);
 *   sm.setSoundAt(1, 'clap', clapBlob);
 *   sm.setSoundAt(2, 'kick', kickBlob);
 *   sm.setSoundAt(3, 'wow', wowBlob);
 *   sm.playSequence(); // plays kick-clap-kick-wow in a loop
 */

const SoundMaker = (() => {
  const DEFAULT_TEMPO = 120; // BPM
  const DEFAULT_BEATS = 4;

  class SoundMaker {
    constructor() {
      this._mediaRecorder = null;
      this._audioChunks = [];
      this._stream = null;
      this._sounds = {}; // name -> AudioBuffer or Blob URL
      this._beatGrid = {}; // beatIndex -> { soundName, source... }
      this._beatCount = DEFAULT_BEATS;
      this._tempo = DEFAULT_TEMPO;
      this._sequencerInterval = null;
      this._currentBeat = 0;
      this._looping = false;
      this._onBeatCallback = null;
      this._enabled = true;
      this._toneReady = false;
    }

    // ---- Recording ----

    /**
     * Start recording from microphone.
     * @returns {Promise<void>}
     */
    async startRecording() {
      if (!this._enabled) return;

      try {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._audioChunks = [];
        this._mediaRecorder = new MediaRecorder(this._stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm'
        });

        this._mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this._audioChunks.push(event.data);
          }
        };

        this._mediaRecorder.start();
      } catch (err) {
        console.warn('SoundMaker: microphone access denied or unavailable', err);
        this._enabled = false;
      }
    }

    /**
     * Stop recording and return the audio blob.
     * @returns {Promise<Blob|null>}
     */
    async stopRecording() {
      if (!this._mediaRecorder || this._mediaRecorder.state === 'inactive') {
        return null;
      }

      return new Promise((resolve) => {
        this._mediaRecorder.onstop = () => {
          const blob = new Blob(this._audioChunks, { type: 'audio/webm' });
          // Release microphone
          if (this._stream) {
            this._stream.getTracks().forEach(track => track.stop());
            this._stream = null;
          }
          resolve(blob);
        };
        this._mediaRecorder.stop();
      });
    }

    /**
     * Play a recorded sound from a blob.
     * @param {Blob} blob
     * @returns {Promise<void>}
     */
    playSound(blob) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(err => {
          console.warn('SoundMaker: playback failed', err);
          URL.revokeObjectURL(url);
          resolve();
        });
      });
    }

    // ---- Sound Bank ----

    /**
     * Store a named sound for later use in the sequencer.
     * @param {string} name - e.g. 'kick', 'clap', 'wow'
     * @param {Blob} blob - the recorded audio blob
     */
    storeSound(name, blob) {
      if (this._sounds[name]) {
        URL.revokeObjectURL(this._sounds[name]);
      }
      this._sounds[name] = URL.createObjectURL(blob);
    }

    /**
     * Play a stored sound by name.
     * @param {string} name
     */
    playStored(name) {
      const url = this._sounds[name];
      if (!url) return;
      const audio = new Audio(url);
      audio.play().catch(err => console.warn('SoundMaker: stored sound playback failed', err));
    }

    // ---- Beat Sequencer ----

    /**
     * Configure the beat grid.
     * @param {number} beatCount - 4 or 8 beats
     * @param {number} tempo - BPM, default 120
     */
    setBeats(beatCount, tempo = DEFAULT_TEMPO) {
      this._beatCount = beatCount;
      this._tempo = tempo;
      this._beatGrid = {};
      this._currentBeat = 0;
    }

    /**
     * Place a sound on a specific beat.
     * @param {number} beatIndex - 0-based beat position
     * @param {string} soundName - name of stored sound
     * @param {Blob} [blob] - if sound not yet stored, provide the blob
     */
    setSoundAt(beatIndex, soundName, blob) {
      if (blob) {
        this.storeSound(soundName, blob);
      }
      if (!this._beatGrid[beatIndex]) {
        this._beatGrid[beatIndex] = [];
      }
      // Prevent duplicate same-sound on same beat
      if (!this._beatGrid[beatIndex].find(s => s === soundName)) {
        this._beatGrid[beatIndex].push(soundName);
      }
    }

    /**
     * Remove a sound from a specific beat.
     * @param {number} beatIndex
     * @param {string} soundName
     */
    removeSoundAt(beatIndex, soundName) {
      if (this._beatGrid[beatIndex]) {
        this._beatGrid[beatIndex] = this._beatGrid[beatIndex].filter(s => s !== soundName);
      }
    }

    /**
     * Set callback for beat changes (for UI synchronization).
     * @param {function(number)} callback - receives current beat index
     */
    onBeat(callback) {
      this._onBeatCallback = callback;
    }

    /**
     * Play one cycle of the sequence.
     * @returns {Promise<void>}
     */
    async playSequence() {
      const beatDuration = 60000 / this._tempo;
      const totalBeats = this._beatCount;

      for (let i = 0; i < totalBeats; i++) {
        this._currentBeat = i;
        if (this._onBeatCallback) {
          this._onBeatCallback(i);
        }

        // Play sounds on this beat
        const sounds = this._beatGrid[i] || [];
        for (const name of sounds) {
          this.playStored(name);
        }

        await this._sleep(beatDuration);
      }

      this._currentBeat = 0;
      if (this._onBeatCallback) {
        this._onBeatCallback(-1); // signal sequence end
      }
    }

    /**
     * Start looping the sequence.
     */
    startLooping() {
      if (this._looping) return;
      this._looping = true;
      const beatDuration = 60000 / this._tempo;

      this._sequencerInterval = setInterval(() => {
        const sounds = this._beatGrid[this._currentBeat] || [];
        for (const name of sounds) {
          this.playStored(name);
        }

        if (this._onBeatCallback) {
          this._onBeatCallback(this._currentBeat);
        }

        this._currentBeat = (this._currentBeat + 1) % this._beatCount;
      }, beatDuration);
    }

    /**
     * Stop looping.
     */
    stopLooping() {
      this._looping = false;
      if (this._sequencerInterval) {
        clearInterval(this._sequencerInterval);
        this._sequencerInterval = null;
      }
      this._currentBeat = 0;
      if (this._onBeatCallback) {
        this._onBeatCallback(-1);
      }
    }

    /**
     * Export the beat grid as a serializable object.
     * @returns {object}
     */
    exportBeatGrid() {
      return {
        beatCount: this._beatCount,
        tempo: this._tempo,
        grid: this._beatGrid,
        soundNames: Object.keys(this._sounds)
      };
    }

    /**
     * Load a previously exported beat grid.
     * @param {object} data
     */
    importBeatGrid(data) {
      this._beatCount = data.beatCount || DEFAULT_BEATS;
      this._tempo = data.tempo || DEFAULT_TEMPO;
      this._beatGrid = data.grid || {};
      this._currentBeat = 0;
    }

    /**
     * Generate a simple melody using Web Audio API oscillators.
     * Useful as a fallback when no sounds have been recorded.
     * @param {string} pattern - 'ascending', 'descending', 'random'
     * @param {number} noteCount - number of notes
     * @returns {Promise<void>}
     */
    async generateMelody(pattern = 'ascending', noteCount = 8) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const frequencies = {
        ascending: [262, 294, 330, 349, 392, 440, 494, 523], // C major scale
        descending: [523, 494, 440, 392, 349, 330, 294, 262],
        random: null
      };

      let notes;
      if (pattern === 'random') {
        const baseFreqs = [262, 294, 330, 349, 392, 440, 494, 523];
        notes = Array.from({ length: noteCount }, () =>
          baseFreqs[Math.floor(Math.random() * baseFreqs.length)]
        );
      } else {
        notes = frequencies[pattern].slice(0, noteCount);
      }

      const beatDuration = 60000 / this._tempo;

      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = notes[i];
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + beatDuration / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + beatDuration / 1000);

        if (this._onBeatCallback) {
          this._onBeatCallback(i);
        }

        await this._sleep(beatDuration);
      }

      ctx.close();
    }

    // ---- Cleanup ----

    destroy() {
      this.stopLooping();
      // Revoke all object URLs
      for (const url of Object.values(this._sounds)) {
        URL.revokeObjectURL(url);
      }
      this._sounds = {};
      this._beatGrid = {};
      this._enabled = false;
    }

    // ---- Private ----

    _sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  return SoundMaker;
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundMaker;
}
