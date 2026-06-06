/**
 * SYSTEM ORCHESTRATOR
 *
 * - Wires HandTracker, GestureTrainer, SnakeGame together.
 * - Manages training vs. playing mode.
 * - Updates UI: sample counters, confidence bar, status messages.
 * - Handles "no hand detected" by pausing gesture commands.
 * - Runs game loop at 10 FPS, detection loop at 20 FPS.
 *
 * Engineer's note: The confidence bar is updated every prediction cycle,
 * giving the user real‑time feedback on how certain the AI is.
 */
import { HandTracker } from "./handTracker.js";
import { GestureTrainer } from "./trainer.js";
import { SnakeGame } from "./snake.js";

class Controller {
  constructor() {
    this.videoEl = document.getElementById("webcam");
    this.handCanvasEl = document.getElementById("handCanvas");
    this.statusDiv = document.getElementById("status");
    this.sampleCountsDiv = document.getElementById("sampleCounts");
    this.debugDiv = document.getElementById("debug");
    this.confidenceFill = document.getElementById("confidenceFill");
    this.confidencePercent = document.getElementById("confidencePercent");

    this.trainer = new GestureTrainer();
    this.game = new SnakeGame("gameCanvas");

    this.isTrainingMode = true;
    this.currentLandmarks = null;
    this.lastConfidence = 0;

    this.tracker = new HandTracker(
      this.videoEl,
      this.handCanvasEl,
      (landmarks) => {
        this.currentLandmarks = landmarks;
        this.updateDebugDisplay(landmarks);
      },
      () => {
        this.onTrackerReady();
      },
    );

    this.setupButtons();
    this.init();
  }

  async onTrackerReady() {
    this.statusDiv.innerHTML =
      "✅ AI model ready. Show your hand to the camera.";
    this.debugDiv.innerHTML = "🖐️ Show hand – skeleton should appear.";
    await this.tracker.start();
    this.startGameLoop();
  }

  async init() {
    this.updateSampleUI();
    this.setConfidence(0, null);
  }

  setupButtons() {
    document
      .getElementById("btnUp")
      .addEventListener("click", () => this.captureGesture(0));
    document
      .getElementById("btnDown")
      .addEventListener("click", () => this.captureGesture(1));
    document
      .getElementById("btnLeft")
      .addEventListener("click", () => this.captureGesture(2));
    document
      .getElementById("btnRight")
      .addEventListener("click", () => this.captureGesture(3));
    document
      .getElementById("trainBtn")
      .addEventListener("click", () => this.startFinal());
    document
      .getElementById("resetGameBtn")
      .addEventListener("click", () => this.resetGame());
  }

  updateDebugDisplay(landmarks) {
    if (landmarks) {
      this.debugDiv.style.borderLeftColor = "#10b981";
    } else {
      this.debugDiv.style.borderLeftColor = "#facc15";
    }
  }

  /**
   * Update confidence bar and text, optionally showing which gesture.
   * @param {number} confidence 0..1
   * @param {number|null} gestureClass 0=UP,1=DOWN,2=LEFT,3=RIGHT
   * @param {Float32Array|null} allProbs optional for detailed debug
   */
  setConfidence(confidence, gestureClass, allProbs = null) {
    const percent = Math.floor(confidence * 100);
    this.confidenceFill.style.width = `${percent}%`;
    this.confidencePercent.innerText = `${percent}%`;
    this.lastConfidence = confidence;

    // Show which gesture is being predicted
    const gestureNames = ["⬆️ UP", "⬇️ DOWN", "⬅️ LEFT", "➡️ RIGHT"];
    if (gestureClass !== null && confidence > 0) {
      this.confidencePercent.innerText = `${gestureNames[gestureClass]} ${percent}%`;
    } else {
      this.confidencePercent.innerText = `${percent}%`;
    }

    // Detailed debug: show all probabilities
    if (allProbs && this.isTrainingMode === false) {
      const probsText = allProbs
        .map((p, idx) => `${["U", "D", "L", "R"][idx]}:${Math.floor(p * 100)}%`)
        .join(" ");
      this.debugDiv.innerHTML = `🤚 Hand: ${probsText}`;
    } else if (this.isTrainingMode === false && !allProbs) {
      this.debugDiv.innerHTML = `🎮 Game active – confidence ${percent}%`;
    }
  }

  captureGesture(label) {
    if (!this.isTrainingMode) {
      alert("Training mode is off. Reload page to collect more samples.");
      return;
    }
    if (!this.currentLandmarks) {
      alert("No hand detected! Please show your hand clearly.");
      return;
    }
    this.trainer.addSample(this.currentLandmarks, label);
    this.updateSampleUI();

    if (this.trainer.isReadyToTrain()) {
      document.getElementById("trainBtn").disabled = false;
      this.statusDiv.innerHTML = '✅ Enough samples! Click "Train & Play".';
    } else {
      const counts = this.trainer.getSampleCounts();
      this.statusDiv.innerHTML = `📊 Need 5 each. Now: Up=${counts.up} Down=${counts.down} Left=${counts.left} Right=${counts.right}`;
    }
  }

  updateSampleUI() {
    const counts = this.trainer.getSampleCounts();
    this.sampleCountsDiv.innerHTML = `⬆️ Up:${counts.up} ⬇️ Down:${counts.down} ⬅️ Left:${counts.left} ➡️ Right:${counts.right}`;
  }

  async startFinal() {
    if (!this.trainer.isReadyToTrain()) {
      alert(
        `Need 5+ per gesture. Current: ${JSON.stringify(this.trainer.getSampleCounts())}`,
      );
      return;
    }
    this.statusDiv.innerHTML = "🧠 Training network... (30-60 sec)";
    document.getElementById("trainBtn").disabled = true;
    try {
      await this.trainer.train();
      this.isTrainingMode = false;
      this.statusDiv.innerHTML =
        "🎮 Game running! Hand gestures control snake.";
      this.debugDiv.innerHTML =
        "🎮 Move your hand – confidence bar shows prediction";
      this.setConfidence(0, null);
    } catch (err) {
      console.error(err);
      this.statusDiv.innerHTML = `❌ Training failed: ${err.message}`;
      document.getElementById("trainBtn").disabled = false;
    }
  }

  startGameLoop() {
    setInterval(() => {
      if (!this.isTrainingMode && !this.game.isGameOver()) {
        if (this.currentLandmarks) {
          const result = this.trainer.predict(this.currentLandmarks);
          if (result && result.confidence !== undefined) {
            // Show detailed probabilities in UI
            this.setConfidence(
              result.confidence,
              result.class,
              result.allProbs,
            );
            // Lower threshold: if confidence > 30%, use it
            if (result.confidence > 0.3) {
              this.game.setDirection(result.class);
            }
          }
        } else {
          this.setConfidence(0, null);
        }
        this.game.step();
      }
      this.game.draw();
    }, 200);
  }

  resetGame() {
    this.game.reset();
    this.statusDiv.innerHTML = this.isTrainingMode
      ? "Training mode"
      : "Game reset! Continue playing.";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.app = new Controller();
});
