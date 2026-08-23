using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AI2School.Game
{
    /// <summary>Creates the Phase 1 scene (Phase1Boot + empty scene) and sets build settings.</summary>
    public static class Phase1SceneSetup
    {
        const string ScenePath = "Assets/Scenes/Phase1.unity";

        public static void Create()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var boot = new GameObject("Phase1Boot");
            boot.AddComponent<Boot>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            Debug.Log("[P1SETUP] saved " + ScenePath);
            EditorApplication.Exit(0);
        }
    }
}
