using System;
using System.Collections.Generic;
using UnityEngine;
using AI2School.Core.Determinism;
using AI2School.Districts;
using AI2School.Save;

namespace AI2School.Game
{
    public enum CityMode { Planning, Simulating }

    /// <summary>
    /// Phase 1 city controller — the core loop. Owns manifest + placed pieces +
    /// budget + mode, and coordinates planning input, rendering, simulation,
    /// overlay, and save/load. This is the thin shell around the pure layers.
    /// </summary>
    public class CityController : MonoBehaviour
    {
        public const float CellSize = 4f;
        public const string SaveSlot = "city";
        public const float CoverageRadius = 150f;
        const float PanSpeed = 0.5f;
        const float MinZoom = 40f;
        const float MaxZoom = 260f;

        public DistrictManifestData Manifest { get; private set; }
        public List<PlacedPieceData> Pieces { get; } = new List<PlacedPieceData>();
        public ulong MasterSeed { get; private set; } = 12345;
        public CityMode Mode { get; private set; } = CityMode.Planning;

        public float BudgetUsed { get; private set; }
        public float BudgetMax { get; private set; } = 500;
        public string SelectedPaletteId { get; set; }
        public float LastCoverage => _sim != null ? _sim.LastCoverage : 0f;

        Camera _cam;
        Transform _ground;
        Phase1UI _ui;
        CoverageOverlay _overlay;
        SimulationRunner _sim;
        readonly List<GameObject> _visuals = new List<GameObject>();

        // ── Init ──────────────────────────────────────────────────────────────
        public void Init(Camera cam)
        {
            _cam = cam;

            // Load manifest (Resources copy of the exported district JSON).
            var asset = Resources.Load<TextAsset>("CityBase.manifest");
            if (asset == null) { Debug.LogError("[P1] manifest not found in Resources"); return; }
            Manifest = DistrictManifestLoader.Load(asset.text, p => Debug.LogWarning("[P1] " + p));
            if (Manifest == null) return;
            BudgetMax = FindBudget(Manifest);

            BuildGround();
            _overlay = gameObject.AddComponent<CoverageOverlay>();
            _ui = new Phase1UI(this);
            _sim = gameObject.AddComponent<SimulationRunner>();

            LoadSave();
            ApplyVisuals();
            EnterPlanningMode();
            Debug.Log($"[P1] manifest='{Manifest.districtId}' palette={Manifest.palette.Length} budget={BudgetMax} pieces={Pieces.Count}");
        }

