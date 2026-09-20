# Tool & Library Reference for AI Education Games

A curated map of lightweight, browser-friendly libraries and models that
game-builder agents should consider when implementing AI capabilities.
Everything listed is either browser-native, available via CDN/npm, or
runnable as a local model with minimal dependencies.

**CRITICAL: All models MUST download to the browser and run on-device.**
No server-side inference. Total model download budget: prefer under 200MB,
hard max 500MB. Agents should search the web at build time (WebFetch) for
newer/smaller models that may have emerged since this file was written.

---

## Speech & Voice

### Speech-to-Text (STT)
| Tool | Size | Offline? | Notes |
|------|------|----------|-------|
| `window.SpeechRecognition` (Web Speech API) | 0 (browser built-in) | Online (Chrome) | Primary choice. Works in Chrome, Edge, Safari. Returns interim + final transcripts. |
| Vosk Browser | ~50MB per language model | **Yes** | Full offline STT via WebAssembly. 20+ languages. Heavier but fully offline. |
| `@ricky0123/vad-web` + keyword matching | ~5MB (Silero VAD) + 0 (keywords) | **Yes** | Ultra-light offline: VAD detects speech segments, keyword matcher picks up command words (shape names, colors, yes/no) without full transcription. |

### Text-to-Speech (TTS)
| Tool | Size | Offline? | Notes |
|------|------|----------|-------|
| `window.speechSynthesis` (Web Speech API) | 0 (browser built-in) | **Yes** | Primary choice. Voice quality varies by OS. Rate 0.7-0.9 recommended for K2. |
| meSpeak.js | ~2MB (voice file) | **Yes** | JS-based TTS fallback (port of eSpeak). Bundle `mespeak_full.js` + `en/en-us.json`. |
| Kokoro TTS (HuggingFace) | ~80MB | **Yes** (via Transformers.js) | State-of-the-art quality, 82M params. Can run in browser via ONNX. |

### Voice Activity Detection (VAD) & End of Utterance (EOU)
| Tool | Size | Notes |
|------|------|-------|
| `@ricky0123/vad-web` | ~5MB (Silero VAD ONNX) | Best in class for browser VAD. `onSpeechEnd` callback gives clean audio segments. Configurable thresholds. npm: `@ricky0123/vad-web` |
| Web Audio API RMS (custom) | 0 | Simple energy-based VAD. `AnalyserNode.getFloatTimeDomainData()` + RMS threshold. Works everywhere but less accurate. |
| EOU timeout pattern | 0 (logic only) | After VAD detects silence for N ms (typically 800-1500ms), consider utterance complete. |

---

## Vision & Camera

### General Object Detection / Image Classification
| Tool | Size | Offline? | Notes |
|------|------|----------|-------|
| `@mediapipe/tasks-vision` (ObjectDetector) | ~5-10MB (EfficientDet-Lite0) | **Yes** (TFLite+WASM) | Modern replacement for old MediaPipe APIs. npm: `@mediapipe/tasks-vision`. Supports: ObjectDetector, ImageClassifier, HandLandmarker, PoseLandmarker, FaceLandmarker, GestureRecognizer, ImageSegmenter. |
| TensorFlow.js + MobileNet | ~17MB (model) | **Yes** | 1000-class ImageNet. Alpha 0.25 variant is ~4MB. |
| TensorFlow.js + COCO-SSD | ~12MB (lite_mobilenet_v2) | **Yes** | 80 common object classes with bounding boxes. |
| ml5.js (imageClassifier) | ~17MB (MobileNet) | **Yes** | Friendly API wrapper over TF.js. Simpler but less configurable. |
| ONNX Runtime Web + EfficientNet | ~10-20MB | **Yes** | Alternative runtime. Lower overhead for simple classification. |

### Pose & Body Tracking
| Tool | Size | Notes |
|------|------|-------|
| `@mediapipe/tasks-vision` (PoseLandmarker) | ~5MB (Pose Landmarker Lite) | 33 body landmarks. Lite/Full/Heavy variants. |
| `@mediapipe/tasks-vision` (HolisticLandmarker) | ~15MB | Combined pose (33 pts) + face (478 pts) + hands (21 pts each). |
| TensorFlow.js + MoveNet | ~13MB (Lightning) | 17 keypoints. Very fast (30+ FPS). Good for simple pose actions. |

