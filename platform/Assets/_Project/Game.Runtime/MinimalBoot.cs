using System.Collections;
using UnityEngine;
using AI2School.Save;

namespace AI2School.Game
{
    /// <summary>
    /// Scene entry for the Phase 1 Minimal path. Creates camera/light, boots
    /// MinimalCity (planning mode with HUD), and:
    ///   -smoke           → unattended end-to-end pass (place → save → run →
    ///                      verify save → quit) for CI / build verification
    ///   -screenshot <p>  → demo city, capture planning + sim PNGs, quit
    ///   (no args)        → interactive: planning mode; LMB place / RMB delete,
    ///                      R runs the simulation
    /// </summary>
    public class MinimalBoot : MonoBehaviour
    {
        MinimalCity _city;

        void Awake()
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();

            var sun = new GameObject("Sun");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            light.shadows = LightShadows.None;   // shadows off for the baseline (no shadow acne)
            sun.transform.rotation = Quaternion.Euler(52f, -28f, 0f);

            _city = gameObject.AddComponent<MinimalCity>();
            _city.Init(cam);

            if (Boot.HasArg("-smoke"))
                StartCoroutine(SmokeFlow());
            else if (Boot.HasArg("-screenshot"))
                StartCoroutine(ScreenshotFlow(Boot.ArgValue("-screenshot") ?? "/tmp/aiplatform-min.png"));
            // else: interactive — stays in planning mode; R triggers the run.
        }

        void Update()
        {
            if (Boot.HasArg("-smoke") || Boot.HasArg("-screenshot")) return;
            if (Input.GetKeyDown(KeyCode.R) && _city.Mode == CityMode.Planning)
                _city.StartSimulation();
        }

        /// <summary>Unattended end-to-end pass for CI / verification on the Minimal path.</summary>
        IEnumerator SmokeFlow()
        {
            yield return null; // let Init finish

            _city.TryPlace("housing_pod", 40, 40);
            _city.TryPlace("housing_dome", 40, 120);
            _city.TryPlace("housing_tower", 120, 40);
            _city.TryPlace("tech_hub", 200, 200);
            _city.TryPlace("market", 80, 200);
            _city.TryPlace("park", 160, 60);

            Debug.Log($"[MINSMOKE] placed pieces={_city.Pieces.Count} budgetUsed={_city.BudgetUsed}/{_city.BudgetMax}");

            _city.AutoSave();

            _city.StartSimulation();
            float t = 0;
            while (_city.Mode == CityMode.Simulating && t < 40f)
            {
                yield return null;
                t += Time.deltaTime;
            }

            string json = SaveSystem.LoadJson(SaveSystem.DefaultDirectory, MinimalCity.SaveSlot);
            bool saveOk = !string.IsNullOrEmpty(json);
            Debug.Log($"[MINSMOKE] DONE mode={_city.Mode} saveOk={saveOk} coverage={_city.LastCoverage:0.00}");

            Application.Quit(saveOk && _city.Mode == CityMode.Planning ? 0 : 1);
        }

        IEnumerator ScreenshotFlow(string path)
        {
            // 1. Planning state: heatmap visible on the raised quad.
            _city.BuildHeatmap();
            _city.SetPlanningOverlay(true);
            yield return new WaitForSeconds(1.5f);
            string planPath = path.Replace(".png", "-plan.png");
            ScreenCapture.CaptureScreenshot(planPath);
            Debug.Log("[MINSHOT] planning captured " + planPath);

            // 2. Sim state: plain ground + citizens walking.
            _city.StartSimulation();
            yield return new WaitForSeconds(2.5f);
            ScreenCapture.CaptureScreenshot(path);
            Debug.Log("[MINSHOT] sim captured " + path);
            yield return new WaitForSeconds(0.8f);
            Application.Quit(0);
        }
    }
}
