using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using AI2School.Districts;
using AI2School.Save;

namespace AI2School.Game
{
    /// <summary>
    /// Phase 1 consolidated city controller on the Minimal path (real GLB
    /// prefabs + SimulationRunner). Owns manifest + placed pieces + budget +
    /// mode, and coordinates planning input, camera, rendering, simulation,
    /// heatmap overlay, and save/load. This is the thin shell around the pure
    /// layers — the successor to the procedural CityController/Phase1UI path.
    /// </summary>
    public class MinimalCity : MonoBehaviour
    {
        public const float CellSize = 4f;
        public const string SaveSlot = "city";
        public const float CoverageRadius = 150f;

        const float PanSpeed = 0.5f;
        const float MinZoom = 40f;
        const float MaxZoom = 260f;
        const float HeatQuadY = 0.5f;   // raised just off the ground — decoupled from the ground material
        const int HeatSize = 128;
        const float TiltSeconds = 1.6f; // planning ↔ sim camera tilt (blueprint §7: 1.5–2 s)

        public DistrictManifestData Manifest { get; private set; }
        public List<PlacedPieceData> Pieces { get; } = new List<PlacedPieceData>();
        public ulong MasterSeed { get; private set; } = 12345;
        public CityMode Mode { get; private set; } = CityMode.Planning;

        public float BudgetUsed { get; private set; }
        public float BudgetMax { get; private set; } = 500;
        public string SelectedPaletteId { get; set; }
        public float LastCoverage => _sim != null ? _sim.LastCoverage : 0f;

        Camera _cam;
        MeshRenderer _groundRenderer;
        Material _groundMat;
        MeshRenderer _heatRenderer;
        Material _heatMat;
        Texture2D _heatTex;
        SimulationRunner _sim;
        MinimalHUD _hud;
        readonly List<GameObject> _visuals = new List<GameObject>();
        Coroutine _tiltRoutine;

        static readonly Color GroundColor = new Color(0.72f, 0.75f, 0.68f);

        // ── Init ──────────────────────────────────────────────────────────────
        public void Init(Camera cam)
        {
            _cam = cam;
            _cam.nearClipPlane = 0.5f;
            _cam.farClipPlane = 900f;

            var asset = Resources.Load<TextAsset>("CityBase.manifest");
            if (asset == null) { Debug.LogError("[MIN] manifest not found in Resources"); return; }
            Manifest = DistrictManifestLoader.Load(asset.text, p => Debug.LogWarning("[MIN] " + p));
            if (Manifest == null) return;
            BudgetMax = FindBudget(Manifest);

            BuildGround();
            BuildHeatQuad();
            _hud = new MinimalHUD(this);
            _sim = gameObject.AddComponent<SimulationRunner>();

            LoadSave();
            ApplyVisuals();
            EnterPlanningMode();
            Debug.Log($"[MIN] manifest='{Manifest.districtId}' palette={Manifest.palette.Length} budget={BudgetMax} pieces={Pieces.Count}");
        }

        // ── Ground + heatmap (decoupled from the ground renderer) ────────────
        void BuildGround()
        {
            // Real plane (not a box) — avoids coplanar-face z-fighting.
            var go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = "Ground";
            var s = Manifest.footprint.sizeMeters;
            go.transform.localScale = new Vector3(s[0] / 10f, 1f, s[1] / 10f);   // plane is 10x10 units
            go.transform.position = new Vector3(s[0] / 2f, 0f, s[1] / 2f);
            _groundRenderer = go.GetComponent<MeshRenderer>();
            _groundMat = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = GroundColor };
            // sharedMaterial — no per-renderer instance clone (white-ground bug
            // root cause: renderer.material setter clones and the saved ref
            // goes stale). The heatmap NEVER touches this material.
            _groundRenderer.sharedMaterial = _groundMat;
            // Keep the plane's collider: the ground is the pick surface for placement.
        }