        // ── Ground + visuals ──────────────────────────────────────────────────
        void BuildGround()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Ground";
            var s = Manifest.footprint.sizeMeters;
            go.transform.localScale = new Vector3(s[0], 1f, s[1]);
            go.transform.position = new Vector3(s[0] / 2f, -0.5f, s[1] / 2f);
            go.GetComponent<MeshRenderer>().material = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = new Color(0.78f, 0.80f, 0.72f) };
            _ground = go.transform;
            // Keep the cube's collider: the ground is the pick surface for placement.
        }

        public void ApplyVisuals()
        {
            foreach (var v in _visuals) if (v != null) Destroy(v);
            _visuals.Clear();
            foreach (var p in Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece == null) continue;
                var go = ProceduralBuildings.Create(piece, p);
                if (go != null) { _visuals.Add(go); go.transform.SetParent(transform, false); }
            }
            _overlay.Rebuild(Pieces, Manifest);
        }

        // ── Planning input ────────────────────────────────────────────────────
        void Update()
        {
            if (Mode == CityMode.Planning)
            {
                HandlePlanningInput();
                HandlePlanningCamera();
            }
        }

        void HandlePlanningInput()
        {
            if (Input.GetMouseButtonDown(0))
            {
                var ray = _cam.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out var hit, 1000f) && hit.collider != null)
                    PlaceAt(hit.point);
            }
            else if (Input.GetMouseButtonDown(1))
            {
                var ray = _cam.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out var hit, 1000f) && hit.collider != null)
                    RemoveAt(hit.point);
            }
        }

        /// <summary>Pan (right-drag / two-finger drag) + zoom (scroll / pinch) in planning mode.</summary>
        void HandlePlanningCamera()
        {
            // Pan with right mouse drag.
            if (Input.GetMouseButton(1))
            {
                float px = -Input.GetAxis("Mouse X") * PanSpeed * _cam.orthographicSize / 400f;
                float py = -Input.GetAxis("Mouse Y") * PanSpeed * _cam.orthographicSize / 400f;
                _cam.transform.Translate(px, 0f, py, Space.World);
            }

            // Pan with two-finger touch drag.
            if (Input.touchCount == 2)
            {
                var t0 = Input.GetTouch(0);
                var t1 = Input.GetTouch(1);
                var prev0 = t0.position - t0.deltaPosition;
                var prev1 = t1.position - t1.deltaPosition;
                Vector2 mid = (t0.position + t1.position) / 2f;
                Vector2 prevMid = (prev0 + prev1) / 2f;
                Vector2 delta = (mid - prevMid);
                float scale = _cam.orthographicSize / 400f;
                _cam.transform.Translate(-delta.x * scale, 0f, -delta.y * scale, Space.World);
            }

            // Zoom: mouse wheel.
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.001f)
                _cam.orthographicSize = Mathf.Clamp(_cam.orthographicSize * (1f - scroll * 0.1f), MinZoom, MaxZoom);

            // Zoom: pinch.
            if (Input.touchCount == 2)
            {
                var t0 = Input.GetTouch(0);
                var t1 = Input.GetTouch(1);
                float dist = (t0.position - t1.position).magnitude;
                float prevDist = ((t0.position - t0.deltaPosition) - (t1.position - t1.deltaPosition)).magnitude;
                if (prevDist > 1f)
                    _cam.orthographicSize = Mathf.Clamp(_cam.orthographicSize * (prevDist / dist), MinZoom, MaxZoom);
            }

            // Keep the camera over the district (no panning off into the void).
            var s = Manifest.footprint.sizeMeters;
            var p = _cam.transform.position;
            float halfView = _cam.orthographicSize;
            p.x = Mathf.Clamp(p.x, -halfView * 0.5f, s[0] + halfView * 0.5f);
            p.z = Mathf.Clamp(p.z, -halfView * 0.5f, s[1] + halfView * 0.5f);
            _cam.transform.position = p;
        }

        void PlaceAt(Vector3 world)
        {
            if (string.IsNullOrEmpty(SelectedPaletteId)) return;
            float cx = Mathf.Round(world.x / CellSize) * CellSize;
            float cz = Mathf.Round(world.z / CellSize) * CellSize;
            TryPlace(SelectedPaletteId, cx, cz);
        }

        /// <summary>Place a palette piece at world (x,z), snapped to the grid. Public for smoke/UI tests.</summary>
        public bool TryPlace(string pieceId, float x, float z)
        {
            var piece = FindPalette(pieceId);
            if (piece == null) return false;
            float cx = Mathf.Round(x / CellSize) * CellSize;
            float cz = Mathf.Round(z / CellSize) * CellSize;
            if (OverlapsAny(cx, cz, piece.footprintMeters)) return false;
            if (BudgetUsed + piece.cost > BudgetMax) { _ui?.Toast("Not enough budget."); return false; }

            Pieces.Add(new PlacedPieceData { pieceId = piece.pieceId, x = cx, z = cz });
            BudgetUsed += piece.cost;
            ApplyVisuals();
            _ui?.Refresh();
            return true;
        }

        void RemoveAt(Vector3 world)
        {
            for (int i = Pieces.Count - 1; i >= 0; i--)
            {
                var p = Pieces[i];
                var piece = FindPalette(p.pieceId);
                var fp = piece?.footprintMeters ?? new[] { 8f, 8f };
                var half = new Vector2(fp[0] / 2f, fp[1] / 2f);
                if (Mathf.Abs(world.x - p.x) <= half.x && Mathf.Abs(world.z - p.z) <= half.y)
                {
                    BudgetUsed = Mathf.Max(0, BudgetUsed - (piece?.cost ?? 0));
                    Pieces.RemoveAt(i);
                    ApplyVisuals();
                    _ui.Refresh();
                    return;
                }
            }
        }

        bool OverlapsAny(float x, float z, float[] fp)
        {
            foreach (var p in Pieces)
            {
                var other = FindPalette(p.pieceId);
                var ofp = other?.footprintMeters ?? new[] { 8f, 8f };
                if (Mathf.Abs(x - p.x) < (fp[0] + ofp[0]) / 2f + 1f &&
                    Mathf.Abs(z - p.z) < (fp[1] + ofp[1]) / 2f + 1f) return true;
            }
            return false;
        }

        // ── Modes ─────────────────────────────────────────────────────────────
        public void EnterPlanningMode()
        {
            Mode = CityMode.Planning;
            _cam.orthographic = true;
            var s = Manifest.footprint.sizeMeters;
            _cam.transform.position = new Vector3(s[0] / 2f, 130f, s[1] / 2f);
            _cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            _cam.orthographicSize = s[1] / 2f + 10f;
            _overlay.Show(true);
        }

        public void StartSimulation()
        {
            if (Mode == CityMode.Simulating) return;
            Mode = CityMode.Simulating;
            _overlay.Show(false);
            _ui.SetMode("Simulating");
            _sim.Run(Pieces, FindPalette, CoverageRadius, MasterSeed, () =>
            {
                Debug.Log("[P1SIM] run complete");
                AutoSave();
                _ui.ShowSummary(_sim.LastCoverage);
                EnterPlanningMode();
            });
        }

        // ── Save / load ───────────────────────────────────────────────────────
        public void AutoSave()
        {
            var data = new CitySaveData
            {
                saveVersion = 4,
                masterSeed = MasterSeed,
                districts = new[]
                {
                    new DistrictSaveState
                    {
                        districtId = "city_base",
                        unlocked = true,
                        placedPieces = Pieces.ToArray(),
                        bestMetrics = new[]
                        {
                            new MetricSnapshotData { metricId = "coverage", value = _sim.LastCoverage }
                        }
                    }
                },
                completedLessons = new string[0],
                profileMeta = new ProfileMetaData { nickname = "", avatarSkin = "" }
            };
            string json = JsonUtility.ToJson(data);
            bool ok = SaveSystem.SaveJson(SaveSystem.DefaultDirectory, SaveSlot, json, out var err);
            Debug.Log($"[P1SAVE] ok={ok} bytes={json.Length}" + (err != null ? " err=" + err : ""));
        }

        public void LoadSave()
        {
            string json = SaveSystem.LoadJson(SaveSystem.DefaultDirectory, SaveSlot);
            if (string.IsNullOrEmpty(json)) return;
            var data = JsonUtility.FromJson<CitySaveData>(json);
            if (data == null || data.districts == null || data.districts.Length == 0) return;
            Pieces.Clear();
            foreach (var p in data.districts[0].placedPieces ?? Array.Empty<PlacedPieceData>())
                Pieces.Add(p);
            MasterSeed = data.masterSeed;
            BudgetUsed = 0;
            foreach (var p in Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece != null) BudgetUsed += piece.cost;
            }
            Debug.Log($"[P1LOAD] loaded pieces={Pieces.Count} budgetUsed={BudgetUsed}");
        }

        // ── Helpers ───────────────────────────────────────────────────────────
        PalettePieceData FindPalette(string id)
        {
            foreach (var p in Manifest.palette)
                if (p.pieceId == id) return p;
            return null;
        }

        static float FindBudget(DistrictManifestData m)
        {
            foreach (var c in m.constraints ?? Array.Empty<ConstraintData>())
                if (c.constraintId == "budget") return c.max;
            return 500;
        }

        public DeterministicRng CreateRng(uint stream)
        {
            return new DeterministicRng(DeterministicRng.SeedForStream(MasterSeed, stream));
        }
    }
}
