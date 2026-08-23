using System.IO;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Generates a standard .prefab for every imported GLB model under
/// Assets/_Project/Art/Models, into Assets/_Project/Art/Resources/Prefabs
/// (Resources so runtime code can load them by name in builds).
///   Unity -batchmode -quit -executeMethod GlbToPrefab.Generate
/// </summary>
public static class GlbToPrefab
{
    public static void Generate()
    {
        const string modelsRoot = "Assets/_Project/Art/Models";
        const string prefabRoot = "Assets/_Project/Art/Resources/Prefabs";
        EnsureFolder(prefabRoot);

        string[] glbs = Directory.GetFiles(modelsRoot, "*.glb", SearchOption.AllDirectories);
        int ok = 0, fail = 0;
        foreach (var glb in glbs)
        {
            string rel = glb.Replace('\\', '/');
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(rel);
            string name = Path.GetFileNameWithoutExtension(glb);
            if (go == null)
            {
                Debug.LogWarning("[GLB2PF] no GameObject main asset: " + rel);
                fail++;
                continue;
            }
            string prefabPath = prefabRoot + "/" + name + ".prefab";
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            if (prefab != null) ok++; else { Debug.LogWarning("[GLB2PF] failed: " + rel); fail++; }
        }
        AssetDatabase.SaveAssets();
        Debug.Log($"[GLB2PF] generated {ok} prefabs, {fail} failed");
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

    /// <summary>Debug: dump the ImportLog error messages on a GLB.</summary>
    public static void DumpLog()
    {
        string[] paths = { "Assets/_Project/Art/Models/buildings/housing.glb",
                           "Assets/_Project/Art/Models/nature/tree-normal.glb" };
        foreach (var p in paths)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath(p);
            foreach (var a in assets)
            {
                Debug.Log($"[IMPLOG] {p} asset type={a.GetType().FullName} name={a.name}");
                var t = a.GetType();
                foreach (var f in t.GetFields(System.Reflection.BindingFlags.Instance |
                                              System.Reflection.BindingFlags.Public |
                                              System.Reflection.BindingFlags.NonPublic))
                {
                    object v;
                    try { v = f.GetValue(a); } catch { continue; }
                    if (v is System.Collections.IEnumerable en && !(v is string))
                    {
                        foreach (var item in en)
                        {
                            string msg = item == null ? "null" : item.ToString();
                            var mp = item.GetType().GetProperty("Messages");
                            var cp = item.GetType().GetProperty("Code");
                            var tp = item.GetType().GetProperty("Type");
                            if (mp != null && cp != null)
                            {
                                var msgs = mp.GetValue(item) as string[];
                                msg = $"{tp?.GetValue(item)} {cp.GetValue(item)} :: {string.Join(" | ", msgs ?? new string[0])}";
                            }
                            Debug.Log($"[IMPLOG] {f.Name}[]: {msg}");
                        }
                    }
                    else
                    {
                        Debug.Log($"[IMPLOG] {f.Name} = {v}");
                    }
                }
            }
        }
        EditorApplication.Exit(0);
    }

    /// <summary>Debug: dump asset types inside a GLB.</summary>
    public static void Dump()
    {
        string[] paths = { "Assets/_Project/Art/Models/buildings/housing.glb",
                           "Assets/_Project/Art/Models/nature/tree-normal.glb",
                           "Assets/_Project/Art/Models/people/man-worker.glb",
                           "Assets/_Project/Art/Models/buildings/housing-a.glb" };
        foreach (var p in paths)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath(p);
            Debug.Log($"[DUMP] {p} -> {assets.Length} assets: " + string.Join(", ", System.Array.ConvertAll(assets, a => a.GetType().Name + ":" + a.name)));
        }
        EditorApplication.Exit(0);
    }
}
