# My Own Instrument — Game Plan

## 1. Game Overview

| Field | Value |
|---|---|
| **Track** | Kindergarten |
| **Band** | K3 (age 5-6) |
| **Lesson** | 07 — My Own Instrument |
| **Source** | `source/kindergarten/k3-07-my-own-instrument/lesson.md` |
| **Game ID** | `k3-07-my-own-instrument` |
| **Entry Point** | `games/kindergarten/k3-07-my-own-instrument/index.html` |
| **Tech Stack** | Vanilla HTML/CSS/JS, MediaRecorder API, Web Audio API, Web Speech API (TTS) |
| **Architecture** | Self-contained single-page game, no dependencies, all in one HTML file |
| **Target Age** | K3 (5-6 years old) |
| **Tools Referenced** | soundmaker.js (recording + beat grid + melody), Web Speech API TTS |

**Brief Description:** Children build their own "instrument" by recording 5 unique sounds (voice, clap, stomp, tap, whistle), then arrange them onto an 8-beat sequencer grid to compose a song. The AI analyzes the arrangement and generates a complementary melody using oscillators. The arc teaches that AI can learn from examples and create new things.

## 2. Narrative Arc

The arc follows **"AI doesn't know → learns from examples → generalizes → demonstrates"** across three acts:

### Act 1 — Teaching the AI (Part A, ~8 min)

1. **AI doesn't know:** "I don't know what an instrument is yet! Can you teach me by making sounds?"
2. Child is prompted to record sound #1: "Make a sound with your voice!" — child records (e.g., "la la la")
3. Sound icon appears on screen with a label. AI reacts: "Ooh! That's a sound! Let's give it a name."
4. Child names the sound (voice prompt: "What should we call this?") or picks from suggestions (La-la, Clap, Boom, Ding, Whoosh, Tap)
5. Repeat for 5 sounds total: voice, clap hands, stomp feet, tap table, whistle/blow raspberry
6. **AI learns:** After recording all 5, AI says: "Now I know your instrument! It has 5 different sounds: La-la, Clap, Stomp, Tap, and Whoosh!"
7. Each sound gets a colored circle icon on the sound bank

### Act 2 — Building a Song (Part B, ~7 min)

8. 8-beat grid appears as a 5×8 matrix (5 sound rows × 8 columns)
9. AI: "Now let's make a song! Tap the beats to place your sounds!"
10. Child taps cells to place sounds on the grid (fill squares light up)
11. Play button loops the arrangement — beats highlight in time
12. AI gives feedback: "I like that pattern! The clap comes after every two la-las!"
13. Child can rearrange, clear, and replay
14. AI builds internal analysis of the pattern (frequency of each sound, common pairs, rhythm density)

### Act 3 — AI Generates a Melody (Part C, ~10 min)

15. AI: "I've been listening to your song! Now let me show you what I learned..."
16. AI generates a melody using oscillators that complements the child's rhythm
17. Melody plays over the beat sequence — both layers together
18. AI: "I learned your rhythm and added my own tune on top! We made music together!"
19. Celebration: confetti + "You taught AI about your instrument, and together you made a song!"
20. Optional replay: child can modify the grid and ask AI to generate again

## 3. Activity Flow

### Part A — Sound Recording (~8 min)

```
[Start Screen] → [Part A Intro: "Make a sound!"]
  → [Record #1: voice sound] → [Name the sound] → [Sound icon created]
  → [Repeat for sounds #2-5: clap, stomp, tap, whistle/blow]
  → [Sound bank complete: 5 icons visible] → [Transition to Part B]
```

**Transitions:**
- Each sound: Record → Listen → Name → Next (auto-advance after naming, 2s delay)
- After all 5: "Your instrument is ready! Now let's make a song!" auto-advance with countdown 3-2-1

**Detailed flow:**
1. AI: "Let's build your instrument! I need you to make 5 sounds. Ready for sound #1?"
2. Large round mic button appears, pulsing gently. Text: "Make a sound with your voice!"
3. Child taps mic → recording starts (red pulsing ring, 3-second countdown bar)
4. Child makes sound → recording stops automatically after 3s
5. Playback button appears: child can listen to their recording
6. If child likes it: "Keep it!" button. If not: "Try again" → re-record
7. Naming step: AI asks "What should we call this sound?" with suggestion buttons: [La-la] [Clap] [Boom] [Ding] [Whoosh] [Tap]
8. Sound icon (colored circle with letter) gets labeled and added to sound bank
9. Repeat for sounds #2-5 with different prompts:
   - #2 "Clap your hands!" → name
   - #3 "Stomp your feet!" → name
   - #4 "Tap the table!" → name
   - #5 "Make a funny sound!" → name (whistle, raspberry, etc.)

### Part B — Beat Sequencer (~7 min)

```
[Grid appears: 5 rows × 8 columns] → [AI explains grid]
  → [Child taps cells to place sounds] → [Press Play to hear]
  → [Refine arrangement] → [AI gives pattern feedback]
  → [Lock in final song] → [Transition to Part C]
```

