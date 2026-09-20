/**
 * Pathfinding — A*, BFS, TSP heuristics & Boids for primary city simulation games.
 *
 * Provides pure-JS implementations of common pathfinding and optimization
 * algorithms used in P1-03 through P1-06 lessons. No external dependencies.
 *
 * Usage (A*):
 *   const pf = new Pathfinding(grid, { width: 10, height: 10 });
 *   pf.setObstacles([{x:3,y:3}, {x:4,y:3}]);
 *   const path = pf.findPath({x:0,y:0}, {x:9,y:9});
 *
 * Usage (Boids):
 *   const boids = new Boids(20, { width: 800, height: 600 });
 *   boids.addObstacle({x:400, y:300, radius:50});
 *   boids.update(); // call each frame
 */

const Pathfinding = (() => {

  // ---- Grid Pathfinding ----

  class GridPathfinder {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.obstacles = new Set();
      this.weights = new Map(); // "x,y" -> weight multiplier (1 = normal)
    }

    /**
     * Add an obstacle at grid position.
     */
    addObstacle(x, y) {
      this.obstacles.add(`${x},${y}`);
    }

    /**
     * Remove an obstacle at grid position.
     */
    removeObstacle(x, y) {
      this.obstacles.delete(`${x},${y}`);
    }

    /**
     * Set edge weight for a grid cell (for weighted pathfinding).
     * Higher weight = more expensive to traverse.
     */
    setWeight(x, y, weight) {
      if (weight === 1) {
        this.weights.delete(`${x},${y}`);
      } else {
        this.weights.set(`${x},${y}`, weight);
      }
    }

    /**
     * Check if a position is passable.
     */
    isPassable(x, y) {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
      return !this.obstacles.has(`${x},${y}`);
    }

    /**
     * A* pathfinding with optional weighted cells.
     * @param {{x:number,y:number}} start
     * @param {{x:number,y:number}} end
     * @param {string} [heuristic] - 'manhattan' | 'euclidean' | 'diagonal'
     * @returns {Array<{x:number,y:number}>|null} path or null if no path exists
     */
    findPath(start, end, heuristic = 'manhattan') {
      if (!this.isPassable(start.x, start.y) || !this.isPassable(end.x, end.y)) {
        return null;
      }

      const openSet = new Map(); // key -> {x, y, g, f, parent}
      const closedSet = new Set();
      const startKey = `${start.x},${start.y}`;
      const endKey = `${end.x},${end.y}`;

      openSet.set(startKey, {
        x: start.x, y: start.y,
        g: 0,
        f: this._heuristic(start, end, heuristic),
        parent: null
      });

      while (openSet.size > 0) {
        // Find node with lowest f score
        let currentKey = null;
        let lowestF = Infinity;
        for (const [key, node] of openSet) {
          if (node.f < lowestF) {
            lowestF = node.f;
            currentKey = key;
          }
        }

        const current = openSet.get(currentKey);
        openSet.delete(currentKey);
        closedSet.add(currentKey);

        // Reached goal
        if (current.x === end.x && current.y === end.y) {
          return this._reconstructPath(current);
        }

        // Explore neighbors (4-directional)
        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
          const nKey = `${neighbor.x},${neighbor.y}`;

          if (!this.isPassable(neighbor.x, neighbor.y) || closedSet.has(nKey)) {
            continue;
          }

          const weight = this.weights.get(nKey) || 1;
          const tentativeG = current.g + weight;

          const existing = openSet.get(nKey);
          if (existing && tentativeG >= existing.g) {
            continue;
          }

          openSet.set(nKey, {
            x: neighbor.x, y: neighbor.y,
            g: tentativeG,
            f: tentativeG + this._heuristic(neighbor, end, heuristic),
            parent: current
          });
        }
      }

      return null; // No path found
    }

    /**
     * BFS — simpler, unweighted pathfinding. Good for P1-03.
     */
    findPathBFS(start, end) {
      if (!this.isPassable(start.x, start.y) || !this.isPassable(end.x, end.y)) {
        return null;
      }

      const queue = [{ x: start.x, y: start.y, parent: null }];
      const visited = new Set();
      visited.add(`${start.x},${start.y}`);

      while (queue.length > 0) {
        const current = queue.shift();

        if (current.x === end.x && current.y === end.y) {
          return this._reconstructPath(current);
        }

        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 }
        ];

        for (const neighbor of neighbors) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (this.isPassable(neighbor.x, neighbor.y) && !visited.has(key)) {
            visited.add(key);
            queue.push({ x: neighbor.x, y: neighbor.y, parent: current });
          }
        }
      }

      return null;
    }

    /**
     * Get all cells within a given Manhattan distance from a point.
     * Useful for showing "reachable area" or sensor range.
     */
    getReachableArea(center, maxDistance) {
      const reachable = [];
      for (let x = center.x - maxDistance; x <= center.x + maxDistance; x++) {
        for (let y = center.y - maxDistance; y <= center.y + maxDistance; y++) {
          if (this.isPassable(x, y)) {
            const dist = Math.abs(x - center.x) + Math.abs(y - center.y);
            if (dist <= maxDistance) {
              reachable.push({ x, y, distance: dist });
            }
          }
        }
      }
      return reachable;
    }

    // ---- Private ----

    _heuristic(a, b, type) {
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      switch (type) {
        case 'euclidean': return Math.sqrt(dx * dx + dy * dy);
        case 'diagonal': return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        case 'manhattan':
        default: return dx + dy;
      }
    }

    _reconstructPath(node) {
      const path = [];
      let current = node;
      while (current) {
        path.unshift({ x: current.x, y: current.y });
        current = current.parent;
      }
      return path;
    }
  }

  // ---- TSP Solvers ----

  class TSPSolver {
    /**
     * @param {Array<{x:number,y:number,id?:string}>} points
     */
    constructor(points) {
      this.points = points;
      this._distCache = new Map();
    }

    /**
     * Greedy nearest-neighbor TSP (starts from first point).
     * Simple, intuitive for kids to understand and compare with AI.
     * @returns {{route: Array<number>, distance: number}}
     */
    nearestNeighbor(startIndex = 0) {
      const n = this.points.length;
      const visited = new Set([startIndex]);
      const route = [startIndex];
      let totalDist = 0;
      let current = startIndex;

      while (visited.size < n) {
        let nearest = -1;
        let nearestDist = Infinity;

        for (let i = 0; i < n; i++) {
          if (!visited.has(i)) {
            const dist = this._distance(current, i);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = i;
            }
          }
        }

        visited.add(nearest);
        route.push(nearest);
        totalDist += nearestDist;
        current = nearest;
      }

      // Return to start
      totalDist += this._distance(current, startIndex);
      route.push(startIndex);

      return { route, distance: Math.round(totalDist * 100) / 100 };
    }

    /**
     * 2-opt improvement on an existing route.
     * Shows how AI can refine a solution.
     * @param {Array<number>} route - initial route (indices)
     * @param {number} [iterations] - max iterations
     * @returns {{route: Array<number>, distance: number, improved: boolean}}
     */
    twoOpt(route, iterations = 100) {
      let bestRoute = [...route];
      let bestDist = this._routeDistance(bestRoute);
      let improved = false;

      for (let iter = 0; iter < iterations; iter++) {
        let found = false;

        for (let i = 1; i < bestRoute.length - 2; i++) {
          for (let j = i + 1; j < bestRoute.length - 1; j++) {
            const newRoute = this._twoOptSwap(bestRoute, i, j);
            const newDist = this._routeDistance(newRoute);

            if (newDist < bestDist - 0.001) {
              bestRoute = newRoute;
              bestDist = newDist;
              found = true;
              improved = true;
            }
          }
        }

        if (!found) break;
      }

      return { route: bestRoute, distance: Math.round(bestDist * 100) / 100, improved };
    }

    /**
     * Brute force for small sets (<= 8 points). O(n!).
     * Used to show the optimal answer vs heuristic approximations.
     */
    bruteForce() {
      if (this.points.length > 8) {
        return { route: null, distance: Infinity, note: 'Too many points for brute force' };
      }

      const n = this.points.length;
      const indices = Array.from({ length: n }, (_, i) => i);
      let bestRoute = [...indices, 0];
      let bestDist = Infinity;

      // Generate all permutations (skip first point which is fixed start)
      this._permute(indices.slice(1), 0, (perm) => {
        const route = [0, ...perm];
        const dist = this._routeDistance(route); // not returning to start — routeDistance handles it
        if (dist < bestDist) {
          bestDist = dist;
          bestRoute = [...route];
        }
      });

      return { route: [...bestRoute, 0], distance: Math.round(bestDist * 100) / 100 };
    }

    // ---- Private ----

    _distance(i, j) {
      const key = i < j ? `${i},${j}` : `${j},${i}`;
      if (this._distCache.has(key)) return this._distCache.get(key);

      const a = this.points[i];
      const b = this.points[j];
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      this._distCache.set(key, dist);
      return dist;
    }

    _routeDistance(route) {
      let dist = 0;
      for (let i = 0; i < route.length - 1; i++) {
        dist += this._distance(route[i], route[i + 1]);
      }
      return dist;
    }

    _twoOptSwap(route, i, j) {
      const newRoute = [...route];
      // Reverse segment between i and j
      while (i < j) {
        [newRoute[i], newRoute[j]] = [newRoute[j], newRoute[i]];
        i++;
        j--;
      }
      return newRoute;
    }

    _permute(arr, start, callback) {
      if (start === arr.length - 1) {
        callback([...arr]);
        return;
      }
      for (let i = start; i < arr.length; i++) {
        [arr[start], arr[i]] = [arr[i], arr[start]];
        this._permute(arr, start + 1, callback);
        [arr[start], arr[i]] = [arr[i], arr[start]];
      }
    }
  }

  // ---- Boids (Swarm Intelligence) ----

  class Boids {
    /**
     * @param {number} count - number of boids
     * @param {{width:number, height:number}} bounds
     * @param {object} [params]
     */
    constructor(count, bounds, params = {}) {
      this.bounds = bounds;
      this.obstacles = []; // { x, y, radius }
      this.boids = [];
      this.separationWeight = params.separationWeight || 1.5;
      this.alignmentWeight = params.alignmentWeight || 1.0;
      this.cohesionWeight = params.cohesionWeight || 1.0;
      this.maxSpeed = params.maxSpeed || 3;
      this.maxForce = params.maxForce || 0.1;
      this.perceptionRadius = params.perceptionRadius || 50;
      this.separationRadius = params.separationRadius || 25;

      for (let i = 0; i < count; i++) {
        this.boids.push({
          x: Math.random() * bounds.width,
          y: Math.random() * bounds.height,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2
        });
      }
    }

    addObstacle(obstacle) {
      this.obstacles.push(obstacle);
    }

    /**
     * Advance simulation by one tick.
     */
    update() {
      for (const boid of this.boids) {
        const { sepX, sepY } = this._separation(boid);
        const { aliX, aliY } = this._alignment(boid);
        const { cohX, cohY } = this._cohesion(boid);
        const { obsX, obsY } = this._avoidObstacles(boid);

        // Apply forces
        boid.vx += sepX * this.separationWeight + aliX * this.alignmentWeight + cohX * this.cohesionWeight + obsX * 3;
        boid.vy += sepY * this.separationWeight + aliY * this.alignmentWeight + cohY * this.cohesionWeight + obsY * 3;

        // Limit speed
        const speed = Math.sqrt(boid.vx ** 2 + boid.vy ** 2);
        if (speed > this.maxSpeed) {
          boid.vx = (boid.vx / speed) * this.maxSpeed;
          boid.vy = (boid.vy / speed) * this.maxSpeed;
        }

        // Update position
        boid.x += boid.vx;
        boid.y += boid.vy;

        // Wrap around edges
        if (boid.x < 0) boid.x += this.bounds.width;
        if (boid.x >= this.bounds.width) boid.x -= this.bounds.width;
        if (boid.y < 0) boid.y += this.bounds.height;
        if (boid.y >= this.bounds.height) boid.y -= this.bounds.height;
      }
    }

    // ---- Private ----

    _separation(boid) {
      let sepX = 0, sepY = 0, count = 0;
      for (const other of this.boids) {
        if (other === boid) continue;
        const dx = boid.x - other.x;
        const dy = boid.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.separationRadius && dist > 0) {
          sepX += dx / dist;
          sepY += dy / dist;
          count++;
        }
      }
      if (count > 0) {
        sepX /= count;
        sepY /= count;
        const mag = Math.sqrt(sepX ** 2 + sepY ** 2);
        if (mag > 0) {
          sepX = (sepX / mag) * this.maxSpeed - boid.vx;
          sepY = (sepY / mag) * this.maxSpeed - boid.vy;
          // Limit force
          const forceMag = Math.sqrt(sepX ** 2 + sepY ** 2);
          if (forceMag > this.maxForce) {
            sepX = (sepX / forceMag) * this.maxForce;
            sepY = (sepY / forceMag) * this.maxForce;
          }
        }
      }
      return { sepX, sepY };
    }

    _alignment(boid) {
      let avgVX = 0, avgVY = 0, count = 0;
      for (const other of this.boids) {
        if (other === boid) continue;
        const dx = boid.x - other.x;
        const dy = boid.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.perceptionRadius) {
          avgVX += other.vx;
          avgVY += other.vy;
          count++;
        }
      }
      if (count > 0) {
        avgVX /= count;
        avgVY /= count;
        const mag = Math.sqrt(avgVX ** 2 + avgVY ** 2);
        if (mag > 0) {
          avgVX = (avgVX / mag) * this.maxSpeed - boid.vx;
          avgVY = (avgVY / mag) * this.maxSpeed - boid.vy;
          const forceMag = Math.sqrt(avgVX ** 2 + avgVY ** 2);
          if (forceMag > this.maxForce) {
            avgVX = (avgVX / forceMag) * this.maxForce;
            avgVY = (avgVY / forceMag) * this.maxForce;
          }
        }
      }
      return { aliX: avgVX, aliY: avgVY };
    }

    _cohesion(boid) {
      let centerX = 0, centerY = 0, count = 0;
      for (const other of this.boids) {
        if (other === boid) continue;
        const dx = boid.x - other.x;
        const dy = boid.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.perceptionRadius) {
          centerX += other.x;
          centerY += other.y;
          count++;
        }
      }
      if (count > 0) {
        centerX /= count;
        centerY /= count;
        const dx = centerX - boid.x;
        const dy = centerY - boid.y;
        const mag = Math.sqrt(dx ** 2 + dy ** 2);
        if (mag > 0) {
          const steerX = (dx / mag) * this.maxSpeed - boid.vx;
          const steerY = (dy / mag) * this.maxSpeed - boid.vy;
          const forceMag = Math.sqrt(steerX ** 2 + steerY ** 2);
          if (forceMag > this.maxForce) {
            return { cohX: (steerX / forceMag) * this.maxForce, cohY: (steerY / forceMag) * this.maxForce };
          }
          return { cohX: steerX, cohY: steerY };
        }
      }
      return { cohX: 0, cohY: 0 };
    }

    _avoidObstacles(boid) {
      let obsX = 0, obsY = 0;
      for (const obs of this.obstacles) {
        const dx = boid.x - obs.x;
        const dy = boid.y - obs.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < obs.radius + this.separationRadius) {
          obsX += dx / (dist || 1);
          obsY += dy / (dist || 1);
        }
      }
      return { obsX, obsY };
    }
  }

  return { GridPathfinder, TSPSolver, Boids };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Pathfinding;
}
