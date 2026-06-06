/**
 * ML TRAINER MODULE – Enhanced for Few‑Shot Learning
 *
 * Improvements:
 * - Smaller network (16 hidden units) + Dropout to prevent overfitting.
 * - Data augmentation: adds gaussian noise to landmarks (doubles samples).
 * - No tf.callbacks.earlyStopping (causes "setParams" error in TF.js).
 * - Detailed error logging.
 */
/**
 * ML TRAINER MODULE – Fixed for float32, better few-shot learning
 */
export class GestureTrainer {
  constructor() {
    this.samples = [];
    this.labels = [];
    this.labelCounts = [0, 0, 0, 0];
    this.model = null;
    this.minSamplesPerClass = 5;
  }

  addSample(landmarks, label) {
    if (label < 0 || label > 3) return false;
    if (!landmarks || landmarks.length !== 21) return false;
    const flattened = landmarks.flatMap((l) => [l.x, l.y, l.z]);
    if (flattened.some((v) => isNaN(v))) return false;
    this.samples.push(flattened);
    this.labels.push(label);
    this.labelCounts[label]++;
    return true;
  }

  isReadyToTrain() {
    return this.labelCounts.every((count) => count >= this.minSamplesPerClass);
  }

  getSampleCounts() {
    return {
      up: this.labelCounts[0],
      down: this.labelCounts[1],
      left: this.labelCounts[2],
      right: this.labelCounts[3],
    };
  }

  // Better augmentation: add noise AND slight scaling
  augmentSample(sample) {
    const noise = sample.map((v) => v + (Math.random() - 0.5) * 0.015);
    return noise;
  }

  async train() {
    if (!this.isReadyToTrain()) {
      throw new Error(`Need ${this.minSamplesPerClass} samples per class.`);
    }

    // Data augmentation: 3x dataset
    let augmentedSamples = [...this.samples];
    let augmentedLabels = [...this.labels];
    for (let i = 0; i < this.samples.length; i++) {
      for (let j = 0; j < 2; j++) {
        // create 2 augmented copies per original
        augmentedSamples.push(this.augmentSample(this.samples[i]));
        augmentedLabels.push(this.labels[i]);
      }
    }
    console.log(
      `Training on ${augmentedSamples.length} samples (${this.samples.length} original + augmented)`,
    );

    this.model = tf.sequential();
    this.model.add(
      tf.layers.dense({
        units: 20,
        activation: "relu",
        inputShape: [63],
        kernelRegularizer: tf.regularizers.l2({ l2: 0.0005 }),
      }),
    );
    this.model.add(tf.layers.dropout({ rate: 0.2 }));
    this.model.add(tf.layers.dense({ units: 4, activation: "softmax" }));

    this.model.compile({
      optimizer: tf.train.adam(0.0005),
      loss: "sparseCategoricalCrossentropy",
      metrics: ["accuracy"],
    });

    // Convert to float32 tensors (critical fix)
    const xs = tf.tensor2d(augmentedSamples, undefined, "float32");
    const ys = tf.tensor1d(augmentedLabels, "float32");

    try {
      const history = await this.model.fit(xs, ys, {
        epochs: 80,
        batchSize: 16,
        shuffle: true,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 20 === 0 || epoch === 79) {
              console.log(
                `Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}, val_acc=${logs.val_acc.toFixed(4)}`,
              );
            }
          },
        },
      });
      console.log(
        "Training done. Final val_acc:",
        history.history.val_acc.slice(-1)[0],
      );
    } catch (err) {
      console.error(err);
      throw new Error(`Training failed: ${err.message}`);
    } finally {
      xs.dispose();
      ys.dispose();
    }
  }

  predict(landmarks) {
    if (!this.model) return null;
    if (!landmarks || landmarks.length !== 21) return null;
    return tf.tidy(() => {
      const flattened = landmarks.flatMap((l) => [l.x, l.y, l.z]);
      const input = tf.tensor2d([flattened], undefined, "float32");
      const predictions = this.model.predict(input);
      const probs = predictions.dataSync(); // length 4
      const classId = probs.indexOf(Math.max(...probs));
      const confidence = Math.max(...probs);
      return { class: classId, confidence: confidence, allProbs: probs };
    });
  }
}