**Detailed flow:**
1. Scene transitions: sound bank shrinks to left sidebar, grid takes center stage
2. AI: "Now place your sounds on the beat grid! Tap a square to add a sound there."
3. Grid has 5 rows (one per sound, labeled with icon + name) × 8 columns (beats 1-8 numbered above)
4. Child taps empty cell → cell fills with sound's color + icon
5. Child taps filled cell → cell empties (toggle behavior)
6. Row labels show sound icon + name on the left
7. Play button (large triangle, bottom center) plays the 8-beat loop
8. Playing beat highlights columns in sequence (green glow on active column)
9. Stop button stops playback
10. Clear button resets grid
11. AI watches: after each playthrough, gives one of several feedback phrases
12. After 2+ playthroughs: "Let's lock in your song!" button appears
13. Child taps → song is "locked" → transition to Part C

### Part C — AI Melody Generation (~10 min)

```
[Beat locks in] → [AI processes pattern] → [Loading spinner: "AI is composing..."]
  → [Melody plays over beat] → [Child listens]
  → [Celebration] → [Optional: modify and regenerate]
```

**Detailed flow:**
1. AI: "You made a great song! Now I want to add my own melody on top. Gimme a sec..."
2. Loading animation: sound waves visualizing (not a spinner, but musical notes bouncing)
3. AI analyzes the beat arrangement to determine:
   - Tempo (from beat density)
   - Mood (from which sounds are used most)
   - Scale (major for high-energy, pentatonic for mixed, minor for sparse)
4. AI generates 8 notes using oscillators, timed to complement the beat
5. Both layers play: child's recorded sounds (loop) + AI melody (oscillators) on top
6. AI: "Ta-da! We made music together! You taught me your instrument, and I made a melody!"
7. Confetti burst + celebratory screen
8. "Play together again!" button → back to Part B grid (modify) → regenerate Part C
9. "Start over" → back to Part A

## 4. Multi-Modal Interaction Design

### Channel Map

| Action | Input Mode | Output Mode | Notes |
|---|---|---|---|
| Record sound | Tap mic button + make noise | Visual (recording animation) + playback | Recording is primary action |
| Name sound | Tap suggestion button OR voice | Visual (label appears) + TTS | Dual-mode: tap preferred (K3 typing is hard) |
| Place sound on grid | Finger tap on cell | Visual (cell fills + icon) + optional sound preview | Tap is primary, no drag needed |
| Play sequence | Tap Play button | Audio (looped sequence) + visual (beat highlight) | Two-channel output |
| AI feedback | — | TTS + text bubble + visual (beat highlight) | Always dual-channel |
| AI melody | — | Oscillator tones + beat loop + visual | Three-channel: audio + visuals + TTS |

### Concurrency Rules
- **Never play TTS during recording** (would capture AI voice in recording)
- TTS pauses between sentences: 1.5s gap for processing
- Text bubble persists for 3s after TTS ends
- Beat playback can be interrupted by Stop button at any time
- Voice naming is optional — always have tap buttons as default
- Recording takes microphone priority — disable TTS during recording

### Recording Input Design
- Mic button: 100px diameter circle, center of screen during recording phase
- Recording duration: 3 seconds (countdown bar, not timer text)
- Visual feedback: pulsing ring that grows during recording
- Audio waveform visualization during recording (optional, simple bars)
- Automatic stop after 3s OR tap to stop early
- Playback button appears immediately after recording stops
- "Keep it" / "Try again" buttons: 80px height, distinct colors

### Beat Grid Design
- 5 rows × 8 columns grid
- Each cell: 56×56px minimum (K3 finger-safe)
- 8px gap between cells
- Row labels: 44px wide, show colored circle + abbreviated name
- Column numbers: centered above each column
- Toggle behavior: tap to add, tap again to remove
- Filled cell: solid color with subtle inner shadow
- Empty cell: light gray outline, transparent fill
- Active column (during playback): bright glow, 200ms ahead indicator

## 5. Technical Approach

### Recording System

```javascript
class SoundRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
  }

  async requestMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      return false;
    }
  }

  startRecording() {
    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stopRecording() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  playBlob(blob) {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  }

  release() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
  }
}
```

- **Auto-stop timer:** 3 seconds via `setTimeout` tied to `stopRecording()`
- **Visual countdown:** CSS transition on a circular progress ring (stroke-dashoffset animation, 3s)
- **Re-recording:** call `startRecording()` again — previous blob discarded
- **Sound storage:** `Map<string, Blob>` — 5 entries max, keyed by sound name
- **Blob URLs revoked** on game restart or sound replacement

### Beat Sequencer Grid

