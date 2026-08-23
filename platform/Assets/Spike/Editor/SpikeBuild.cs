using System;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>
/// Headless build entry points (Phase 0 pipeline proof).
///
///   Unity -batchmode -quit -projectPath <proj> -executeMethod SpikeBuild.BuildMac
///   Unity -batchmode -quit -projectPath <proj> -executeMethod SpikeBuild.BuildWindows
///   Unity -batchmode -quit -projectPath <proj> -executeMethod SpikeBuild.BuildAndroid
///
/// Outputs go to Builds/<target>/.
/// </summary>
public static class SpikeBuild
{
    static readonly string[] Scenes = { "Assets/Scenes/Main.unity" };

    public static void BuildMac()    => Build(BuildTargetGroup.Standalone, BuildTarget.StandaloneOSX,    "Builds/mac/AIPlatform.app");
    public static void BuildWindows()=> Build(BuildTargetGroup.Standalone, BuildTarget.StandaloneWindows64, "Builds/win/AIPlatform.exe");
    public static void BuildAndroid()=> Build(BuildTargetGroup.Android,    BuildTarget.Android,           "Builds/android/AIPlatform.apk");

    static void Build(BuildTargetGroup group, BuildTarget target, string outPath)
    {
        // Guarantee platform settings are set in THIS process (they may not
        // have been loaded/persisted from a prior headless run).
        if (target == BuildTarget.Android)
        {
            // Switch the active build target first — headless builds can skip
            // platform switching, leaving Android settings in a stale state.
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            Debug.Log($"[BUILD] Android targetArchitectures={PlayerSettings.Android.targetArchitectures}");
        }

        Debug.Log($"[BUILD] target={target} -> {outPath}");
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = Scenes,
            locationPathName = outPath,
            target = target,
            targetGroup = group,
            options = BuildOptions.None,
        });
        var s = report.summary;
        Debug.Log($"[BUILD] {target} result={s.result} size={s.totalSize} errs={s.totalErrors} warnings={s.totalWarnings}");
        if (s.result != BuildResult.Succeeded)
        {
            foreach (var m in report.steps)
                foreach (var msg in m.messages)
                    if (msg.type == LogType.Error)
                        Debug.LogError($"[BUILD] {m.name}: {msg.content}");
            EditorApplication.Exit(1);
        }
    }
}
