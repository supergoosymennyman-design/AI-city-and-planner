/**
 * HAND TRACKER MODULE (MediaPipe Lite)
 *
 * Responsibilities:
 * - Initialise MediaPipe Hands with the lite model (modelComplexity=0).
 * - Provide a loading callback when the model is ready.
 * - Throttle detection to 20 FPS to reduce CPU usage.
 * - Draw a skeleton overlay on a canvas for visual feedback.
 *
 * Engineer's note: The model is downloaded asynchronously. The 'onReady' callback
 * is essential to avoid "no hand detected" errors during startup.
 */
export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoElement - The <video> element for webcam feed.
   * @param {HTMLCanvasElement} canvasElement - Canvas to draw the skeleton overlay.
   * @param {Function} onResults - Callback invoked with landmarks (or null) every frame.
   * @param {Function} onReady - Callback when MediaPipe model is fully loaded.
   */
  constructor(videoElement, canvasElement, onResults, onReady) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    this.onResultsCallback = onResults;
    this.onReadyCallback = onReady;
    this.isDetecting = false;
    this.lastTimestamp = 0;
    this.throttleMs = 50; // 20 frames per second
    this.isReady = false; // Flag set when model is loaded

    // MediaPipe Hands initialisation with CORRECT locateFile
    this.hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    // Lite mode reduces model size from 5.6 MB to ~4.2 MB
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, // 0 = lite (faster, smaller)
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // Wait for the model to load (important for first-run experience)
    this.hands
      .initialize()
      .then(() => {
        console.log("[HandTracker] MediaPipe model loaded");
        this.isReady = true;
        if (this.onReadyCallback) this.onReadyCallback();
      })
      .catch((err) => {
        console.error("[HandTracker] Failed to load MediaPipe model:", err);
      });

    // Set the callback for when MediaPipe processes a frame
    this.hands.onResults((results) => this.onHandResults(results));
  }

  /**
   * Start the webcam and begin the detection loop.
   */
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.isDetecting = true;
    this.detectLoop();
  }

  /**
   * Detect loop: throttles calls to MediaPipe to 20 FPS.
   * Uses requestAnimationFrame for smooth rendering but only processes every ~50ms.
   */
  detectLoop() {
    if (!this.isDetecting) return;
    const now = performance.now();
    // Only send image to MediaPipe if model is ready and throttle time passed
    if (this.isReady && now - this.lastTimestamp >= this.throttleMs) {
      this.lastTimestamp = now;
      this.hands.send({ image: this.video });
    }
    requestAnimationFrame(() => this.detectLoop());
  }

  /**
   * Draws the 21 hand landmarks and connections (skeleton) on the canvas.
   * This provides immediate visual feedback that tracking is working.
   * @param {Array|null} landmarks - Array of 21 {x,y,z} objects or null.
   */
  drawLandmarks(landmarks) {
    if (!landmarks) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    // Mirror the drawing to match the mirrored video feed
    this.ctx.scale(-1, 1);
    this.ctx.translate(-this.canvas.width, 0);

    // Define connections between landmark indices (simplified hand skeleton)
    const connections = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4], // thumb
      [0, 5],
      [5, 6],
      [6, 7],
      [7, 8], // index
      [0, 9],
      [9, 10],
      [10, 11],
      [11, 12], // middle
      [0, 13],
      [13, 14],
      [14, 15],
      [15, 16], // ring
      [0, 17],
      [17, 18],
      [18, 19],
      [19, 20], // pinky
    ];
    this.ctx.beginPath();
    this.ctx.strokeStyle = "#0ff";
    this.ctx.lineWidth = 2;
    for (let conn of connections) {
      const p1 = landmarks[conn[0]];
      const p2 = landmarks[conn[1]];
      if (p1 && p2) {
        this.ctx.moveTo(p1.x * this.canvas.width, p1.y * this.canvas.height);
        this.ctx.lineTo(p2.x * this.canvas.width, p2.y * this.canvas.height);
      }
    }
    this.ctx.stroke();

    // Draw keypoints as circles
    for (let lm of landmarks) {
      this.ctx.beginPath();
      this.ctx.arc(
        lm.x * this.canvas.width,
        lm.y * this.canvas.height,
        4,
        0,
        2 * Math.PI,
      );
      this.ctx.fillStyle = "#ff0";
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  /**
   * Called each time MediaPipe returns results.
   * Extracts landmarks, draws skeleton, and passes landmarks to the callback.
   * @param {Object} results - MediaPipe results object.
   */
  onHandResults(results) {
    const landmarks = results.multiHandLandmarks?.[0] || null;
    this.drawLandmarks(landmarks);
    if (this.onResultsCallback) {
      this.onResultsCallback(landmarks);
    }
  }

  /**
   * Stop the camera and detection loop.
   */
  stop() {
    this.isDetecting = false;
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((track) => track.stop());
    }
  }
}