```javascript
class BeatSequencer {
  constructor(soundCount = 5, beatCount = 8) {
    this.sounds = [];        // [{name, blob, color, icon}]
    this.grid = [];          // 2D array [soundIndex][beatIndex] = bool
    this.beatCount = beatCount;
    this.isPlaying = false;
    this.currentBeat = -1;
    this.tempo = 120;
    this.onBeatChange = null;
    this.onComplete = null;
  }

  // Initialize empty grid
  init() {
    this.grid = Array.from({ length: this.sounds.length },
      () => Array(this.beatCount).fill(false));
  }

  // Toggle a cell
  toggle(soundIndex, beatIndex) {
    this.grid[soundIndex][beatIndex] = !this.grid[soundIndex][beatIndex];
  }

  // Play the sequence in a loop
  async startLoop() {
    this.isPlaying = true;
    const beatMs = 60000 / this.tempo;

    while (this.isPlaying) {
      for (let b = 0; b < this.beatCount; b++) {
        if (!this.isPlaying) break;
        this.currentBeat = b;
        if (this.onBeatChange) this.onBeatChange(b);

        // Play all sounds on this beat
        for (let s = 0; s < this.sounds.length; s++) {
          if (this.grid[s][b]) {
            this.playSound(s);
          }
        }

        await this._sleep(beatMs);
      }
    }

    this.currentBeat = -1;
    if (this.onBeatChange) this.onBeatChange(-1);
    if (this.onComplete) this.onComplete();
  }

  stop() {
    this.isPlaying = false;
  }

  playSound(soundIndex) {
    const blob = this.sounds[soundIndex].blob;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  }

  // Analyze pattern for AI melody generation
  analyzePattern() {
    let density = 0;
    let count = 0;
    for (let s = 0; s < this.sounds.length; s++) {
      for (let b = 0; b < this.beatCount; b++) {
        if (this.grid[s][b]) { density++; count++; }
      }
    }
    density = density / (this.sounds.length * this.beatCount);

    // Per-sound frequency
    const frequencies = this.sounds.map((_, s) => {
      let c = 0;
      for (let b = 0; b < this.beatCount; b++) {
        if (this.grid[s][b]) c++;
      }
      return c;
    });

    // Common pairs: which sounds often appear on same beat
    const pairs = {};
    for (let b = 0; b < this.beatCount; b++) {
      const active = [];
      for (let s = 0; s < this.sounds.length; s++) {
        if (this.grid[s][b]) active.push(s);
      }
      for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
          const key = `${Math.min(active[i], active[j])}-${Math.max(active[i], active[j])}`;
          pairs[key] = (pairs[key] || 0) + 1;
        }
      }
    }

    return { density, frequencies, pairs };
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
```

**Grid rendering (HTML/CSS):**
```html
<div class="sequencer-grid">
  <!-- Column headers -->
  <div class="col-headers">
    <span class="col-spacer"></span>
    <span class="col-num">1</span> ... <span class="col-num">8</span>
  </div>
  <!-- 5 rows -->
  <div class="row" data-sound="0">
    <span class="row-label">
      <span class="sound-dot" style="background:#FF6B6B"></span>
      <span class="sound-name">La-la</span>
    </span>
    <button class="cell" data-beat="0"></button> ... ×8
  </div>
  ... ×5 rows
</div>
```

CSS:
- `.cell`: 56×56px, border-radius 8px, border 2px solid #CCC, background transparent
- `.cell.filled`: background var(--sound-color), box-shadow inset 0 2px 4px rgba(0,0,0,0.2)
- `.cell.active`: outline 3px solid #FFD700, transform scale(1.1)
- `.row`: display flex, align-items center, gap 8px
- Transition: background 150ms, transform 100ms

### Melody Generation

```javascript
class MelodyGenerator {
  constructor(tempo = 120) {
    this.tempo = tempo;
    this.ctx = null;
  }

  // Generate melody based on pattern analysis
  generate(beatDensity, soundCount) {
    const beatMs = 60000 / this.tempo;

    // Choose scale based on density
    // High density (>0.4): major, lively
    // Medium (0.2-0.4): pentatonic, balanced
    // Low (<0.2): minor, soft
    const scales = {
      major:      [262, 294, 330, 349, 392, 440, 494, 523],
      pentatonic: [262, 294, 330, 392, 440, 523, 587, 659],
      minor:      [262, 277, 311, 349, 392, 415, 466, 523],
      lively:     [330, 392, 440, 523, 587, 659, 784, 880]
    };

    let scale;
    if (beatDensity > 0.4) {
      scale = soundCount >= 4 ? scales.lively : scales.major;
    } else if (beatDensity > 0.2) {
      scale = scales.pentatonic;
    } else {
      scale = scales.minor;
    }

    // Generate 8 notes with rhythmic variety
    // Alternate between scale degrees, repeat some for cohesion
    return this._composeNotes(scale, 8, beatDensity);
  }

  _composeNotes(scale, count, density) {
    const notes = [];
    let lastIdx = -1;

    for (let i = 0; i < count; i++) {
      // Pick a note preferring variety
      let idx;
      do {
        idx = Math.floor(Math.random() * scale.length);
      } while (idx === lastIdx && scale.length > 1);

      // Occasionally repeat for musicality (30% chance on non-first)
      if (i > 0 && Math.random() < 0.3 && notes.length >= 1) {
        idx = scale.indexOf(notes[i - 1]);
      }

      notes.push(scale[idx]);
      lastIdx = idx;
    }

    return notes;
  }

  async play(notes, onBeat) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beatDuration = 60000 / this.tempo;
    const gain = 0.3;

    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle'; // warmer than sine, less harsh than square
      osc.frequency.value = notes[i];

      gainNode.gain.setValueAtTime(gain, this.ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01,
        this.ctx.currentTime + (beatDuration / 1000) * 0.9);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime);
      osc.stop(this.ctx.currentTime + (beatDuration / 1000) * 0.8);

      if (onBeat) onBeat(i);

      await this._sleep(beatDuration);
    }
  }

  stop() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
```

