using System;
using System.Collections.Generic;


namespace AI2School.Agents
{
    /// <summary>Minimal 2D vector — keeps FlowField engine-agnostic (no UnityEngine).</summary>
    public readonly struct Vec2
    {
        public readonly float X, Y;
        public Vec2(float x, float y) { X = x; Y = y; }
        public float Magnitude => (float)System.Math.Sqrt(X * X + Y * Y);
        public Vec2 Normalized() { float m = Magnitude; return m > 1e-4f ? new Vec2(X / m, Y / m) : Zero; }
        public static Vec2 Zero => new Vec2(0f, 0f);
        public static Vec2 zero => Zero;
        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.X + b.X, a.Y + b.Y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.X - b.X, a.Y - b.Y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.X * s, a.Y * s);
        public static Vec2 operator /(Vec2 a, float s) => new Vec2(a.X / s, a.Y / s);
    }
}

namespace AI2School.Agents
{
    /// <summary>
    /// A flow-field (cost field + direction field) baked once per layout.
    ///
    /// - BFS wavefront from goal cells over an 8-neighbour walkable grid.
    /// - Each walkable cell stores a unit direction toward the downhill
    ///   neighbour (deterministic tie-breaking: fixed neighbour order).
    /// - Agents sample the field at O(1) per tick via bilinear interpolation.
    ///
    /// Pure C# (no Unity dependency), fully deterministic for a given input.
    /// </summary>
    public sealed class FlowField
    {
        // Neighbour order (fixed → deterministic ties): E, W, N, S, NE, SE, NW, SW
        static readonly int[] Dx = { 1, -1, 0, 0, 1, 1, -1, -1 };
        static readonly int[] Dz = { 0, 0, 1, -1, 1, -1, 1, -1 };
        static readonly float Sqrt2 = 1.41421356f;

        public int Width { get; }
        public int Height { get; }
        public float CellSize { get; }

        readonly float[] _cost;      // width*height, MaxValue when unreachable
        readonly float[] _dirX;      // unit direction per cell (0 when no path)
        readonly float[] _dirZ;

        FlowField(int width, int height, float cellSize, float[] cost, float[] dirX, float[] dirZ)
        {
            Width = width; Height = height; CellSize = cellSize;
            _cost = cost; _dirX = dirX; _dirZ = dirZ;
        }

        int Idx(int gx, int gz) => gz * Width + gx;

        public bool IsWalkable(int gx, int gz) => gx >= 0 && gz >= 0 && gx < Width && gz < Height && _cost[Idx(gx, gz)] < float.MaxValue;

        public float Cost(int gx, int gz) => _cost[Idx(gx, gz)];

        /// <summary>Unit flow direction at a world position (bilinear-sampled). Returns zero when no path.</summary>
        public Vec2 SampleWorld(float worldX, float worldZ)
        {
            float fx = worldX / CellSize - 0.5f;
            float fz = worldZ / CellSize - 0.5f;
            int gx = Math.Max(0, Math.Min(Width - 1, (int)Math.Floor(fx)));
            int gz = Math.Max(0, Math.Min(Height - 1, (int)Math.Floor(fz)));
            float tx = MathfClamp01(fx - gx);
            float tz = MathfClamp01(fz - gz);

            var d00 = Dir(gx, gz); var d10 = Dir(gx + 1, gz);
            var d01 = Dir(gx, gz + 1); var d11 = Dir(gx + 1, gz + 1);
            float x0 = Lerp(d00.X, d10.X, tx), x1 = Lerp(d01.X, d11.X, tx);
            float z0 = Lerp(d00.Y, d10.Y, tx), z1 = Lerp(d01.Y, d11.Y, tx);
            var v = new Vec2(Lerp(x0, x1, tz), Lerp(z0, z1, tz));
            float len = v.Magnitude;
            return len > 1e-4f ? v * (1f / len) : Vec2.Zero;
        }

        Vec2 Dir(int gx, int gz)
        {
            if (gx < 0 || gz < 0 || gx >= Width || gz >= Height) return Vec2.Zero;
            int i = Idx(gx, gz);
            if (_cost[i] >= float.MaxValue) return Vec2.Zero;
            return new Vec2(_dirX[i], _dirZ[i]);
        }

        /// <summary>
        /// Bake a flow-field toward goal cells. `walkable(gx, gz)` decides if a
        /// cell can be traversed; goals are the target cells (e.g. service
        /// buildings). Deterministic: BFS with fixed tie-breaking.
        /// </summary>
        public static FlowField Bake(int width, int height, float cellSize,
            Func<int, int, bool> walkable, IReadOnlyList<(int gx, int gz)> goals)
        {
            int n = width * height;
            var cost = new float[n];
            var dirX = new float[n];
            var dirZ = new float[n];
            for (int i = 0; i < n; i++) cost[i] = float.MaxValue;

            var queue = new Queue<(int gx, int gz)>();
            foreach (var (gx, gz) in goals)
            {
                if (gx < 0 || gz < 0 || gx >= width || gz >= height) continue;
                if (!walkable(gx, gz)) continue;
                int i = gz * width + gx;
                if (cost[i] != 0f)
                {
                    cost[i] = 0f;
                    queue.Enqueue((gx, gz));
                }
            }

            while (queue.Count > 0)
            {
                var (cx, cz) = queue.Dequeue();
                float cc = cost[cz * width + cx];
                for (int k = 0; k < 8; k++)
                {
                    int nx = cx + Dx[k], nz = cz + Dz[k];
                    if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
                    if (!walkable(nx, nz)) continue;
                    int ni = nz * width + nx;
                    float step = (Dx[k] != 0 && Dz[k] != 0) ? Sqrt2 : 1f;
                    if (cc + step < cost[ni])
                    {
                        cost[ni] = cc + step;
                        dirX[ni] = -Dx[k];
                        dirZ[ni] = -Dz[k];
                        queue.Enqueue((nx, nz));
                    }
                }
            }

            // Normalise direction fields (goal cells keep zero).
            for (int gz = 0; gz < height; gz++)
            for (int gx = 0; gx < width; gx++)
            {
                int i = gz * width + gx;
                if (cost[i] >= float.MaxValue) continue;
                float dx = dirX[i], dz = dirZ[i];
                float len = (float)Math.Sqrt(dx * dx + dz * dz);
                if (len > 1e-4f) { dirX[i] = dx / len; dirZ[i] = dz / len; }
                else { dirX[i] = 0f; dirZ[i] = 0f; }
            }

            return new FlowField(width, height, cellSize, cost, dirX, dirZ);
        }

        static float MathfClamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
        static float Lerp(float a, float b, float t) => a + (b - a) * t;
    }
}
