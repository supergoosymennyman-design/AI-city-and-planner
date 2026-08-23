using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AI2School.Game.Editor
{
    /// <summary>Creates the minimal-baseline scene and points build settings at it.</summary>
    public static class MinimalSceneSetup
    {
        const string ScenePath = "Assets/Scenes/Minimal.unity";

        public static void Create()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var boot = new GameObject("MinimalBoot");
            boot.AddComponent<MinimalBoot>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            Debug.Log("[MINSETUP] saved " + ScenePath);
            EditorApplication.Exit(0);
        }
    }
}
