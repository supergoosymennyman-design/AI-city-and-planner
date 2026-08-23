using UnityEngine;

namespace AI2School.Game
{
    /// <summary>
    /// Phase 1 entry point. Creates camera/light, boots the city controller,
    /// and — when launched with -smoke — runs an unattended end-to-end pass
    /// (place → run → save → quit) so the whole loop is CI-verifiable.
    /// </summary>
    public class Boot : MonoBehaviour
    {
        public static Boot Instance { get; private set; }
        public CityController City { get; private set; }

        void Awake()
        {
            Instance = this;

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();

            var sun = new GameObject("Sun");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.shadows = LightShadows.None;   // shadows off for the baseline (no shadow acne)
            sun.transform.rotation = Quaternion.Euler(55f, -30f, 0f);

            City = gameObject.AddComponent<CityController>();
            City.Init(camGo.GetComponent<Camera>());

            if (HasArg("-smoke"))
                StartCoroutine(SmokeTest.Run(City));
            else if (HasArg("-screenshot"))
                StartCoroutine(SmokeTest.Screenshot(City, ArgValue("-screenshot") ?? "/tmp/aiplatform-shot.png"));
        }

        public static bool HasArg(string arg)
        {
            foreach (var a in System.Environment.GetCommandLineArgs())
                if (a == arg) return true;
            return false;
        }

        public static string ArgValue(string arg)
        {
            var args = System.Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == arg) return args[i + 1];
            return null;
        }
    }
}
