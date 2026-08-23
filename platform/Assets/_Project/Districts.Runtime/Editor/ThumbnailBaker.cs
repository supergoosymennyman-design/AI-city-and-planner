using System.IO;
using UnityEditor;
using UnityEngine;

namespace AI2School.Districts.Editor
{
    /// <summary>
    /// Bakes a small thumbnail PNG for every prefab in
    /// Assets/_Project/Art/Resources/Prefabs into
    /// Assets/_Project/Art/Resources/PaletteThumbs/<name>.png.
    /// Uses Unity's built-in AssetPreview (native preview renderer — no
    /// external service, no manual PreviewRenderUtility scene setup).
    /// The HUD loads these at runtime to show a visual palette.
    /// </summary>
    public static class ThumbnailBaker
    {
        public const string ThumbRoot = "Assets/_Project/Art/Resources/PaletteThumbs";

        [MenuItem("AI2School/Models/Bake Palette Thumbnails")]
        public static void BakeAll()
        {
            EnsureFolder(ThumbRoot);
            string[] prefabs = Directory.GetFiles(ModelPipeline.PrefabRoot, "*.prefab", SearchOption.AllDirectories);
            int ok = 0, fail = 0;
            foreach (var p in prefabs)
            {
                string rel = p.Replace('\\', '/');
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(rel);
                if (go == null) { fail++; continue; }
                string name = Path.GetFileNameWithoutExtension(p);
                string outPath = ThumbRoot + "/" + name + ".png";
                if (Bake(go, outPath)) ok++; else fail++;
            }
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"[THUMB] baked {ok} thumbnails, {fail} failed");
        }

        static bool Bake(GameObject prefab, string outPath)
        {
            try
            {
                Texture2D tex = AssetPreview.GetAssetPreview(prefab);
                // First call often kicks off async generation; poll until ready.
                for (int i = 0; i < 50 && (tex == null || tex.width == 0); i++)
                {
                    System.Threading.Thread.Sleep(50);
                    tex = AssetPreview.GetAssetPreview(prefab);
                }
                if (tex == null || tex.width == 0 || tex.height == 0)
                {
                    Debug.LogWarning($"[THUMB] preview never ready for {prefab.name}");
                    return false;
                }

                // AssetPreview textures are not directly readable — copy via RT.
                var rt = RenderTexture.GetTemporary(tex.width, tex.height, 0, RenderTextureFormat.ARGB32);
                Graphics.Blit(tex, rt);
                var prev = RenderTexture.active;
                RenderTexture.active = rt;
                var copy = new Texture2D(tex.width, tex.height, TextureFormat.RGB24, false);
                copy.ReadPixels(new Rect(0, 0, tex.width, tex.height), 0, 0);
                copy.Apply();
                RenderTexture.active = prev;
                RenderTexture.ReleaseTemporary(rt);

                File.WriteAllBytes(outPath, copy.EncodeToPNG());
                return true;
            }
            catch (System.Exception e)
            {
                Debug.LogWarning($"[THUMB] failed {prefab.name}: {e.Message}");
                return false;
            }
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
}
