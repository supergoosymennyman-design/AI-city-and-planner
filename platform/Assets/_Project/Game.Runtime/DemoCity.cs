using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace AI2School.Game
{
    /// <summary>
    /// Builds a curated, representative demo city from the new catalog so you can
    /// preview that the full asset library works together. Places enough of each
    /// kind (housing, services, utility, park, roads, deco, transit, citizens)
    /// across the district, then runs the simulation so people + robots walk.
    ///
    /// Usage: MinimalBoot -demo   (headless build preview) or attach in-editor.
    /// </summary>
    public class DemoCity : MonoBehaviour
    {
        [Tooltip("Auto-run the simulation after building (shows walking citizens).")]
        public bool autoRun = true;

        [Tooltip("Offset grid origin so the city fills the district rather than one corner.")]
        public int origin = 16;

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

            // Add ambient life: walking pedestrians + driving traffic.
            var life = gameObject.AddComponent<DemoLife>();
            life.Init(_city);
            life.SpawnAll();

            // Let it render, then run the simulation so the crowd walks.
            StartCoroutine(AutoRunLater());
        }

        IEnumerator AutoRunLater()
        {
            yield return new WaitForSeconds(1.5f);
            if (autoRun && _city.Mode == CityMode.Planning)
                _city.StartSimulation();
        }

        void PlaceAll()
        {
            int o = origin;   // e.g. 16
            int G = 24;       // 24m per grid cell (fits 16m footprints without overlap)

            // Every piece gets its own unique (gridX, gridZ) cell so nothing overlaps.
            // (id, gx, gz)
            (string, int, int)[] layout =
            {
                // Housing ring (homes drive coverage population)
                ("housing_pod", 0, 0), ("housing_pod", 1, 0), ("housing_pod", 2, 0),
                ("housing_dome", 3, 0), ("housing_dome", 4, 0),
                ("housing_tower", 5, 0), ("housing_tower", 6, 0),
                ("housing_pod", 0, 2), ("housing_pod", 1, 2),
                ("housing_low", 8, 2), ("housing_low", 9, 2),
                ("housing_high", 2, 7), ("housing_high", 3, 7),

                // Services (coverage destinations) — center cluster
                ("tech_hub", 3, 3), ("market", 4, 3), ("bakery", 3, 4),
                ("clinic", 4, 4), ("data_center", 5, 3), ("service_center", 2, 3),
                ("convenience", 5, 4),

                // Utility / tech
                ("solar_farm", 8, 6), ("solar_farm", 9, 6), ("power_cell", 8, 7),
                ("satellite", 7, 8), ("comms_antenna", 9, 5), ("broadcast_tower", 8, 5),

                // Parks / nature
                ("park", 1, 1), ("park", 6, 1), ("greenery", 2, 2),
                ("tree_pine", 7, 7), ("tree_single", 5, 6), ("water_feature", 2, 8),
                ("plaza", 1, 7),

                // Roads (a main artery + cross streets) — on empty outer cells
                ("road_straight", 3, 2), ("road_straight", 4, 2), ("road_straight", 6, 2),
                ("road_cross", 5, 2), ("road_curve", 7, 2), ("road_end", 8, 3),

                // Deco / street furniture — own cells, no scatter collisions
                ("streetlight", 2, 5), ("bench", 3, 5), ("monitor", 4, 5),
                ("hologram_post", 6, 5), ("waste_unit", 7, 5),

                // Transit / vehicles — row along the bottom, own cells
                ("hover_car", 0, 9), ("shuttle_bus", 1, 9), ("sky_shuttle", 2, 9),
                ("suv_rover", 3, 9),

                // More services toward the edge
                ("mainframe_tower", 7, 9), ("power_bank", 8, 8), ("comm_tower", 9, 3),
            };

            foreach (var (id, gx, gz) in layout)
                Place(id, o + gx * G, o + gz * G);
        }

        void Place(string id, int x, int z)
        {
            if (!_city.TryPlace(id, x, z))
                Debug.LogWarning($"[DEMO] place failed: {id} @ ({x},{z})");
        }
    }
}
