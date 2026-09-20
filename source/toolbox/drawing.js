/**
 * DrawingManager — Canvas shape & color recognition for K2/K3 drawing lessons.
 *
 * Provides on-device classification of basic shapes (circle, square, triangle)
 * and dominant color detection from a canvas element. No external ML needed —
 * uses pixel-based feature extraction heuristics suitable for children's drawings.
 *
 * Usage:
 *   const dm = new DrawingManager(canvasElement);
 *   dm.addLabel('circle');
 *   dm.addLabel('square');
 *   dm.addLabel('triangle');
 *   dm.addColor('red', '#FF0000');
 *   dm.addColor('blue', '#0000FF');
 *   dm.addColor('yellow', '#FFFF00');
 *   const result = dm.recognize(); // { shape: 'circle', color: 'red', confidence: 0.85 }
 *
 * Also supports KNN teaching mode for custom shapes.
 */

const DrawingManager = (() => {
  const RESOLUTION = 32; // downsample canvas to 32x32 for analysis
  const SAMPLE_STRIDE = 8; // pixel stride for KNN feature extraction

  class DrawingManager {
    constructor(canvas) {
      if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error('DrawingManager requires a valid HTMLCanvasElement');
      }
      this._canvas = canvas;
      this._labels = [];
      this._colors = [];
      this._knnData = []; // { embedding: number[], label: string }
      this._enabled = true;
    }

    /**
     * Register a shape label the system should recognize.
     * Built-in shapes: 'circle', 'square', 'triangle'.
     * Custom labels go through KNN teaching.
     */
    addLabel(label) {
      if (!this._labels.includes(label)) {
        this._labels.push(label);
      }
    }

    /**
     * Register a color the system should detect.
     * @param {string} name - human-readable color name
     * @param {string} hex - hex color string e.g. '#FF0000'
     */
    addColor(name, hex) {
      this._colors.push({ name, hex });
    }

    /**
     * Teach the system a custom shape by capturing current canvas content.
     * @param {string} label - the shape label to associate with current drawing
     */
    teach(label) {
      const features = this._extractFeatures();
      if (features) {
        this._knnData.push({ embedding: features, label });
        this.addLabel(label);
      }
    }

    /**
     * Main recognition: classify shape and detect dominant color.
     * @returns {{ shape: string|null, color: string|null, confidence: number }}
     */
    recognize() {
      if (!this._enabled) {
        return { shape: null, color: null, confidence: 0 };
      }

      const shapeResult = this._classifyShape();
      const colorResult = this._detectColor();
      return {
        shape: shapeResult.label,
        color: colorResult.name,
        confidence: shapeResult.confidence
      };
    }

    /**
     * Check if the canvas has been drawn on (non-empty).
     * @returns {boolean}
     */
    hasDrawing() {
      const ctx = this._canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0) return true;
      }
      return false;
    }

    /**
     * Clear all KNN teaching data.
     */
    resetTeaching() {
      this._knnData = [];
    }

    /**
     * Persist KNN teaching data to localStorage.
     * @param {string} key
     */
    save(key = 'drawing_knn') {
      try {
        localStorage.setItem(key, JSON.stringify(this._knnData));
      } catch (e) {
        console.warn('DrawingManager: could not save KNN data', e);
      }
    }

    /**
     * Load KNN teaching data from localStorage.
     * @param {string} key
     */
    load(key = 'drawing_knn') {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          this._knnData = JSON.parse(data);
          this._knnData.forEach(d => this.addLabel(d.label));
        }
      } catch (e) {
        console.warn('DrawingManager: could not load KNN data', e);
      }
    }

    destroy() {
      this._canvas = null;
      this._labels = [];
      this._colors = [];
      this._knnData = [];
      this._enabled = false;
    }

    // ---- Private methods ----

    _extractFeatures() {
      const ctx = this._canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);

      // Downsample to RESOLUTION x RESOLUTION grid
      const scaleX = this._canvas.width / RESOLUTION;
      const scaleY = this._canvas.height / RESOLUTION;
      const grid = new Array(RESOLUTION).fill(0).map(() => new Array(RESOLUTION).fill(false));
      let filledCount = 0;

      for (let gy = 0; gy < RESOLUTION; gy++) {
        for (let gx = 0; gx < RESOLUTION; gx++) {
          const x = Math.floor(gx * scaleX);
          const y = Math.floor(gy * scaleY);
          const idx = (y * this._canvas.width + x) * 4;
          if (imageData.data[idx + 3] > 30) {
            grid[gy][gx] = true;
            filledCount++;
          }
        }
      }

      if (filledCount === 0) return null;

      // Bounding box
      let minX = RESOLUTION, minY = RESOLUTION, maxX = 0, maxY = 0;
      for (let gy = 0; gy < RESOLUTION; gy++) {
        for (let gx = 0; gx < RESOLUTION; gx++) {
          if (grid[gy][gx]) {
            if (gx < minX) minX = gx;
            if (gy < minY) minY = gy;
            if (gx > maxX) maxX = gx;
            if (gy > maxY) maxY = gy;
          }
        }
      }

      const bboxW = maxX - minX + 1;
      const bboxH = maxY - minY + 1;
      const bboxRatio = Math.min(bboxW, bboxH) / Math.max(bboxW, bboxH);

      // Quadrant pixel density
      const midX = Math.floor((minX + maxX) / 2);
      const midY = Math.floor((minY + maxY) / 2);
      let qTL = 0, qTR = 0, qBL = 0, qBR = 0;
      let qCount = 0;

      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          if (grid[gy][gx]) {
            if (gy <= midY && gx <= midX) qTL++;
            else if (gy <= midY && gx > midX) qTR++;
            else if (gy > midY && gx <= midX) qBL++;
            else qBR++;
            qCount++;
          }
        }
      }

      const total = qCount || 1;
      const qVariation = Math.max(qTL, qTR, qBL, qBR) / total - Math.min(qTL, qTR, qBL, qBR) / total;

      // Convex hull approximation: ratio of filled points along boundary scan lines
      let edgePoints = 0;
      for (let gy = minY; gy <= maxY; gy++) {
        let first = -1, last = -1;
        for (let gx = minX; gx <= maxX; gx++) {
          if (grid[gy][gx]) {
            if (first === -1) first = gx;
            last = gx;
          }
        }
        if (first !== -1) edgePoints += 2;
      }
      const edgeRatio = edgePoints / Math.max(total, 1);

      // KNN feature vector (flattened for storage)
      const features = [];
      for (let gy = 0; gy < RESOLUTION; gy += SAMPLE_STRIDE) {
        for (let gx = 0; gx < RESOLUTION; gx += SAMPLE_STRIDE) {
          features.push(grid[gy][gx] ? 1 : 0);
        }
      }

      return {
        features,
        filledCount,
        bboxRatio,
        qVariation,
        edgeRatio,
        total
      };
    }

    _classifyShape() {
      const feat = this._extractFeatures();
      if (!feat) {
        return { label: null, confidence: 0 };
      }

      const { bboxRatio, qVariation, edgeRatio, total } = feat;

      // Circle: nearly square bounding box, even quadrant distribution, smooth edges
      const circleScore = (bboxRatio * 0.4) + ((1 - qVariation) * 0.3) + ((1 - edgeRatio / total) * 0.3);

      // Square: nearly square bbox, more uniform quadrant distribution, sharper edges
      const squareScore = (bboxRatio * 0.3) + ((1 - qVariation) * 0.35) + ((edgeRatio / total) * 0.35);

      // Triangle: bounding box ratio ~0.5 (tall or wide), uneven quadrant distribution
      const triangleRatio = bboxRatio * (1 - bboxRatio) * 4; // peaks at 0.5
      const triangleScore = (triangleRatio * 0.3) + (qVariation * 0.35) + ((1 - bboxRatio) * 0.35);

      const scores = { circle: circleScore, square: squareScore, triangle: triangleScore };

      // If there's KNN data, compare against stored embeddings
      if (this._knnData.length > 0) {
        const knnResult = this._knnClassify(feat.features);
        if (knnResult && knnResult.confidence > 0.6) {
          // KNN overrides heuristics for custom shapes
          return { label: knnResult.label, confidence: knnResult.confidence };
        }
      }

      // Find best match for built-in shapes
      let bestLabel = null;
      let bestScore = 0;
      for (const [label, score] of Object.entries(scores)) {
        if (this._labels.includes(label) && score > bestScore) {
          bestScore = score;
          bestLabel = label;
        }
      }

      // Minimum confidence threshold
      if (bestScore < 0.4 || total < 10) {
        return { label: 'unknown', confidence: bestScore };
      }

      return { label: bestLabel, confidence: bestScore };
    }

    _knnClassify(features) {
      if (this._knnData.length === 0) return null;

      const K = 3;
      const distances = this._knnData.map(item => {
        let sum = 0;
        for (let i = 0; i < features.length; i++) {
          const diff = features[i] - (item.embedding[i] || 0);
          sum += diff * diff;
        }
        return { label: item.label, distance: Math.sqrt(sum) };
      });

      distances.sort((a, b) => a.distance - b.distance);

      // Top-K voting
      const votes = {};
      for (let i = 0; i < Math.min(K, distances.length); i++) {
        const label = distances[i].label;
        votes[label] = (votes[label] || 0) + 1;
      }

      let bestLabel = null;
      let bestVotes = 0;
      for (const [label, count] of Object.entries(votes)) {
        if (count > bestVotes) {
          bestVotes = count;
          bestLabel = label;
        }
      }

      return { label: bestLabel, confidence: bestVotes / Math.min(K, distances.length) };
    }

    _detectColor() {
      const ctx = this._canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);

      let totalR = 0, totalG = 0, totalB = 0, pixelCount = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        const a = imageData.data[i + 3];
        if (a > 30) {
          totalR += imageData.data[i];
          totalG += imageData.data[i + 1];
          totalB += imageData.data[i + 2];
          pixelCount++;
        }
      }

      if (pixelCount === 0) {
        return { name: null, hex: null };
      }

      const avgR = Math.round(totalR / pixelCount);
      const avgG = Math.round(totalG / pixelCount);
      const avgB = Math.round(totalB / pixelCount);

      // Try to match registered colors
      if (this._colors.length > 0) {
        let bestDist = Infinity;
        let bestColor = this._colors[0];

        for (const color of this._colors) {
          const hex = color.hex.replace('#', '');
          const cr = parseInt(hex.substring(0, 2), 16);
          const cg = parseInt(hex.substring(2, 4), 16);
          const cb = parseInt(hex.substring(4, 6), 16);
          const dist = Math.sqrt(
            (avgR - cr) ** 2 + (avgG - cg) ** 2 + (avgB - cb) ** 2
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestColor = color;
          }
        }

        // Reject if too far from any registered color (threshold ~100 in RGB space)
        if (bestDist < 100) {
          return { name: bestColor.name, hex: bestColor.hex };
        }
      }

      return { name: null, hex: `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}` };
    }
  }

  return DrawingManager;
})();

// Export for module use (works in both <script> and module contexts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DrawingManager;
}
