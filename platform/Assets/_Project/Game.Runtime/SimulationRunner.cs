using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using AI2School.Core.Capability;
using AI2School.Core.Determinism;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// The reveal run. Spawns one instanced citizen per home; each tick a home
    /// evaluates the stub threshold capability ("distance to nearest service
    /// &lt; coverage radius" → pass), and served homes walk their citizen to the
    /// service. Logs [P1SIM] lines; bounded; callback on completion.
    /// </summary>
    public class SimulationRunner : MonoBehaviour
    {
        public float LastCoverage { get; private set; }

        const float AgentSpeed = 6f;
        const float MaxSimSeconds = 20f;

        Mesh _cube;
        Material _mat;
        Matrix4x4[] _matrices;
        AgentState[] _agents;
        float _elapsed;
        int _arrived;
        int _served;
        Action _onComplete;
        float _nextLogAt;

        struct AgentState
        {
            public Vector3 From;
            public Vector3 To;
            public float T;        // 0..1 progress
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

            // Coverage semantics: pass = home is WITHIN coverage radius of a
            // service. The pure runtime does "feature >= threshold → pass", so
            // feed it the coverage margin (radius − distance): margin >= 0
            // means the home is served. (Feeding raw distance would invert it.)
            _capability = new ThresholdCapability("coverage_margin", 0.0);
            _runtime = new ThresholdRuntime();
            var rng = new DeterministicRng(DeterministicRng.SeedForStream(masterSeed, 3));

            _agents = new AgentState[homes.Count];
            _matrices = new Matrix4x4[homes.Count];
            for (int i = 0; i < homes.Count; i++)
            {
                var home = homes[i];
                var from = new Vector3(home.x, 0.5f, home.z);
                var to = NearestService(from, services);
                float dist = to.HasValue ? Vector2.Distance(new Vector2(from.x, from.z), to.Value) : float.MaxValue;
                float margin = coverageRadius - dist;

                // Evaluate the stub capability deterministically.
                var snap = new WorldSnapshot(rng.NextUInt(), new Dictionary<string, float>
                {
                    ["coverage_margin"] = margin,
                });
                var decision = _runtime.Evaluate(_capability, snap);
                bool served = decision.Label == "pass";
                if (served) _served++;

                _agents[i] = new AgentState { From = from, To = new Vector3(to.Value.x, 0.5f, to.Value.y), Served = served };
                _matrices[i] = Matrix4x4.TRS(from, Quaternion.identity, Vector3.one * 0.8f);
            }

            _cube = BuildCubeMesh();
            _mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            _mat.color = new Color(0.2f, 0.75f, 0.95f);
            _mat.enableInstancing = true;

            Debug.Log($"[P1SIM] start homes={homes.Count} services={services.Count} served={_served}");
        }

        static Mesh BuildCubeMesh()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var mesh = UnityEngine.Object.Instantiate(go.GetComponent<MeshFilter>().sharedMesh);
            UnityEngine.Object.Destroy(go);
            return mesh;
        }

        static Vector2? NearestService(Vector3 from, List<Vector2> services)
        {
            Vector2? best = null;
            float bestD = float.MaxValue;
            foreach (var s in services)
            {
                float d = Vector2.Distance(new Vector2(from.x, from.z), s);
                if (d < bestD) { bestD = d; best = s; }
            }
            return best;
        }

        void FixedUpdate()
        {
            if (_agents == null) return;
            _elapsed += Time.fixedDeltaTime;

            for (int i = 0; i < _agents.Length; i++)
            {
                var a = _agents[i];
                if (a.Arrived || !a.Served) continue;
                float dist = Vector3.Distance(a.From, a.To);
                if (dist <= 0.01f)
                {
                    a.Arrived = true; _arrived++;
                }
                else
                {
                    a.T = Mathf.Clamp01(a.T + (AgentSpeed * Time.fixedDeltaTime) / dist);
                    if (a.T >= 1f) { a.Arrived = true; _arrived++; }
                }
                _agents[i] = a;
            }

            for (int i = 0; i < _agents.Length; i++)
            {
                var a = _agents[i];
                var pos = a.Served ? Vector3.Lerp(a.From, a.To, a.T) : a.From;
                _matrices[i] = Matrix4x4.TRS(pos, Quaternion.identity, Vector3.one * 0.8f);
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