### Hand & Finger Tracking
| Tool | Size | Notes |
|------|------|-------|
| `@mediapipe/tasks-vision` (HandLandmarker) | ~6MB | 21 landmarks per hand. Finger counting, direction pointing, gestures. |
| `@mediapipe/tasks-vision` (GestureRecognizer) | ~8MB | Built-in gesture classification (thumbs_up, peace, point, closed_fist, open_palm, etc.). |

### Face & Emotion Detection
| Tool | Size | Notes |
|------|------|-------|
| `@mediapipe/tasks-vision` (FaceLandmarker) | ~8MB | 478 face landmarks + 6 blendshapes (happiness, sadness, anger, surprise). Derive emotions from blendshape scores. |
| TensorFlow.js + face-landmarks-detection | ~3-5MB | Lighter alternative. 68-point or 486-point models. |
| ml5.js (faceApi) | ~5MB | Detects faces + expressions (happy, sad, angry, surprised, etc.). |

### Teachable / Custom Classification (KNN)
| Tool | Size | Notes |
|------|------|-------|
| TensorFlow.js + KNN Classifier | 0 (logic only) | `@tensorflow-models/knn-classifier`. Add examples per class, classify in real-time. Pattern in `source/toolbox/recognition.js`. |
| ml5.js (featureExtractor + classifier) | ~17MB (base model) | `featureExtractor('MobileNet')` + custom classifier on top. |
| ONNX Runtime Web + custom embeddings | varies | Extract embeddings from small vision model, cosine similarity for matching. |

### Drawing / Canvas Recognition
| Tool | Size | Notes |
|------|------|-------|
| Custom canvas feature extraction | 0 (logic only) | Downsample canvas to 32x32 grid, extract features (pixel density in quadrants, bounding box ratio, convex hull area). Enough for circle/square/triangle. Pattern in `source/toolbox/drawing.js`. |
| TensorFlow.js + small CNN | ~2-5MB | Pre-trained tiny CNN for doodle recognition. Google QuickDraw dataset available. |
| fabric.js | ~200KB | Canvas manipulation library. Drawing UI with undo, layers, stroke handling. Not ML. |

---

## Text & Language

### Small Language Models (on-device, in-browser)

**Tablet browser budget: models must load and run comfortably on tablets with 2-4GB RAM.**

| Model | Download (Q4) | Download (Q2) | Params | Runtime | Notes |
|-------|--------------|--------------|--------|---------|-------|
| **SmolLM2-135M-Instruct** ★ | ~80MB ONNX | ~50MB | 135M | ONNX Runtime Web / Transformers.js | **Recommended default.** Good for simple conversations, off-topic nudges, basic Q&A. Apache 2.0. Trained on 2T tokens. |
| SmolLM2-360M-Instruct | ~200MB | ~120MB | 360M | ONNX Runtime Web | Better reasoning than 135M. Still runs on-device. |
| Qwen2.5-0.5B-Instruct | ~350MB GGUF Q4_K_M | ~415MB GGUF Q2_K | 0.49B | llama.cpp WASM / ONNX | Stronger instruction following. Good for story generation (K3). Larger download. |
| TinyLlama-1.1B | ~650MB | ~400MB | 1.1B | llama.cpp WASM | Overkill for simple responses. Use only if higher reasoning is needed. |

**Agents should search the web at build time** (WebFetch to HuggingFace) to check for:
- Newer SmolLM releases (SmolLM3)
- Smaller quant formats that maintain quality
- Alternative models under 200M params with good instruction following

### Text Generation (NLG) — for story lessons
| Approach | When to use |
|----------|-------------|
| Small on-device SLM (SmolLM2) | Offline story generation, 1-3 sentence outputs. ~80MB download. |
| HuggingFace Inference API (serverless) | Online story/image generation. Free tier available. Needs API key. |
| Template-based (pre-written sentences + randomization) | Full offline. Sufficient for K2/K3 where outputs are predictable. |

