using System.IO;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;

/// <summary>
/// Creates TMP Settings + a default SDF font asset programmatically (headless
/// friendly — the "Import TMP Essential Resources" menu is a .unitypackage
/// import with interactive:true, which doesn't work in -batchmode).
///   Unity -batchmode -quit -executeMethod TmpBootstrap.Create
/// </summary>
public static class TmpBootstrap
{
    public static void Create()
    {
        const string root = "Assets/TextMesh Pro";
        const string resDir = root + "/Resources";
        const string fontsDir = root + "/Fonts";
        EnsureFolder(root);
        EnsureFolder(resDir);
        EnsureFolder(fontsDir);

        var settings = AssetDatabase.LoadAssetAtPath<TMP_Settings>(resDir + "/TMP Settings.asset");
        if (settings == null)
        {
            settings = ScriptableObject.CreateInstance<TMP_Settings>();
            AssetDatabase.CreateAsset(settings, resDir + "/TMP Settings.asset");
        }

        var fontAsset = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(fontsDir + "/TMP-DefaultFont.asset");
        if (fontAsset == null)
        {
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (font == null) { Debug.LogError("[TMP] LegacyRuntime.ttf not found"); EditorApplication.Exit(1); return; }
            fontAsset = TMP_FontAsset.CreateFontAsset(font, 90, 9, GlyphRenderMode.SDFAA, 1024, 1024);
            AssetDatabase.CreateAsset(fontAsset, fontsDir + "/TMP-DefaultFont.asset");
        }

        var so = new SerializedObject(settings);
        var prop = so.FindProperty("m_defaultFontAsset");
        if (prop != null) { prop.objectReferenceValue = fontAsset; so.ApplyModifiedProperties(); }

        AssetDatabase.SaveAssets();
        Debug.Log("[TMP] settings + font asset ready: " + fontAsset.name);
        EditorApplication.Exit(0);
    }

    static void EnsureFolder(string path)
    {
        if (AssetDatabase.IsValidFolder(path)) return;
        string parent = Path.GetDirectoryName(path).Replace('\\', '/');
        string leaf = Path.GetFileName(path);
        if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
        AssetDatabase.CreateFolder(parent, leaf);
    }
}