        void BuildHeatQuad()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = "CoverageHeat";
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            var s = Manifest.footprint.sizeMeters;
            go.transform.localScale = new Vector3(s[0], s[1], 1f);
            go.transform.position = new Vector3(s[0] / 2f, HeatQuadY, s[1] / 2f);
            _heatRenderer = go.GetComponent<MeshRenderer>();
            _heatMat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            // Opaque surface: the quad is a separate decoupled object above the
            // ground, so no transparency blend setup is needed.
            _heatRenderer.sharedMaterial = _heatMat;
            _heatRenderer.enabled = false;
            Destroy(go.GetComponent<Collider>());   // never block the pick raycast
        }

        /// <summary>
        /// Paint the coverage heatmap (distance to nearest service) onto the
        /// raised quad's texture. Green = near a service, red = far (>= coverage
        /// radius). Colour-blind paired with brightness (not hue alone).
        /// </summary>
        public void BuildHeatmap()
        {
            var services = new List<Vector2>();
            foreach (var p in Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece != null && piece.category == "service") services.Add(new Vector2(p.x, p.z));
            }

            if (_heatTex == null)
                _heatTex = new Texture2D(HeatSize, HeatSize, TextureFormat.RGB24, false)
                { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };

            var s = Manifest.footprint.sizeMeters;
            float w = s[0], d = s[1];
            var pixels = new Color[HeatSize * HeatSize];
            for (int py = 0; py < HeatSize; py++)
            for (int px = 0; px < HeatSize; px++)
            {
                float worldX = (px + 0.5f) / HeatSize * w;
                float worldZ = (py + 0.5f) / HeatSize * d;
                float nearest = float.MaxValue;
                foreach (var svc in services)
                    nearest = Mathf.Min(nearest, Vector2.Distance(new Vector2(worldX, worldZ), svc));
                float t = Mathf.Clamp01(nearest / CoverageRadius);
                // green (served) -> amber -> red (far); brightness varies too
                pixels[py * HeatSize + px] = Color.Lerp(new Color(0.20f, 0.85f, 0.35f), new Color(0.92f, 0.25f, 0.15f), t);
            }
            _heatTex.SetPixels(pixels);
            _heatTex.Apply();
            if (_heatMat != null) _heatMat.SetTexture("_BaseMap", _heatTex);
        }

        /// <summary>Planning mode: heat quad visible. Sim: hidden. LogFramePixels kept for console verification.</summary>
        public void SetPlanningOverlay(bool on)
        {
            if (_heatRenderer == null) return;
            _heatRenderer.enabled = on;
            Debug.Log($"[HEAT] overlay {(on ? "ON" : "OFF")} quadY={HeatQuadY}");
            if (on) LogFramePixels("heat-on");
        }

        // ── Visuals ───────────────────────────────────────────────────────────
        public void ApplyVisuals()
        {
            foreach (var v in _visuals) if (v != null) Destroy(v);
            _visuals.Clear();
            foreach (var p in Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece == null) continue;
                GameObject go = null;
                string prefabName = PickPrefab(piece, p);
                if (prefabName != null)
                    go = SpawnModel(prefabName, new Vector3(p.x, 0f, p.z),
                        piece.footprintMeters[0], piece.footprintMeters[1]);
                if (go == null)
                    go = ProceduralBuildings.Create(piece, p);   // fallback
                if (go != null) { _visuals.Add(go); go.transform.SetParent(transform, false); }
            }
            BuildHeatmap();
        }

        /// <summary>
        /// Resolve the prefab to instantiate for a piece. Uses the manifest's
        /// `prefab` field (data-driven — replaces the old PrefabFor switch), and
        /// picks a random variant deterministically from the piece position, so
        /// the same layout always rebuilds identically.
        /// </summary>
        static string PickPrefab(PalettePieceData piece, PlacedPieceData placed)
        {
            if (piece == null) return null;
            if (piece.variants != null && piece.variants.Length > 0)
            {
                uint h = (uint)(Mathf.RoundToInt(placed.x) * 73856093 ^ Mathf.RoundToInt(placed.z) * 19349663);
                return piece.variants[h % (uint)piece.variants.Length];
            }
            return piece.prefab;
        }

        /// <summary>Instantiate a prefab and scale it to fit a footprint (w × d metres), sitting on the ground.</summary>
        static GameObject SpawnModel(string prefabName, Vector3 pos, float targetW, float targetD)
        {
            var prefab = Resources.Load<GameObject>("Prefabs/" + prefabName);
            if (prefab == null) return null;
            var go = Object.Instantiate(prefab);
            go.transform.position = Vector3.zero;
            var b = FitBounds(go);
            if (b.size.x > 0.01f && b.size.z > 0.01f)
            {
                float s = Mathf.Min(targetW / b.size.x, targetD / b.size.z);
                go.transform.localScale = Vector3.one * s;
                b = FitBounds(go);
            }
            go.transform.position = new Vector3(pos.x, -b.min.y, pos.z);
            return go;
        }

        public static Bounds FitBounds(GameObject go)
        {
            var renderers = go.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return new Bounds(go.transform.position, Vector3.one);
            var b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
            return b;
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
            if (OverlapsAny(cx, cz, piece.footprintMeters)) { _hud?.Toast("Overlaps another building."); return false; }
            if (BudgetUsed + piece.cost > BudgetMax) { _hud?.Toast("Not enough budget."); return false; }

            Pieces.Add(new PlacedPieceData { pieceId = piece.pieceId, x = cx, z = cz });
            BudgetUsed += piece.cost;
            ApplyVisuals();
            _hud?.Refresh();
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
                    _hud?.Refresh();
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

        // ── Modes (Planning ↔ Simulating with camera tilt) ───────────────────
        public void EnterPlanningMode()
        {
            Mode = CityMode.Planning;
            _hud?.SetMode("Planning");
            SetPlanningOverlay(true);
            if (_tiltRoutine != null) StopCoroutine(_tiltRoutine);
            _tiltRoutine = StartCoroutine(TiltTo(PlanningPose()));
        }

        public void StartSimulation()
        {
            if (Mode == CityMode.Simulating) return;
            Mode = CityMode.Simulating;
            _hud?.SetMode("Simulating");
            SetPlanningOverlay(false);
            if (_tiltRoutine != null) StopCoroutine(_tiltRoutine);
            _tiltRoutine = StartCoroutine(SimFlow());
        }

        IEnumerator SimFlow()
        {
            // Start the sim immediately — never gate it on the camera tilt. The
            // tilt is cosmetic (background-safe: if the app isn't rendering
            // frames, Time.deltaTime stalls and a gated sim would hang forever).
            StartCoroutine(TiltTo(SimPose()));
            bool done = false;
            _sim.Run(Pieces, FindPalette, CoverageRadius, MasterSeed, () => done = true);
            while (!done) yield return null;

            Debug.Log("[MINSIM] run complete");
            AutoSave();
            _hud?.ShowSummary(_sim.LastCoverage);
            _tiltRoutine = null;          // this routine is finishing — don't self-stop
            EnterPlanningMode();
        }

        struct CameraPose
        {
            public Vector3 position;
            public Quaternion rotation;
            public bool orthographic;
            public float orthoSize;
        }

        CameraPose PlanningPose()
        {
            var s = Manifest.footprint.sizeMeters;
            return new CameraPose
            {
                position = new Vector3(s[0] / 2f, 130f, s[1] / 2f),
                rotation = Quaternion.Euler(90f, 0f, 0f),
                orthographic = true,
                orthoSize = s[1] / 2f + 10f,
            };
        }

        CameraPose SimPose()
        {
            var s = Manifest.footprint.sizeMeters;
            float cx = s[0] / 2f, cz = s[1] / 2f;
            var pos = new Vector3(cx, 150f, cz - 285f);   // 3/4 perspective over the district
            return new CameraPose
            {
                position = pos,
                rotation = Quaternion.LookRotation(new Vector3(cx, 0f, cz) - pos),
                orthographic = false,
                orthoSize = 0f,
            };
        }

        /// <summary>Deterministic ortho→perspective (and back) camera dolly, ~1.6 s eased.</summary>
        IEnumerator TiltTo(CameraPose pose)
        {
            var fromPos = _cam.transform.position;
            var fromRot = _cam.transform.rotation;
            float t = 0f;
            while (t < TiltSeconds)
            {
                t += Time.deltaTime;
                float k = Mathf.SmoothStep(0f, 1f, t / TiltSeconds);
                _cam.transform.position = Vector3.Lerp(fromPos, pose.position, k);
                _cam.transform.rotation = Quaternion.Slerp(fromRot, pose.rotation, k);
                yield return null;
            }
            _cam.orthographic = pose.orthographic;
            if (pose.orthographic)
                _cam.orthographicSize = pose.orthoSize;
            else
                _cam.fieldOfView = 42f;
            _cam.transform.position = pose.position;
            _cam.transform.rotation = pose.rotation;
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
            Debug.Log($"[MINSAVE] ok={ok} bytes={json.Length}" + (err != null ? " err=" + err : ""));
        }

        public void LoadSave()
        {
            string json = SaveSystem.LoadJson(SaveSystem.DefaultDirectory, SaveSlot);
            if (string.IsNullOrEmpty(json)) return;
            var data = JsonUtility.FromJson<CitySaveData>(json);
            if (data == null || data.districts == null || data.districts.Length == 0) return;
            Pieces.Clear();
            foreach (var p in data.districts[0].placedPieces ?? System.Array.Empty<PlacedPieceData>())
            {
                // Migrate legacy Phase-1 pieceIds to the new catalog (old saves
                // used home/school/shop/park; new manifest uses housing_pod/tech_hub/market/park).
                string id = p.pieceId;
                if (FindPalette(id) == null)
                {
                    id = LegacyPieceMap(id);
                    if (id == null) continue;   // unknown piece — drop silently
                }
                Pieces.Add(new PlacedPieceData { pieceId = id, x = p.x, z = p.z });
            }
            MasterSeed = data.masterSeed;
            BudgetUsed = 0;
            foreach (var p in Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece != null) BudgetUsed += piece.cost;
            }
            Debug.Log($"[MINLOAD] loaded pieces={Pieces.Count} budgetUsed={BudgetUsed}");
        }

        /// <summary>Map legacy Phase-1 pieceIds to current catalog pieceIds.</summary>
        static string LegacyPieceMap(string oldId) => oldId switch
        {
            "home" => "housing_pod",
            "school" => "tech_hub",
            "shop" => "market",
            _ => null,
        };

        // ── Helpers ───────────────────────────────────────────────────────────
        PalettePieceData FindPalette(string id)
        {
            if (Manifest?.palette == null) return null;
            foreach (var p in Manifest.palette)
                if (p.pieceId == id) return p;
            return null;
        }

        static float FindBudget(DistrictManifestData m)
        {
            foreach (var c in m.constraints ?? System.Array.Empty<ConstraintData>())
                if (c.constraintId == "budget") return c.max;
            return 500;
        }

        /// <summary>Render the camera to a temp RT and log real frame-buffer pixels (ground truth, console-only).</summary>
        void LogFramePixels(string tag)
        {
            if (_cam == null) return;
            var rt = RenderTexture.GetTemporary(Screen.width, Screen.height, 24, RenderTextureFormat.ARGB32);
            var prevTarget = _cam.targetTexture;
            _cam.targetTexture = rt;
            _cam.Render();
            var oldActive = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(8, 8, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, 8, 8), 0, 0);
            tex.Apply();
            RenderTexture.active = oldActive;
            _cam.targetTexture = prevTarget;
            RenderTexture.ReleaseTemporary(rt);

            // Sample: (0,0) bottom-left, (7,7) top-right of the 8x8 read.
            var bl = tex.GetPixel(0, 0);   // bottom-left
            var tr = tex.GetPixel(7, 7);   // top-right
            var cc = tex.GetPixel(4, 3);   // center-ish
            Debug.Log($"[FRAME] {tag} BL={bl} CC={cc} TR={tr}");
        }
    }
}