### Sentiment Analysis / NLP
| Tool | Size | Notes |
|------|------|-------|
| Transformers.js + `Xenova/distilbert-base-uncased-finetuned-sst-2-english` | ~68MB | Sentiment (positive/negative). Runs in browser. |
| ml5.js (sentiment) | ~5MB | AFINN lexicon. Not ML but works for P1-16. |
| Custom keyword + lexicon approach | 0 | Hardcoded word->emotion mapping. For K2/K3 level. Simpler and more predictable. |

---

## Image Generation

| Tool | Size | Notes |
|------|------|-------|
| Pollinations.ai | 0 (free API) | Free, no-key text-to-image. `GET https://image.pollinations.ai/prompt/{prompt}`. Lower quality but sufficient for K2 (simple shapes, colors). |
| HuggingFace Inference API (Stable Diffusion) | 0 (API call) | Online. Free tier: ~30 images/day. Best quality for "AI generates robot/animal/monster" lessons. |
| Replicate API (FLUX, SDXL) | 0 (API call) | Online. High quality. Pay-per-use (~$0.002/image). |
| WebGPU/WebNN + SD-turbo (experimental) | ~500MB | Fully offline in-browser generation. Requires WebGPU (Chrome 113+). Heavy. |

---

## Audio & Music

### Sound Recording
| Tool | Notes |
|------|-------|
| `navigator.mediaDevices.getUserMedia({ audio: true })` + MediaRecorder API | Browser native. Record short clips (1-5 seconds). Save as Blob, play back with Audio element. |
| Web Audio API + `AudioContext.createMediaStreamSource()` | Low-level control. Process audio in real-time (visualize waveform, detect clap vs stomp via frequency analysis). |

### Music / Beat Generation
| Tool | Size | Notes |
|------|------|-------|
| Tone.js | ~150KB | Full-featured music framework. Sequencer, synthesizer, sampler. Perfect for beat-making lessons — arrange sounds on grid, play with Tone.Transport. Pattern in `source/toolbox/soundmaker.js`. |
| Web Audio API OscillatorNode | 0 (browser built-in) | Generate tones programmatically. Simple melodies without any library. |
| Magenta.js (MusicVAE, DrumsRNN) | ~10-30MB | Google's ML music models. Generate melodies from seed patterns. |

---

## Primary: Simulation & Algorithms

### Pathfinding
| Tool | Notes |
|------|-------|
| Custom A* | ~50 lines. Grid-based A* with configurable heuristics (Manhattan, Euclidean). Pattern in `source/toolbox/pathfinding.js`. |
| easystar.js | ~15KB npm package. A* for tile-based grids. Async, corner-cutting, dynamic obstacles. |
| Custom BFS/DFS | ~30 lines. Simpler than A* for unweighted grids. P1-03 "Moving Around a Grid". |

### Swarm / Boids
| Concept | Notes |
|---------|-------|
| Reynolds Boids algorithm | 3 rules: separation, alignment, cohesion. ~100 lines. P1-05 "Swarm Pathfinding". Pattern in `source/toolbox/pathfinding.js`. |
| Custom multi-agent sim | Each agent has position + velocity. Apply forces from 3 boid rules each tick. Pattern in `source/toolbox/simulation.js`. |

### Traffic Simulation
| Tool | Notes |
|------|------|
| Custom cellular automata | Nagel-Schreckenberg model for traffic flow. Grid-based, simple rules, emergent jams. Pattern in `source/toolbox/simulation.js`. |
| Custom queue-based simulation | Intersections as queues. P1-07 bus scheduling, P1-12 traffic lights. |

### Network / Graph Simulation
| Concept | Notes |
|---------|-------|
| Custom graph with Dijkstra's | P1-09 "Water Supply": pressure = edge weights. Find shortest path. Pattern in `source/toolbox/simulation.js`. |
| Custom max-flow/min-cut | P1-10 "Power Grid": Ford-Fulkerson for load balancing. |

### Traveling Salesman Problem (TSP)
| Tool | Notes |
|------|-------|
| Nearest-neighbor heuristic | ~30 lines. Greedy. Simple, intuitive for kids. Pattern in `source/toolbox/pathfinding.js`. |
| 2-opt improvement | ~50 lines. Swap two edges to reduce total distance. Shows AI refinement. |
| Brute force (for <=8 nodes) | ~20 lines. Compare all permutations. Shows why AI optimization matters. |

