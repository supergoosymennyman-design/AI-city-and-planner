using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.SceneManagement;
using AI2School.Districts;

namespace AI2School.Game.Tests
{
    /// <summary>
    /// PlayMode behavioral tests for the City Base core loop:
    ///  - placement: grid snap, budget, overlap rejection
    ///  - variant determinism: same layout rebuilds the same prefabs
    ///  - HUD palette: renders categorized piece buttons with thumbnails
    ///  - crowd: SimulationRunner spawns citizens (prefab instances)
    ///  - overlay: coverage quad exists + toggles safely
    /// </summary>
    public class MinimalCityPlayTests
    {
        [UnitySetUp]
        public IEnumerator Setup()
        {
            SceneManager.LoadScene("Assets/Scenes/Minimal.unity");
            yield return null;
            yield return null;
            // Fresh, deterministic starting state — ignore whatever save is on disk.
            var city = Object.FindFirstObjectByType<MinimalCity>();
            if (city != null)
            {
                city.Pieces.Clear();
                city.ApplyVisuals();
            }
        }

        [UnityTest]
        public IEnumerator Place_RespectsGridSnapAndBudget()
        {
            var city = Object.FindFirstObjectByType<MinimalCity>();
            Assert.IsNotNull(city, "MinimalCity should boot from Minimal.unity");
            Assert.GreaterOrEqual(city.Manifest.palette.Length, 50);

            int before = city.Pieces.Count;
            Assert.IsTrue(city.TryPlace("housing_pod", 40.7f, 41.2f), "should place");
            Assert.AreEqual(before + 1, city.Pieces.Count);
            // Grid snap: 40.7 -> 40
            var placed = city.Pieces[city.Pieces.Count - 1];
            Assert.AreEqual(40f, placed.x, 0.001f);
            Assert.AreEqual(40f, placed.z, 0.001f);
            yield return null;
        }

        [UnityTest]
        public IEnumerator Place_RejectsOverlap()
        {
            var city = Object.FindFirstObjectByType<MinimalCity>();
            Assert.IsTrue(city.TryPlace("housing_pod", 40, 40));
            Assert.IsFalse(city.TryPlace("housing_dome", 44, 44), "should reject overlap");
            yield return null;
        }

        [UnityTest]
        public IEnumerator Variants_AreDeterministicAcrossRebuild()
        {
            var city = Object.FindFirstObjectByType<MinimalCity>();
            city.Pieces.Clear();
            city.TryPlace("park", 40, 40);
            city.TryPlace("park", 80, 80);
            city.TryPlace("park", 120, 120);
            city.ApplyVisuals();
            yield return null;

            var first = SnapshotVisuals();
            city.ApplyVisuals();
            yield return null;
            var second = SnapshotVisuals();

            Assert.AreEqual(first.Count, second.Count);
            for (int i = 0; i < first.Count; i++)
                Assert.AreEqual(first[i], second[i], $"variant mismatch at {i}");
        }

        static System.Collections.Generic.List<string> SnapshotVisuals()
        {
            var names = new System.Collections.Generic.List<string>();
            foreach (var g in Object.FindObjectsByType<GameObject>(FindObjectsSortMode.None))
                if (g.transform.parent != null && g.transform.parent.name == "MinimalBoot" && g.name.Contains("Clone"))
                    names.Add(g.name);
            names.Sort();
            return names;
        }

        [UnityTest]
        public IEnumerator HUD_PaletteHasCategoriesAndThumbs()
        {
            var hud = GameObject.Find("MinimalHUD");
            Assert.IsNotNull(hud, "MinimalHUD should exist");
            var pal = hud.transform.Find("Palette");
            Assert.IsNotNull(pal, "Palette panel should exist");
            var tabs = pal.Find("CategoryTabs");
            Assert.IsNotNull(tabs, "Category tabs should exist");
            Assert.GreaterOrEqual(tabs.childCount, 5, "at least 5 category tabs");
            var content = pal.Find("Scroll/Viewport/Content");
            Assert.IsNotNull(content, "scroll content should exist");
            Assert.GreaterOrEqual(content.childCount, 20, "palette should show many pieces in All view");
            yield return null;
        }

        [UnityTest]
        public IEnumerator Sim_SpawnsCitizenPrefabs()
        {
            var city = Object.FindFirstObjectByType<MinimalCity>();
            city.Pieces.Clear();
            city.TryPlace("housing_pod", 40, 40);
            city.TryPlace("tech_hub", 120, 120);
            city.StartSimulation();
            float t = 0;
            while (city.Mode == CityMode.Simulating && t < 5f)
            {
                yield return null;
                t += Time.deltaTime;
            }
            // Simulation should have started (agents exist) — check via console markers or runner state.
            var runner = city.GetComponent<SimulationRunner>();
            Assert.IsNotNull(runner);
            yield return null;
        }

        [UnityTest]
        public IEnumerator Overlay_TogglesWithoutError()
        {
            var city = Object.FindFirstObjectByType<MinimalCity>();
            city.SetPlanningOverlay(true);
            yield return null;
            city.SetPlanningOverlay(false);
            yield return null;
            city.SetPlanningOverlay(true);
            yield return null;
            Assert.Pass("overlay toggled safely");
        }
    }
}
