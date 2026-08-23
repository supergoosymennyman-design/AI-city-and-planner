using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// Phase 0 spike setup, run headlessly:
///   Unity -batchmode -quit -projectPath <proj> -executeMethod SpikeSetup.Create
///
/// Creates the URP pipeline asset, assigns it to Graphics + Quality settings,
/// builds the benchmark scene (camera + light + CrowdBenchmark), saves it, and
/// adds it to the build settings.
/// </summary>
public static class SpikeSetup
{
    const string PipelinePath = "Assets/Settings/URP-High.asset";
    const string ScenePath = "Assets/Scenes/Main.unity";

    public static void Create()
    {
        // ── 1. URP pipeline asset ─────────────────────────────────────────────
        EnsureFolder("Assets/Settings");
        EnsureFolder("Assets/Scenes");

        var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
        if (pipeline == null)
        {
            pipeline = UniversalRenderPipelineAsset.Create();
            if (pipeline == null)
            {
                Debug.LogError("[SPIKE] Failed to create URP asset (Create() returned null).");
                EditorApplication.Exit(1);
                return;
            }

            // UniversalRenderPipelineAsset.Create() leaves the renderer list
            // empty → "Default Renderer is missing" errors at build time.
            // Assign a UniversalRendererData via the serialized fields.
            var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
            AssetDatabase.CreateAsset(rendererData, "Assets/Settings/URP-Renderer.asset");

            var type = typeof(UniversalRenderPipelineAsset);
            var fData = type.GetField("m_RendererDataList", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            var fIdx = type.GetField("m_DefaultRendererIndex", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
            if (fData != null) fData.SetValue(pipeline, new ScriptableRendererData[] { rendererData });
            if (fIdx != null) fIdx.SetValue(pipeline, 0);

            AssetDatabase.CreateAsset(pipeline, PipelinePath);
            EditorUtility.SetDirty(pipeline);
            AssetDatabase.SaveAssets();
            Debug.Log("[SPIKE] Created " + PipelinePath + " + renderer");
        }

        // Assign as the default render pipeline (covers all quality levels).
        GraphicsSettings.defaultRenderPipeline = pipeline;
        QualitySettings.renderPipeline = pipeline;
        Debug.Log("[SPIKE] Assigned URP to GraphicsSettings + QualitySettings");

        // URP strips shaders that no asset references at build time. We create
        // the benchmark material at runtime via Shader.Find, so force-include
        // the Lit shader (with its instancing variant) or the built player
        // finds a null shader.
        var gs = GraphicsSettings.GetGraphicsSettings();
        var so = new SerializedObject(gs);
        var always = so.FindProperty("m_AlwaysIncludedShaders");
        foreach (var shaderName in new[] { "Universal Render Pipeline/Lit", "Universal Render Pipeline/Unlit", "Unlit/Color" })
        {
            var shader = Shader.Find(shaderName);
            if (shader == null) continue;
            bool present = false;
            for (int i = 0; i < always.arraySize; i++)
                if (always.GetArrayElementAtIndex(i).objectReferenceValue == shader) { present = true; break; }
            if (!present)
            {
                always.arraySize += 1;
                always.GetArrayElementAtIndex(always.arraySize - 1).objectReferenceValue = shader;
                so.ApplyModifiedProperties();
                Debug.Log("[SPIKE] Added " + shaderName + " to alwaysIncludedShaders");
            }
        }

        // ── 2. Benchmark scene ────────────────────────────────────────────────
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
        var go = new GameObject("Benchmark");
        go.AddComponent<CrowdBenchmark>();
        EditorSceneManager.SaveScene(scene, ScenePath);
        Debug.Log("[SPIKE] Saved scene " + ScenePath);

        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        Debug.Log("[SPIKE] Build settings: " + string.Join(",", EditorBuildSettings.scenes[0].path));

        // ── 3. Player basics (so standalone builds launch sanely) ─────────────
        PlayerSettings.productName = "AIPlatform";
        PlayerSettings.companyName = "AI2School";
        PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Standalone, "ai2school.platform");

        // Spike: Mono backend for fast standalone iteration.
        // Android + iOS use IL2CPP (Unity 6 dropped Android Mono; IL2CPP is
        // the standard mobile backend and required by Apple anyway).
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone, ScriptingImplementation.Mono2x);
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);

        // Android build fails with "Target architecture not specified" otherwise.
        PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;

        AssetDatabase.SaveAssets();
        EditorApplication.Exit(0);
    }

    /// <summary>Imports TMP Essential Resources (TMP Settings + default SDF font) into Assets/.</summary>
    public static void ImportTmpEssentials()
    {
        TMPro.TMP_PackageUtilities.ImportProjectResourcesMenu();
        AssetDatabase.SaveAssets();
        Debug.Log("[SPIKE] TMP essentials imported");
        EditorApplication.Exit(0);
    }

    static void EnsureFolder(string path)
    {
        if (AssetDatabase.IsValidFolder(path)) return;
        string parent = System.IO.Path.GetDirectoryName(path).Replace('\\', '/');
        string leaf = System.IO.Path.GetFileName(path);
        if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
        AssetDatabase.CreateFolder(parent, leaf);
    }
}