---

## General Utilities

### Model Loading & Bundling
| Tool | Notes |
|------|-------|
| ONNX Runtime Web | `onnxruntime-web`. Run ONNX models in browser. WebAssembly + WebGL backends. |
| Transformers.js | HuggingFace's JS port. Run transformer models in browser. Handles tokenization + inference. |
| Vite | Bundle at build time. Import npm packages, treeshake, output static HTML/CSS/JS. |
| esbuild | Fast bundler. Wrap npm deps into single JS bundle for "no CDN at runtime". |

### PWA / Offline Storage
| Tool | Notes |
|------|-------|
| Service Worker (custom) | Cache all game files on first load. Then fully offline. ~30-line SW. |
| localStorage | Persist settings, learning state, conversation transcripts. |
| IndexedDB | Larger data: recorded audio blobs, trained KNN models, SLM model files. |

### Canvas / Drawing Libraries
| Tool | Notes |
|------|-------|
| fabric.js | Full canvas drawing library. Free drawing, shapes, colors, undo/redo. |
| p5.js | Creative coding library. Simple API for drawing, animation, interaction. |
| Paper.js | Vector graphics scripting. Bezier curves, hit-testing, boolean operations. |

---

## Decision Tree: Which tool for which capability?

### "I need the game to understand what a child draws"
-> **fabric.js** (canvas UI) + **custom feature extraction** (quadrant density + shape heuristics) for circle/square/triangle. Too few classes for ML. See `source/toolbox/drawing.js`.

### "I need the game to recognize objects from the camera"
-> **`@mediapipe/tasks-vision` ObjectDetector** (EfficientDet-Lite0) for pre-trained classes, OR **TF.js + KNN classifier** if child teaches custom objects. See `source/toolbox/recognition.js`.

### "I need the game to track body movements (stand, jump, clap)"
-> **`@mediapipe/tasks-vision` PoseLandmarker** (Lite variant). Classify poses from landmark angles/heights. See `source/toolbox/joints.js`.

### "I need the game to count fingers or detect direction"
-> **`@mediapipe/tasks-vision` HandLandmarker**. Count extended fingers via tip-vs-PIP Y comparison. Detect direction via wrist-to-index-MCP vector.

### "I need the game to understand face emotions"
-> **`@mediapipe/tasks-vision` FaceLandmarker** — 6 blendshapes include happiness, sadness, anger. OR **ml5.js faceApi**.

### "I need the game to listen to voice and respond"
-> **`@ricky0123/vad-web`** (VAD) + **`window.SpeechRecognition`** (online STT) OR **Vosk** (offline STT) OR **VAD + keyword matching** (ultra-light offline). For TTS: **`window.speechSynthesis`** + **meSpeak.js** (offline fallback). See `source/toolbox/conversation.js`.

### "I need the game to generate an image from text"
-> **Pollinations.ai** (free, no key, online) for K2. OR **HuggingFace Inference API** for better quality. OR pre-made SVG library if fully offline. See `source/toolbox/generation.js`.

### "I need the game to generate text stories"
-> **Template-based** (sentences + randomization) for K2/K3. OR **SmolLM2-135M-Instruct** via Transformers.js if on-device. See `source/toolbox/generation.js`.

### "I need the game to record and play back sounds"
-> **MediaRecorder API** (record) + **Audio element** (playback). For beat-making: **Tone.js** player + Transport. See `source/toolbox/soundmaker.js`.

### "I need pathfinding on a grid"
-> **Custom A*** (~50 lines) for weighted grids. **Custom BFS** for unweighted grids. See `source/toolbox/pathfinding.js`.

### "I need swarm/flocking behavior"
-> **Reynolds Boids** (~100 lines). 3 rules per agent per tick. See `source/toolbox/pathfinding.js`.

### "I need traffic/flow simulation"
-> **Custom cellular automata** (Nagel-Schreckenberg) for traffic. **Custom queue system** for buses/intersections. See `source/toolbox/simulation.js`.
