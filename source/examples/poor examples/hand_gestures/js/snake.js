/**
 * GAME ENGINE: Classic Snake logic.
 *
 * - 20x20 grid, wrap-around edges.
 * - Self-collision detection.
 * - Separate from input system – only uses setDirection().
 *
 * Engineer's note: No changes from previous version except comments.
 */
export class SnakeGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.gridSize = 20; // 20x20 grid, each cell 20px
    this.cellSize = 20;
    this.reset();
  }

  /**
   * Reset game state (new snake, new food, score = 0).
   */
  reset() {
    this.snake = [{ x: 10, y: 10 }];
    this.dir = { x: 1, y: 0 }; // moving right initially
    this.nextDir = { x: 1, y: 0 };
    this.food = this.randomFood();
    this.score = 0;
    this.gameOver = false;
  }

  /**
   * Generate a food position not occupied by the snake.
   * @returns {object} { x, y }
   */
  randomFood() {
    let newFood;
    do {
      newFood = {
        x: Math.floor(Math.random() * this.gridSize),
        y: Math.floor(Math.random() * this.gridSize),
      };
    } while (
      this.snake.some(
        (segment) => segment.x === newFood.x && segment.y === newFood.y,
      )
    );
    return newFood;
  }

  /**
   * Set the next direction based on gesture label.
   * Prevents 180-degree turns.
   * @param {number} label - 0=UP, 1=DOWN, 2=LEFT, 3=RIGHT.
   */
  setDirection(label) {
    const dirMap = [
      { x: 0, y: -1 }, // up
      { x: 0, y: 1 }, // down
      { x: -1, y: 0 }, // left
      { x: 1, y: 0 }, // right
    ];
    const newDir = dirMap[label];
    if (!newDir) return;
    // Prevent reversing direction (e.g., left cannot become right)
    if (this.dir.x === -newDir.x && this.dir.y === -newDir.y) return;
    this.nextDir = newDir;
  }

  /**
   * Perform one game step: move snake, check food, check collisions.
   * @returns {boolean} False if game over, true otherwise.
   */
  step() {
    if (this.gameOver) return false;
    // Commit queued direction
    this.dir = this.nextDir;

    // Calculate new head position
    let head = {
      x: this.snake[0].x + this.dir.x,
      y: this.snake[0].y + this.dir.y,
    };

    // Wrap around edges (toroidal world)
    if (head.x < 0) head.x = this.gridSize - 1;
    if (head.x >= this.gridSize) head.x = 0;
    if (head.y < 0) head.y = this.gridSize - 1;
    if (head.y >= this.gridSize) head.y = 0;

    // Self-collision check (including new head)
    if (
      this.snake.some((segment) => segment.x === head.x && segment.y === head.y)
    ) {
      this.gameOver = true;
      return false;
    }

    this.snake.unshift(head);
    // Food consumption
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score++;
      this.food = this.randomFood();
    } else {
      this.snake.pop();
    }
    return true;
  }

  /**
   * Draw the game on the canvas.
   */
  draw() {
    this.ctx.fillStyle = "#0a0c10";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Snake body (green)
    this.ctx.fillStyle = "#10b981";
    for (let seg of this.snake) {
      this.ctx.fillRect(
        seg.x * this.cellSize,
        seg.y * this.cellSize,
        this.cellSize - 1,
        this.cellSize - 1,
      );
    }
    // Food (red)
    this.ctx.fillStyle = "#ef4444";
    this.ctx.fillRect(
      this.food.x * this.cellSize,
      this.food.y * this.cellSize,
      this.cellSize - 1,
      this.cellSize - 1,
    );

    // Score display
    this.ctx.font = 'bold 18px "Segoe UI"';
    this.ctx.fillStyle = "#f8fafc";
    this.ctx.fillText(`Score: ${this.score}`, 10, 30);

    if (this.gameOver) {
      this.ctx.font = "bold 28px monospace";
      this.ctx.fillStyle = "#ff4444";
      this.ctx.fillText("GAME OVER", 120, 200);
    }
  }

  isGameOver() {
    return this.gameOver;
  }
  getScore() {
    return this.score;
  }
}
