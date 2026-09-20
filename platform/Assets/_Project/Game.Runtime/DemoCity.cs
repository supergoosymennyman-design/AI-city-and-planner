using System.Collections;
using UnityEngine;

namespace AI2School.Game
{
    /// <summary>
    /// Builds a curated, representative demo city from the new catalog so you can
    /// preview that the full asset library works together — AND a real, connected
    /// road network (ring + cross streets on a 12m grid, 33 road pieces) so the
    /// road-traffic simulation (TrafficSimulation) has something to drive on.
    ///
    /// Usage: MinimalBoot -demo   (headless build preview) or attach in-editor.
    /// Keys (in-editor): D = build demo city, V = orbit camera, R = run sim.
    /// </summary>
    public class DemoCity : MonoBehaviour
    {
        [Tooltip("Auto-run the simulation after building (shows walking citizens).")]
        public bool autoRun = true;

        MinimalCity _city;

        public static DemoCity Build(MinimalCity city, bool autoRunSim)
        {
            var go = city.gameObject.AddComponent<DemoCity>();
            go._city = city;
            go.autoRun = autoRunSim;
            return go;
        }

        public void Awake() { /* attached in editor — build on start */ }

        void Start()
        {
            // Fresh deterministic layout (ignore any on-disk save).
            _city.ResetCity();

            PlaceAll();

            Debug.Log($"[DEMO] built {_city.Pieces.Count} pieces, budget {_city.BudgetUsed}/{_city.BudgetMax}");

            // Ambient life: walking pedestrians + road traffic.
            var life = gameObject.AddComponent<DemoLife>();
            life.Init(_city);
            life.SpawnAll();

            var traffic = gameObject.AddComponent<TrafficSimulation>();
            traffic.Init(_city);

            // Let it render, then run the simulation so the crowd walks.
            StartCoroutine(AutoRunLater());
        }

        IEnumerator AutoRunLater()
        {
            yield return new WaitForSeconds(1.5f);
            if (autoRun && _city.Mode == CityMode.Planning)
                _city.StartSimulation();
        }

        // ── Road skeleton: ring road + cross streets on a 12m grid ────────────
        // Ring corners (52,52)-(124,52)-(124,124)-(52,124); T-junctions where the
        // cross streets meet the ring; center cross at (88,88). Every junction is
        // a road_cross/road_junction piece so ports merge and the graph connects.
        static readonly (string id, float x, float z, float rot)[] Roads =
        {
            // Corners (curves).
            ("road_curve", 52, 52, 0),   ("road_curve", 124, 52, 270),
            ("road_curve", 124, 124, 180), ("road_curve", 52, 124, 90),
            // Junctions where cross streets meet the ring.
            ("road_junction", 52, 88, 0),  ("road_junction", 124, 88, 0),
            ("road_junction", 88, 52, 0),  ("road_junction", 88, 124, 0),
            // Center cross.
            ("road_cross", 88, 88, 0),
            // Bottom edge (z=52) — two pedestrian crossings.
            ("road_crossing", 64, 52, 0), ("road_crossing", 76, 52, 0),
            ("road_straight", 100, 52, 0), ("road_straight", 112, 52, 0),
            // Top edge (z=124).
            ("road_straight", 64, 124, 0), ("road_straight", 76, 124, 0),
            ("road_straight", 100, 124, 0), ("road_straight", 112, 124, 0),
            // Left edge (x=52, vertical).
            ("road_straight", 52, 64, 90), ("road_straight", 52, 76, 90),
            ("road_straight", 52, 100, 90), ("road_straight", 52, 112, 90),
            // Right edge (x=124, vertical).
            ("road_straight", 124, 64, 90), ("road_straight", 124, 76, 90),
            ("road_straight", 124, 100, 90), ("road_straight", 124, 112, 90),
            // Cross street (z=88, horizontal).
            ("road_straight", 64, 88, 0), ("road_straight", 76, 88, 0),
            ("road_straight", 100, 88, 0), ("road_straight", 112, 88, 0),
            // Cross street (x=88, vertical).
            ("road_straight", 88, 64, 90), ("road_straight", 88, 76, 90),
            ("road_straight", 88, 100, 90), ("road_straight", 88, 112, 90),
        };

        // ── Buildings: on the 24m grid, in cells clear of the road corridors ──
        // Road bands: ring x∈[46,58]∪[118,130], z∈[46,58]∪[118,130]; cross
        // streets x∈[82,94], z∈[82,94]. Building cells skip column/row 88.
        static readonly (string id, float x, float z)[] Buildings =
        {
            // Housing ring.
            ("housing_pod", 16, 16), ("housing_pod", 40, 16), ("housing_dome", 64, 16),
            ("housing_tower", 112, 16), ("housing_tower", 136, 16),
            ("housing_low", 160, 16), ("housing_low", 184, 16),
            ("sky_tower", 208, 16),
            ("housing_pod", 16, 40), ("housing_dome", 40, 40),
            ("housing_high", 16, 208), ("housing_high", 40, 208),
            // Services.
            ("tech_hub", 64, 40), ("market", 112, 40), ("clinic", 136, 40), ("data_center", 160, 40),
            ("bakery", 184, 40), ("mainframe_tower", 208, 40),
            ("service_center", 16, 64), ("convenience", 40, 64),
            // Utility / tech.
            ("solar_farm", 16, 112), ("power_cell", 40, 112),
            ("satellite", 16, 136), ("comms_antenna", 40, 136),
            ("broadcast_tower", 64, 136), ("power_bank", 112, 136), ("comm_tower", 136, 136),
            // Parks — the four central blocks inside the ring.
            ("plaza", 64, 64), ("park", 64, 112), ("park", 112, 64), ("water_feature", 112, 112),
            ("greenery", 136, 112), ("tree_pine", 160, 112), ("tree_single", 184, 112), ("bio_dome", 208, 112),
            // Deco / street furniture.
            ("streetlight", 64, 208), ("streetlight", 112, 208),
            ("bench", 136, 208), ("monitor", 160, 208), ("hologram_post", 184, 208), ("waste_unit", 208, 208),
            ("bus_stop", 64, 184), ("traffic_signal", 40, 184), ("traffic_signal", 112, 184),
            // Transit / parked vehicles.
            ("hover_car", 16, 160), ("shuttle_bus", 40, 160), ("suv_rover", 64, 160), ("sky_shuttle", 136, 160),
        };

        void PlaceAll()
        {
            foreach (var (id, x, z, rot) in Roads)
                Place(id, x, z, rot);
            foreach (var (id, x, z) in Buildings)
                Place(id, x, z, 0f);
        }

        void Place(string id, float x, float z, float rot)
        {
            if (!_city.TryPlace(id, x, z, rot))
                Debug.LogWarning($"[DEMO] place failed: {id} @ ({x},{z})");
        }
    }
}
