using System.Collections;
using UnityEngine;
using AI2School.Save;

namespace AI2School.Game
{
    /// <summary>
    /// Unattended end-to-end pass for CI / verification: place a starter city,
    /// run the simulation, autosave, then quit. Logs [P1SMOKE] markers.
    /// </summary>
    public static class SmokeTest
    {
        public static IEnumerator Run(CityController city)
        {
            yield return null; // let Init finish

            city.TryPlace("home", 40, 40);
            city.TryPlace("home", 40, 120);
            city.TryPlace("home", 120, 40);
            city.TryPlace("school", 200, 200);
            city.TryPlace("shop", 80, 200);
            city.TryPlace("park", 160, 60);

            Debug.Log($"[P1SMOKE] placed pieces={city.Pieces.Count} budgetUsed={city.BudgetUsed}/{city.BudgetMax}");

            city.AutoSave();

            city.StartSimulation();
            float t = 0;
            while (city.Mode == CityMode.Simulating && t < 30f)
            {
                yield return null;
                t += Time.deltaTime;
            }

            string json = SaveSystem.LoadJson(SaveSystem.DefaultDirectory, CityController.SaveSlot);
            bool saveOk = !string.IsNullOrEmpty(json);
            Debug.Log($"[P1SMOKE] DONE mode={city.Mode} saveOk={saveOk} coverage={city.LastCoverage:0.00}");

            Application.Quit(saveOk ? 0 : 1);
        }

        /// <summary>Place a demo city, wait for render, capture a PNG, quit. For visual verification.</summary>
        public static IEnumerator Screenshot(CityController city, string path)
        {
            yield return null;
            city.TryPlace("home", 40, 40);
            city.TryPlace("home", 40, 120);
            city.TryPlace("home", 120, 40);
            city.TryPlace("school", 200, 200);
            city.TryPlace("shop", 80, 200);
            city.TryPlace("park", 160, 60);
            yield return new WaitForSeconds(2f);   // let it render + settle
            ScreenCapture.CaptureScreenshot(path);
            Debug.Log("[P1SHOT] captured " + path);
            yield return new WaitForSeconds(1f);
            Application.Quit(0);
        }
    }
}
