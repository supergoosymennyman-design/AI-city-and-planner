using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using AI2School.Agents;
using AI2School.Core.Capability;
using AI2School.Core.Determinism;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// The reveal run. Bakes a flow-field from the layout (obstacles = home +
    /// service footprints, goals = services), spawns one instanced citizen per
    /// home at its nearest walkable cell, and each tick a home evaluates the
    /// stub threshold capability ("coverage margin ≥ 0" → served); served homes
    /// walk their citizen along the flow-field to the service. Deterministic.
    /// Logs [P1SIM] lines; bounded; callback on completion.
    /// </summary>
    public class SimulationRunner : MonoBehaviour
    {
        public float LastCoverage { get; private set; }

        const float AgentSpeed = 6f;
        const float MaxSimSeconds = 25f;
        const float ArriveDistance = 2f;
        const float GridCell = 4f;

        Mesh _cube;
        Material _mat;
        Matrix4x4[] _matrices;
        AgentState[] _agents;
        FlowField _flow;
        float _elapsed;
        int _arrived;
        int _served;
        Action _onComplete;
        float _nextLogAt;

        struct AgentState
        {
            public Vector3 Pos;
            public Vector3 Target;
            public bool Served;
            public bool Arrived;
        }

        ICapability _capability;
        ICapabilityRuntime _runtime;

        public void Run(List<PlacedPieceData> pieces, Func<string, PalettePieceData> findPalette,
            float coverageRadius, ulong masterSeed, Action onComplete)
        {
            _onComplete = onComplete;
            _elapsed = 0;
            _arrived = 0;
            _served = 0;
            _nextLogAt = 0;

            var homes = new List<PlacedPieceData>();
            var services = new List<Vector2>();
            foreach (var p in pieces)
            {
                var piece = findPalette(p.pieceId);
                if (piece == null) continue;
                if (piece.category == "home") homes.Add(p);
                else if (piece.category == "service") services.Add(new Vector2(p.x, p.z));
            }

            _capability = new ThresholdCapability("coverage_margin", 0.0);
            _runtime = new ThresholdRuntime();
            var rng = new DeterministicRng(DeterministicRng.SeedForStream(masterSeed, 3));

            // ── Bake flow-field: goals = service cells, obstacles = home + service footprints ──
            var grid = BuildObstacleGrid(pieces, findPalette, out int gw, out int gh);
            var goals = new List<(int, int)>();
            foreach (var s in services)
            {
                int gx = Mathf.FloorToInt(s.x / GridCell);
                int gz = Mathf.FloorToInt(s.y / GridCell);
                if (gx >= 0 && gz >= 0 && gx < gw && gz < gh) goals.Add((gx, gz));
            }
            _flow = FlowField.Bake(gw, gh, GridCell, (gx, gz) => !grid[gz * gw + gx], goals);

            _agents = new AgentState[homes.Count];
            _matrices = new Matrix4x4[homes.Count];
            for (int i = 0; i < homes.Count; i++)
            {
                var home = homes[i];
                var to = NearestService(new Vector2(home.x, home.z), services);
                float dist = to.HasValue ? Vector2.Distance(new Vector2(home.x, home.z), to.Value) : float.MaxValue;
                float margin = coverageRadius - dist;

                var snap = new WorldSnapshot(rng.NextUInt(), new Dictionary<string, float>
                {
                    ["coverage_margin"] = margin,
                });
                var decision = _runtime.Evaluate(_capability, snap);
                bool served = decision.Label == "pass";
                if (served) _served++;

                var spawn = NearestWalkableCell(new Vector2(home.x, home.z), grid, gw, gh, GridCell);
                var target = to.HasValue ? new Vector3(to.Value.x, 0.5f, to.Value.y) : spawn;

                _agents[i] = new AgentState { Pos = spawn, Target = target, Served = served };
                _matrices[i] = Matrix4x4.TRS(spawn, Quaternion.identity, Vector3.one * 0.8f);
            }

            _cube = BuildCubeMesh();
            _mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            _mat.color = new Color(0.2f, 0.75f, 0.95f);
            _mat.enableInstancing = true;

            Debug.Log($"[P1SIM] start homes={homes.Count} services={services.Count} served={_served} flow={gw}x{gh}");
        }

        // ── Grid / spawn helpers ─────────────────────────────────────────────
        static bool[] BuildObstacleGrid(List<PlacedPieceData> pieces, Func<string, PalettePieceData> findPalette,
            out int gw, out int gh)
        {
            // District bounds come from the manifest footprint (240 x 240).
            const float size = 240f;
            gw = Mathf.CeilToInt(size / GridCell);
            gh = Mathf.CeilToInt(size / GridCell);
            var blocked = new bool[gw * gh];
            foreach (var p in pieces)
            {
                var piece = findPalette(p.pieceId);
                // Obstacles = home footprints only. Services are walkable
                // (they are the flow-field GOALS — a blocked goal is skipped
                // by Bake, leaving no path). Parks are walkable green space.
                if (piece == null || piece.category != "home") continue;
                var fp = piece.footprintMeters;
                float halfW = fp[0] / 2f, halfD = fp[1] / 2f;
                int g0x = Mathf.Max(0, Mathf.FloorToInt((p.x - halfW) / GridCell));
                int g1x = Mathf.Min(gw - 1, Mathf.FloorToInt((p.x + halfW) / GridCell));
                int g0z = Mathf.Max(0, Mathf.FloorToInt((p.z - halfD) / GridCell));
                int g1z = Mathf.Min(gh - 1, Mathf.FloorToInt((p.z + halfD) / GridCell));
                for (int gz = g0z; gz <= g1z; gz++)
                for (int gx = g0x; gx <= g1x; gx++)
                    blocked[gz * gw + gx] = true;
            }
            return blocked;
        }

        static Vector3 NearestWalkableCell(Vector2 world, bool[] blocked, int gw, int gh, float cell)
        {
            int cx = Mathf.FloorToInt(world.x / cell);
            int cz = Mathf.FloorToInt(world.y / cell);
            for (int r = 0; r < 20; r++)
            {
                for (int dz = -r; dz <= r; dz++)
                for (int dx = -r; dx <= r; dx++)
                {
                    if (Mathf.Max(Mathf.Abs(dx), Mathf.Abs(dz)) != r) continue;
                    int gx = cx + dx, gz = cz + dz;
                    if (gx < 0 || gz < 0 || gx >= gw || gz >= gh) continue;
                    if (!blocked[gz * gw + gx])
                        return new Vector3((gx + 0.5f) * cell, 0.5f, (gz + 0.5f) * cell);
                }
            }
            return new Vector3(world.x, 0.5f, world.y);
        }

        static Mesh BuildCubeMesh()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var mesh = UnityEngine.Object.Instantiate(go.GetComponent<MeshFilter>().sharedMesh);
            UnityEngine.Object.Destroy(go);
            return mesh;
        }

        static Vector2? NearestService(Vector2 from, List<Vector2> services)
        {
            Vector2? best = null;
            float bestD = float.MaxValue;
            foreach (var s in services)
            {
                float d = Vector2.Distance(from, s);
                if (d < bestD) { bestD = d; best = s; }
            }
            return best;
        }

        // ── Tick ─────────────────────────────────────────────────────────────
        void FixedUpdate()
        {
            if (_agents == null) return;
            _elapsed += Time.fixedDeltaTime;

            for (int i = 0; i < _agents.Length; i++)
            {
                var a = _agents[i];
                if (a.Arrived || !a.Served) continue;

                var flow = _flow.SampleWorld(a.Pos.x, a.Pos.z);
                if (flow.X != 0f || flow.Y != 0f)
                    a.Pos += new Vector3(flow.X, 0f, flow.Y) * (AgentSpeed * Time.fixedDeltaTime);

                if (Vector3.Distance(a.Pos, a.Target) <= ArriveDistance)
                {
                    a.Arrived = true;
                    _arrived++;
                }
                _agents[i] = a;
            }

            for (int i = 0; i < _agents.Length; i++)
            {
                var a = _agents[i];
                _matrices[i] = Matrix4x4.TRS(a.Pos, Quaternion.identity, Vector3.one * 0.8f);
            }

            if (_mat != null && _cube != null)
                Graphics.DrawMeshInstanced(_cube, 0, _mat, _matrices, _agents.Length, null, ShadowCastingMode.Off, true);

            LastCoverage = _agents.Length == 0 ? 1f : (float)_served / _agents.Length;

            if (_elapsed >= _nextLogAt)
            {
                Debug.Log($"[P1SIM] t={_elapsed:F1}s arrived={_arrived}/{_agents.Length} coverage={LastCoverage:P0}");
                _nextLogAt = _elapsed + 2f;
            }

            bool done = _agents.Length > 0 && (_arrived >= _agents.Length || _elapsed >= MaxSimSeconds);
            if (done)
            {
                Debug.Log($"[P1SIM] DONE coverage={LastCoverage:P0} served={_served}/{_agents.Length} elapsed={_elapsed:F1}s");
                var cb = _onComplete;
                _agents = null;
                cb?.Invoke();
            }
        }
    }
}
