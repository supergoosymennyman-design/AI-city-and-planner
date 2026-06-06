/**
 * Drawing Manager with Touch & Mouse Support
 * Handles canvas drawing for tablets, pens, and mice
 * Based on user's working implementation
 */

class DrawingManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.onDrawingEnd = options.onDrawingEnd || null;
    this.onStrokeStart = options.onStrokeStart || null;

    // Drawing state
    this.isDrawing = false;
    this.history = [];
    this.brushSize = options.brushSize || 12;
    this.brushColor = options.brushColor || '#2c3e66';

    // Touch prevention
    this.canvas.style.touchAction = 'none';

    this.setupCanvas();
    this.setupEvents();
    this.saveState();
  }

  /**
   * Initialize canvas with white background
   */
  setupCanvas() {
    // Ensure proper sizing
    const rect = this.canvas.getBoundingClientRect();
    if (this.canvas.width === 300) { // Default canvas size
      this.canvas.width = rect.width || 600;
      this.canvas.height = rect.height || 400;
    }

    // White background
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Brush defaults
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.brushColor;
  }

  /**
   * Set up mouse and touch event listeners
   */
  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDraw(e));
    window.addEventListener('mousemove', (e) => this.draw(e));
    window.addEventListener('mouseup', () => this.endDraw());
    this.canvas.addEventListener('mouseleave', () => this.endDraw());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDraw(e);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDrawing) {
        e.preventDefault();
        this.draw(e);
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.endDraw();
    }, { passive: false });

    window.addEventListener('touchcancel', () => this.endDraw());
  }

  /**
   * Get canvas coordinates from mouse/touch event
   */
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    let x = (clientX - rect.left) * scaleX;
    let y = (clientY - rect.top) * scaleY;

    // Clamp to canvas bounds
    x = Math.min(Math.max(0, x), this.canvas.width);
    y = Math.min(Math.max(0, y), this.canvas.height);

    return { x, y };
  }

  /**
   * Start a new stroke (mouse or touch)
   */
  startDraw(e) {
    e.preventDefault();
    this.isDrawing = true;

    const pos = this.getCanvasCoords(e);

    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
    this.ctx.lineWidth = this.brushSize;
    this.ctx.strokeStyle = this.brushColor;

    if (this.onStrokeStart) {
      this.onStrokeStart(pos);
    }
  }

  /**
   * Continue drawing stroke
   */
  draw(e) {
    if (!this.isDrawing) return;
    e.preventDefault();

    const pos = this.getCanvasCoords(e);
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();

    // Restart path for smoother lines
    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }

  /**
   * End the current stroke
   */
  endDraw() {
    if (!this.isDrawing) return;

    this.isDrawing = false;
    this.ctx.closePath();

    // Save state for undo
    this.saveState();

    // Trigger callback for AI recognition
    if (this.onDrawingEnd) {
      this.onDrawingEnd();
    }
  }

  /**
   * Save current canvas state to history for undo
   */
  saveState() {
    try {
      this.history.push(
        this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
      );
      // Limit history to prevent memory issues
      if (this.history.length > 20) {
        this.history.shift();
      }
    } catch (e) {
      console.warn('Could not save canvas state:', e);
    }
  }

  /**
   * Undo last stroke
   */
  undo() {
    if (this.history.length > 1) {
      this.history.pop(); // Remove current state
      const prev = this.history[this.history.length - 1];
      this.ctx.putImageData(prev, 0, 0);

      if (this.onDrawingEnd) {
        this.onDrawingEnd();
      }
      return true;
    }
    return false;
  }

  /**
   * Clear the entire canvas
   */
  clearCanvas() {
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveState();

    if (this.onDrawingEnd) {
      this.onDrawingEnd();
    }
  }

  /**
   * Change brush size
   */
  setBrushSize(size) {
    this.brushSize = size;
    this.ctx.lineWidth = size;
  }

  /**
   * Change brush color
   */
  setBrushColor(color) {
    this.brushColor = color;
    this.ctx.strokeStyle = color;
  }

  /**
   * Get canvas as base64 for API
   */
  toBase64() {
    return canvasToBase64(this.canvas);
  }

  /**
   * Check if canvas is empty (just white background)
   */
  isEmpty() {
    // Quick check: compare to blank canvas
    const blank = document.createElement('canvas');
    blank.width = this.canvas.width;
    blank.height = this.canvas.height;
    const blankCtx = blank.getContext('2d');
    blankCtx.fillStyle = 'white';
    blankCtx.fillRect(0, 0, blank.width, blank.height);

    return this.canvas.toDataURL() === blank.toDataURL();
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.DrawingManager = DrawingManager;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DrawingManager };
}