**Key melody design decisions:**
- Triangle wave (warmer than sine, less harsh than square or sawtooth)
- Volume: 0.3 (complement, don't overpower recorded sounds)
- Oscillator envelope: attack 0ms, decay 90% of beat duration
- Note selection: prefer variety (same note rarely twice in a row) with 30% repetition for musicality
- Tempo matches the sequencer's BPM exactly
- Scale chosen by beat density analysis

### State Machine

```
INIT → MIC_CHECK → RECORD_1 → NAME_1 → RECORD_2 → NAME_2 → RECORD_3 → NAME_3
  → RECORD_4 → NAME_4 → RECORD_5 → NAME_5 → SOUND_BANK_COMPLETE
  → SEQUENCER_INTRO → SEQUENCER_EDIT → SEQUENCER_PLAY
  → [loop edit/play until 2+ plays] → LOCK_SONG
  → AI_COMPOSING → AI_PLAYING → CELEBRATION
  → [optional: MODIFY_AGAIN → SEQUENCER_EDIT → ... → AI_COMPOSING]
```

**State transitions:**

| From | Trigger | To |
|---|---|---|
| INIT | Page load complete | MIC_CHECK |
| MIC_CHECK | Mic permission granted | RECORD_1 |
| MIC_CHECK | Mic denied | MIC_CHECK (show retry, then offline mode) |
| RECORD_N | Recording complete / 3s timeout | PLAYBACK_N |
| PLAYBACK_N | "Keep it" tapped | NAME_N |
| PLAYBACK_N | "Try again" tapped | RECORD_N |
| NAME_N | Name selected / typed | (if N<5) RECORD_N+1 else SOUND_BANK_COMPLETE |
| SOUND_BANK_COMPLETE | 3s auto-transition | SEQUENCER_INTRO |
| SEQUENCER_INTRO | AI narration complete | SEQUENCER_EDIT |
| SEQUENCER_EDIT | Tap cell | SEQUENCER_EDIT (same state, toggles cell) |
| SEQUENCER_EDIT | Play tapped | SEQUENCER_PLAY |
| SEQUENCER_PLAY | Stop tapped / sequence ended | SEQUENCER_EDIT |
| SEQUENCER_EDIT | Lock tapped (playCount >= 2) | LOCK_SONG |
| LOCK_SONG | Lock animation complete | AI_COMPOSING |
| AI_COMPOSING | AI analysis + generation done | AI_PLAYING |
| AI_PLAYING | Melody + beat loop ends | CELEBRATION |
| CELEBRATION | "Play together again!" | SEQUENCER_EDIT |
| CELEBRATION | "Start over" | INIT |

### Web Speech API (TTS)

```javascript
function speak(text, onEnd) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 1.15;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.includes('Samantha') || v.name.includes('Google UK') || v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;
  if (onEnd) utterance.onend = onEnd;
  speechSynthesis.speak(utterance);
}
```

### Timer / Countdown for Recording

```javascript
class RecordTimer {
  constructor(duration = 3000) {
    this.duration = duration;
    this.startTime = 0;
    this.timerId = null;
    this.onTick = null;
    this.onComplete = null;
  }

  start() {
    this.startTime = Date.now();
    this.timerId = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const remaining = Math.max(0, this.duration - elapsed);
      const progress = elapsed / this.duration;
      if (this.onTick) this.onTick(progress, remaining);

      if (elapsed >= this.duration) {
        this.stop();
        if (this.onComplete) this.onComplete();
      }
    }, 50); // 20fps for smooth progress bar
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
```

Displayed as an SVG arc progress ring:
```html
<svg viewBox="0 0 120 120" class="recording-ring">
  <circle cx="60" cy="60" r="54" fill="none" stroke="#EEE" stroke-width="6"/>
  <circle cx="60" cy="60" r="54" fill="none" stroke="#FF6B6B" stroke-width="6"
    stroke-dasharray="339.292" stroke-dashoffset="339.292"
    transform="rotate(-90 60 60)" class="progress-arc"/>
</svg>
```

Dashoffset transitions from 339.292 to 0 over 3s via JS update.

## 6. Fallback Patterns

### Microphone Denied
- **Detection:** `getUserMedia` throws `NotAllowedError` or returns `false`
- **Fallback 1:** Show gentle retry button with explanation: "I need the mic to hear your sounds! Tap to try again."
- **Fallback 2:** After 3 retries, enter **pre-recorded sound mode**: 5 built-in sound buttons (Drum, Bell, Clap, Whistle, Boom) that use oscillator-generated tones instead. Child can still build a beat grid.
- **Fallback 3:** Offer browser instructions: "Check the lock icon in your browser's address bar and turn on microphone."
- **AI adaptation:** AI script changes to reference "tap the sounds" instead of "make a sound"
- **Zero-judgment:** No error states, always framed as "Let's try a different way!"

### No Sound Detected During Recording
- **Detection:** `AudioContext.createAnalyser()` checks RMS < threshold during recording window
- **Fallback:** After recording ends with no/silent audio: "I didn't hear anything! Try again — make a loud sound this time!" (counts as retry, max 3 per slot)
- **After 3 silent recordings:** Accept it as a "silent sound" with a special icon and move on. "Maybe that's a very quiet sound! Let's call it 'Whisper'."

### Beat Grid — No Sounds Placed
- **Detection:** Grid has 0 filled cells when Play is tapped
- **Fallback:** "Your grid is empty! Tap some squares to add sounds. Try putting your favorite sound on beat 1!"
- **After 3 ignored prompts:** Auto-fill a simple pattern (e.g., sound A on beats 0, 2, 4, 6) and play it once to demonstrate

### Beat Grid — All Cells Filled
- **Detection:** All 40 cells filled
- **Fallback:** "Wow, that's a LOT of sounds! Maybe try removing some so we can hear each one clearly?" (not a blocker, just suggestion)
- AI adapts: increases oscillator volume to stand out from the dense beat

### Rapid Mashing (Recording Phase)
- **Detection:** "Keep it" / "Try again" tapped more than 4 times in 5 seconds
- **Fallback:** 1.5s cooldown on record/re-record buttons
- Buttons visually dim during cooldown
- Text: "Let's pick one! Do you like this sound?"

### Rapid Mashing (Sequencer Phase)
- **Detection:** 10+ cell toggles in 2 seconds
- **Fallback:** No cooldown on cell toggles (this is creative play)
- Cell toggles have 100ms debounce to prevent double-tap artifacts
- Play button has 1s cooldown between plays (prevents overlap)

### Idle / No Interaction

| State | Time | Prompt |
|---|---|---|
| Recording (sound #1) | 10s idle | "Tap the red button and make a sound!" (arrow pointing to mic) |
| Naming | 10s idle | "Pick a name for your sound!" (highlight suggestions) |
| Sequencer edit | 15s idle | "Tap a square to add a sound!" (beat 1 cell pulses gently) |
| Any | 30s total idle | "Need help? I'm right here!" (repeat, max 3 total) |

- After 3 idle prompts across the game, offer: "Would you like to see what the game does?" and auto-play a demo sequence

### Audio Playback Failure
- **Detection:** `audio.play()` returns rejected promise
- **Fallback:** Show visual-only feedback: "The sound didn't play, but I see it on the grid!" Cell still shows as filled
- Attempt recovery: create new `Audio` element and retry once

### Browser Tab Hidden
- **Detection:** `document.visibilitychange`
- **Action:** Pause all active recording, playback, and sequence looping
- **On return:** Resume from appropriate state
  - If recording: show "Welcome back! Let's try that sound again."
  - If playing: restart the loop from beat 1
  - If TTS active: replay the last spoken line

### SpeechSynthesis Voices Not Loaded
- **Detection:** `speechSynthesis.getVoices()` returns empty array
- **Fallback:** Call `getVoices()` on a short interval (100ms, up to 3s)
- If still empty: text-only mode — AI speech shown as animated text bubbles with typing effect (no sound)
- Add a visual indicator (speaker icon with X) showing TTS is unavailable

## 7. Accessibility

### Touch Targets
- All interactive elements: minimum 56×56px
- Primary buttons (Record, Play, Keep it): minimum 80px height
- Beat grid cells: 56×56px, 8px gap (sized for K3 finger precision)
- Sound bank icons (in sidebar): 48×48px (view-only, not primary interaction)
- Naming suggestion buttons: 64px height, full-width on mobile
- Mic button (recording phase): 100×100px, centered

### Typography
- AI speech bubbles: 20px minimum (K3 can read simple words)
- Button labels: 18px minimum
- Beat column numbers: 16px (reference only, not primary action)
- Sound names on row labels: 16px
- Font: system rounded sans-serif (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`)
- Line spacing: 1.5
- Font weight: 600 (semi-bold) for labels, 400 for body

### Color & Contrast
- All text on backgrounds: minimum 4.5:1 contrast ratio
- Interactive states: not color-only (add shape/outline changes)
- Button press: scale(0.95) + background darken
- Filled cell vs empty cell: filled has color + inner shadow, empty has dashed border + transparent
- Active beat column: bright gold outline (not color-only — distinct shape change)
- Never use red-only for errors
- Sound colors:
  - Sound 1: `#FF6B6B` (coral)
  - Sound 2: `#4ECDC4` (teal)
  - Sound 3: `#FFD93D` (gold)
  - Sound 4: `#6BCB77` (green)
  - Sound 5: `#A084E8` (purple)

These 5 colors are perceptually distinct even with common color blindness (checked via WebAIM contrast checker): teal/green differ by hue, not just lightness; coral is distinct from purple; gold is unique.

### Two-Channel Output
- All AI speech: text bubble + TTS spoken aloud
- Text bubble persists for 3s after speech ends (longer for complex instructions: 5s)
- Beat playback: audio plays + active column highlights visually
- Recording countdown: progress ring (visual) + optional tick sound (audio)
- No essential information conveyed through sound alone

### Reduced Motion
- Respect `prefers-reduced-motion`: disable bounce, pulse, and slide animations
- Essential transitions: fade 300ms instead of slide
- Beat highlight: color change only (no scale or glow)
- Recording ring: opacity change instead of dashoffset animation
- Confetti at end: optional (show static "Great job!" instead)

### Screen Reader Support
- ARIA live region for AI text bubble: `role="status"` `aria-live="polite"`
- Grid: `role="grid"` with `aria-label="Beat sequencer grid. 5 sounds across 8 beats."`
- Each cell: `role="gridcell"` with `aria-label="Sound [name] on beat [number], [filled/empty]"`
- Mic button: `aria-label="Record sound number [N]"`
- Play button: `aria-label="Play your beat sequence"`
- Recording ring: `role="progressbar"` `aria-valuenow` updated every tick
- Sound bank: `role="list"` with `aria-label="Your recorded sounds"`
- Canvas/visual elements: provide text alternatives

### Motor Considerations
- No drag-and-drop (requires sustained pressure) — tap-only interaction
- All buttons respond on `pointerup` (not `pointerdown`) — allows cancel by dragging off
- 100ms debounce on all toggle interactions
- 1.5s cooldown on destructive actions (clear grid, re-record)
- No double-tap or long-press required for any action

## 8. Edge Cases

### Child records same sound 5 times
- Allowed! The game doesn't require 5 different sounds
- AI says: "You really like that sound! Let's give each copy a different name."
- Sound icons get numbered suffixes: "Clap 1", "Clap 2", etc.
- Grid shows 5 rows with identical icons but different names

### Child records very short sound (<0.3s)
- Detection: blob duration < 300ms
- After recording: "That was quick! Try a longer sound next time." Accept it anyway
- Very short sounds get a visual label "[Quick!]" on playback
- In sequencer: short sounds play fine, just pop briefly

### Child records very long sound (>3s due to early stop not working)
- Hard limit: MediaRecorder is stopped at exactly 3s via timer
- If somehow longer (edge case): truncate to first 3s of audio data

### Child fills only one beat with all 5 sounds
- Valid arrangement! AI says: "Wow, beat 1 is very busy!"
- AI melody generation handles this: lower density score makes AI more prominent
- During playback, multiple sounds on same beat play simultaneously, may clip slightly — normalize gain to 0.7 per simultaneous sound

### Child fills no beats on any row
- See fallback above; after 3 prompts, auto-fill a simple pattern
- Pattern auto-fill: first sound on beats 0, 4; second sound on beats 2, 6; play once as demo

### Child presses Play with only 1-2 sounds placed
- Plays normally with sparse arrangement
- AI adjusts melody density: sparse beat → AI fills more notes

### Name text too long for button
- Suggestion buttons show max 8 characters with ellipsis: "La-la-la…"
- If child names via voice and it's long: AI picks the first word or suggests shortening

### Voice naming fails (STT unavailable)
- Naming step falls back to suggestion buttons only
- Pass "Hmm" if even tap fails (unlikely)

### Oscillator audio context suspended (autoplay policy)
- Detection: `AudioContext.state === 'suspended'`
- Resume on first user gesture (Play button tap): `ctx.resume()`
- Warm up AudioContext on first interaction: create silent oscillator, start+stop immediately
- If context stays suspended: show "Tap to enable sound" overlay

### Multiple children shouting during recording
- Recording captures whatever is loudest — this is intentional (classroom instrument)
- If peak amplitude exceeds 0.95 (clipping): after recording show "That was LOUD!" with a volume indicator
- No punishment or rejection — all sounds accepted

### Child rapidly cycles Play and Stop
- Play button: 1s cooldown
- If child mashes: sequence plays once then stops, cooldown resets
- Visual feedback: button dims during cooldown

### Child clears grid immediately after locking
- Lock happens after explicit confirmation: "Lock in your song?" with [Yes] [No]
- If cleared after lock: "Let's build a new song!" — returns to SEQUENCER_EDIT, previous arrangement lost
- Undo not needed — grid is fast to rebuild

### Game loaded on desktop (no touch)
- Pointer events work identically for mouse clicks
- Cell hover shows subtle highlight (not on touch devices)
- Recording instructions: "Click the button and make a sound into your computer's microphone"

### Game loaded on very small screen (<320px width)
- Grid cells shrink to minimum 44px (accessibility minimum)
- Sound bank sidebar collapses to icon-only, expands on tap
- Buttons remain 56px minimum height
- Text sizes reduce to 16px minimum
- Scroll if necessary (but game designed for 375px+)

### Oscillator fails to create (old browser)
- Detection: `AudioContext` constructor throws
- Fallback: Show message "Your browser doesn't support audio generation. Let's use just your sounds!"
- Skip Part C melody generation, go straight to celebration from locked song
- Game is still fully functional

## 9. Visual Design Direction

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-cream` | `#FFF9F0` | Page background |
| `--bg-white` | `#FFFFFF` | Card, grid container, text bubble |
| `--primary` | `#FF6B6B` | Mic button, record state, primary CTAs |
| `--primary-hover` | `#E05555` | Primary button hover |
| `--secondary` | `#4ECDC4` | Play button, success states |
| `--accent-gold` | `#FFD93D` | Beat highlight, celebration accents |
| `--text-dark` | `#2D2D2D` | Body text |
| `--text-medium` | `#666666` | Secondary labels, column numbers |
| `--bg-cell-empty` | `#F0F0F0` | Empty grid cell background |
| `--border-cell` | `#D0D0D0` | Empty cell border |
| `--sound-1` | `#FF6B6B` | Sound slot 1 (coral) |
| `--sound-2` | `#4ECDC4` | Sound slot 2 (teal) |
| `--sound-3` | `#FFD93D` | Sound slot 3 (gold) |
| `--sound-4` | `#6BCB77` | Sound slot 4 (green) |
| `--sound-5` | `#A084E8` | Sound slot 5 (purple) |
| `--shadow` | `rgba(0,0,0,0.1)` | Subtle shadows on cards/buttons |

No purple gradients, no glassmorphism, no neon. Solid, warm, bold colors with high contrast.

### Screen Layouts

**Part A — Recording Phase:**
```
┌──────────────────────────────────────────┐
│  [← Home]                    [🔊 Sound] │
│                                           │
│  "Sound #1: Make a sound with             │
│   your voice!"                            │
│   (AI text bubble, cream bg,              │
│    rounded corners, 20px)                 │
│                                           │
│            ┌──────────────┐              │
│            │              │              │
│            │   [⏺ REC]   │              │
│            │   100px dia  │              │
│            │   pulsing    │              │
│            │   red ring   │              │
│            │              │              │
│            └──────────────┘              │
│                                           │
│    Sound bank (bottom strip):            │
│    [⚪] [⚪] [⚪] [⚪] [⚪]              │
│     #1   #2   #3   #4   #5              │
│    (filled circles for recorded,          │
│     empty outline for upcoming)           │
└──────────────────────────────────────────┘
```

**Part A — Playback & Name:**
```
┌──────────────────────────────────────────┐
│  [← Home]                    [🔊 Sound] │
│                                           │
│  "Great! Listen to your sound!"           │
│                                           │
│         ┌─────────────────────┐          │
│         │  [▶ Play again]     │          │
│         │  [✓ Keep it]        │          │
│         │  [⟳ Try again]      │          │
│         └─────────────────────┘          │
│                                           │
│  "What should we call it?"                │
│                                           │
│  [La-la]  [Clap]  [Boom]  [Ding]        │
│  [Whoosh] [Tap]   [Custom]               │
│                                           │
│    Sound bank (updated):                  │
│    [🔴] [⚪] [⚪] [⚪] [⚪]              │
│    La-la                                 │
└──────────────────────────────────────────┘
```

**Part B — Beat Sequencer:**
```
┌──────────────────────────────────────────┐
│  [← Home]              Sound: [🔴][🟢]… │
│                                           │
│  "Tap squares to build your song!"        │
│                                           │
│     │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │   │
│  ───┼───┼───┼───┼───┼───┼───┼───┼───┤   │
│  🔴 │ ■ │   │   │ ■ │   │   │   │   │   │
│  La │   │   │   │   │   │   │   │   │   │
│  ───┼───┼───┼───┼───┼───┼───┼───┼───┤   │
│  🟢 │   │ ■ │   │   │   │ ■ │   │   │   │
│  Cl │   │   │   │   │   │   │   │   │   │
│  ───┼───┼───┼───┼───┼───┼───┼───┼───┤   │
│  🟡 │   │   │   │   │ ■ │   │   │ ■ │   │
│  Bo │   │   │   │   │   │   │   │   │   │
│  ───┼───┼───┼───┼───┼───┼───┼───┼───┤   │
│  🔵 │ ■ │   │ ■ │   │   │   │   │   │   │
│  Di │   │   │   │   │   │   │   │   │   │
│  ───┼───┼───┼───┼───┼───┼───┼───┼───┤   │
│  🟣 │   │   │   │   │   │   │ ■ │   │   │
│  Wh │   │   │   │   │   │   │   │   │   │
│                                           │
│      [▶ Play]  [⏹ Stop]  [🗑 Clear]     │
│                                           │
│   🔒 "Lock in song!" (appears after       │
│      2+ playthroughs)                     │
└──────────────────────────────────────────┘
```

**Part C — AI Melody:**
```
┌──────────────────────────────────────────┐
│                                           │
│   "Now I'll add my own melody!"           │
│                                           │
│       ┌────────────────────┐             │
│       │                    │             │
│       │   🎵  🎵  🎵      │             │
│       │   Musical notes    │             │
│       │   bouncing anim    │             │
│       │                    │             │
│       └────────────────────┘             │
│                                           │
│   "AI is composing..."                    │
│   (progress bar, ~3 seconds)             │
│                                           │
│   After generation:                       │
│   Beat grid plays + melody overlay        │
│   Active beats glow gold                  │
│   Melody notes show as floating           │
│   sparkles above the grid                 │
│                                           │
│   "We made music together! 🎉"           │
│                                           │
│   [Play together again!]  [Start over]    │
└──────────────────────────────────────────┘
```

### Typography

- Primary font: System UI rounded (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Helvetica Neue`, sans-serif)
- AI speech / body: 20px, weight 600
- Button labels: 18px, weight 700
- Beat numbers: 14px, weight 400, color `--text-medium`
- Sound names on labels: 14px, weight 600
- Headings/title text: 24px, weight 800
- Celebration text: 28px, weight 800
- No custom font loading (reduces load time, avoids FOUT)

### Animation Style

- **Duration:** 300-500ms for transitions, slow enough for K3
- **Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` for playful overshoot on celebrations
- **Recording pulse:** CSS keyframe — `scale(1)` → `scale(1.05)` → `scale(1)`, 1.5s loop, easing ease-in-out
- **Beat highlight:** background `#FFD93D` with 200ms fade in, 100ms fade out
- **Cell toggle:** `scale(0.9)` → `scale(1.05)` → `scale(1)` over 200ms
- **Sound bank circle appear:** `scale(0)` → `scale(1.3)` → `scale(1)`, 300ms
- **AI text bubble appear:** fade in 300ms + translateY(-10px) → 0
- **Transition between parts:** slide content up, new content slides up from below, 400ms each
- **Confetti (celebration):** 12 colored circles (matching sound colors) that rise from bottom and fade, random horizontal drift, 1.5s total
- **No spinning, no pulsing text, no screen shake**

### Icon & Visual Language

- All buttons use icon + text label
- Sound bank circles: 44px filled circles with abbreviated name inside (2-3 chars)
- Mic icon: classic microphone SVG with pulsing ring animation during recording
- Play button: solid triangle in circle, 80px
- Stop button: solid square in circle, 80px
- Clear button: trash can icon, 56px
- Beat cells: rounded squares (8px radius) with no icon when empty, colored fill when occupied
- Lock button: lock icon + "Lock in song!" text, 72px
- Navigation: chevron back arrow in header
- Sound toggle: speaker icon in header

### Layout Constraints

- **Minimum width:** 320px (small phones)
- **Maximum width:** 800px (tablet landscape, capped)
- **Portrait-first:** designed for portrait, works in landscape (grid scrolls horizontally)
- **Safe area:** 16px padding on sides, 44px top (notch-safe), 20px bottom
- **Bottom action zone:** 100px tall, always within thumb reach
- **Grid responsiveness:** cells scale with viewport width (min 44px, max 64px)
- **Sound bank strip:** fixed at bottom during Part A, becomes sidebar in Part B (left side, 48px wide)

## 10. Pipeline History

- **Planner:** 34 questions answered across 6 rounds
- **Round 1 (Foundation):** Target age K3 (5-6), Phase 1 constraints, 25-min lesson structure, 5 sound slots, 8-beat grid, AI melody generation as demonstration of learning
- **Round 2 (Interaction):** Tap-to-record with 3s auto-stop, tap-to-place on grid (no drag), tap-to-name with suggestion buttons, push-to-talk fallback, all input via simple taps
- **Round 3 (Technical):** MediaRecorder for recording, HTML/CSS grid for sequencer, Web Audio API oscillators for melody, Web Speech API TTS, SVG progress ring for countdown, no external libraries
- **Round 4 (Narrative):** 3-act arc (record → arrange → AI composes), AI learns 5 sounds as "instrument", demonstrates understanding by generating complementary melody, "We made music together" as emotional payoff
- **Round 5 (Edge Cases):** Silent recording detection, mic denied → oscillator sound bank, sparse/dense grid handling, AudioContext autoplay policy, multi-child overlapping recording, rapid mashing cooldowns, visibility change pause/resume
- **Round 6 (Polish):** 5-color palette (coral, teal, gold, green, purple — CVD-safe), 56×56px touch targets, system font stack (no custom fonts), 300-500ms animations, dual-channel (visual+audio), reduced-motion respect, ARIA live regions
