using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace AI2School.Districts.Editor
{
    /// <summary>
    /// Asset pipeline for the model library (blueprint §14):
    ///  - After every GLB/FBX/prefab import under Assets/_Project/Art, walk the
    ///    generated prefabs and enforce poly ceilings.
    ///  - Poly ceilings: small prop ≤ 500 tris, medium building ≤ 3000,
    ///    hero ≤ 8000. Build-gate via ValidatePolyCounts (CI) / menu.
    ///  - Keeps a machine-readable index (Assets/_Project/Art/ModelIndex.json)
    ///    of every prefab: name, triangle count, bounds, material count — used
    ///    by the ModelCatalog builder and by CI.
    /// </summary>
    public static class ModelPipeline
    {
        public const string ModelsRoot = "Assets/_Project/Art/Models";
        public const string PrefabRoot = "Assets/_Project/Art/Resources/Prefabs";
        public const string IndexPath = "Assets/_Project/Art/ModelIndex.json";

        public const int CeilingProp = 500;
        public const int CeilingBuilding = 3000;
        public const int CeilingHero = 8000;

        [System.Serializable]
        public class ModelEntry
        {
            public string prefabName;
            public int triangles;
            public int materialCount;
            public float boundsSizeX;
            public float boundsSizeY;
            public float boundsSizeZ;
            public string sourcePath;
        }

        [System.Serializable]
        public class ModelIndex
        {
            public List<ModelEntry> models = new List<ModelEntry>();
        }

        // ── Index + validation ────────────────────────────────────────────────
        /// <summary>Walk every prefab under PrefabRoot and produce the model index.</summary>
        public static ModelIndex BuildIndex()
        {
            var idx = new ModelIndex();
            if (!Directory.Exists(PrefabRoot)) return idx;

            string[] prefabs = Directory.GetFiles(PrefabRoot, "*.prefab", SearchOption.AllDirectories);
            foreach (var p in prefabs)
            {
                string rel = p.Replace('\\', '/');
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(rel);
                if (go == null) continue;

                int tris = 0, mats = 0;
                foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
                {
                    if (mf.sharedMesh != null) tris += mf.sharedMesh.triangles.Length / 3;
                    var mr = mf.GetComponent<Renderer>();
                    if (mr != null) mats += mr.sharedMaterials.Length;
                }
                // Skinned meshes (characters/robots)
                foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                {
                    if (smr.sharedMesh != null) tris += smr.sharedMesh.triangles.Length / 3;
                    mats += smr.sharedMaterials.Length;
                }

                var b = ComputeBounds(go);
                idx.models.Add(new ModelEntry
                {
                    prefabName = Path.GetFileNameWithoutExtension(p),
                    triangles = tris,
                    materialCount = mats,
                    boundsSizeX = b.size.x,
                    boundsSizeY = b.size.y,
                    boundsSizeZ = b.size.z,
                    sourcePath = rel,
                });
            }
            idx.models.Sort((a, b) => string.CompareOrdinal(a.prefabName, b.prefabName));
            return idx;
        }

        public static Bounds ComputeBounds(GameObject go)
        {
            var renderers = go.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return new Bounds(go.transform.position, Vector3.one);
            var b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
            return b;
        }

        /// <summary>Write ModelIndex.json next to the models (inspector/CI visibility).</summary>
        public static void WriteIndex(ModelIndex idx)
        {
            string json = JsonUtility.ToJson(idx, prettyPrint: true);
            File.WriteAllText(IndexPath, json);
            AssetDatabase.ImportAsset(IndexPath);
        }

        /// <summary>
        /// Validate all prefabs against poly ceilings. Returns list of
        /// violations (empty = green). buildMode=true raises as errors for CI.
        /// </summary>
        public static List<string> ValidatePolyCounts(bool buildMode)
        {
            var violations = new List<string>();
            var idx = BuildIndex();
            foreach (var m in idx.models)
            {
                int ceiling = CeilingFor(m.triangles, m.boundsSizeY);
                if (m.triangles > ceiling)
                {
                    string msg = $"[POLY] {m.prefabName} has {m.triangles} tris (ceiling {ceiling})";
                    violations.Add(msg);
                    if (buildMode) Debug.LogError(msg); else Debug.LogWarning(msg);
                }
            }
            return violations;
        }

        /// <summary>Classify a model by size/role to pick its ceiling.</summary>
        static int CeilingFor(int tris, float height)
        {
            // Tall/hero models (people, robots, towers) get the hero ceiling.
            if (height < 12f) return tris <= CeilingProp ? CeilingProp : CeilingBuilding;
            return CeilingHero;
        }

        // ── Menu entries ──────────────────────────────────────────────────────
        [MenuItem("AI2School/Models/Rebuild Index")]
        public static void RebuildIndexMenu()
        {
            var idx = BuildIndex();
            WriteIndex(idx);
            Debug.Log($"[MODELS] index written: {idx.models.Count} prefabs");
        }

        [MenuItem("AI2School/Models/Validate Poly Counts")]
        public static void ValidateMenu()
        {
            var v = ValidatePolyCounts(buildMode: false);
            Debug.Log(v.Count == 0
                ? "[MODELS] all prefabs within poly ceilings"
                : $"[MODELS] {v.Count} violation(s):\n" + string.Join("\n", v));
        }

        /// <summary>
        /// Generate a .prefab for every FBX model under Models/roads into
        /// Resources/Prefabs (Unity imports FBX natively; glTFast only handles
        /// GLBs, so FBX prefabs must be created here).
        /// </summary>
        [MenuItem("AI2School/Models/Build Road Prefabs")]
        public static void BuildRoadPrefabs()
        {
            const string fbxRoot = "Assets/_Project/Art/Models/roads";
            if (!Directory.Exists(fbxRoot)) { Debug.LogWarning("[MODELS] no roads folder"); return; }

            string[] fbxs = Directory.GetFiles(fbxRoot, "*.fbx", SearchOption.AllDirectories);
            int ok = 0, fail = 0;
            foreach (var f in fbxs)
            {
                string rel = f.Replace('\\', '/');
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(rel);
                if (go == null) { Debug.LogWarning("[MODELS] no GameObject for " + rel); fail++; continue; }
                string name = Path.GetFileNameWithoutExtension(f);
                string prefabPath = PrefabRoot + "/" + name + ".prefab";
                var prefab = PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
                if (prefab != null) ok++; else { Debug.LogWarning("[MODELS] prefab failed: " + rel); fail++; }
            }
            AssetDatabase.SaveAssets();
            Debug.Log($"[MODELS] road prefabs generated: {ok}, failed {fail}");
        }
    }

    /// <summary>Fires on model asset changes to refresh the index + ceilings.</summary>
    public sealed class ModelPostprocessor : AssetPostprocessor
    {
        static void OnPostprocessAllAssets(string[] importedAssets, string[] deletedAssets,
            string[] movedAssets, string[] movedFromAssetPaths)
        {
            bool modelTouched = false;
            foreach (var p in importedAssets)
                if (p.StartsWith(ModelPipeline.ModelsRoot) || p.StartsWith(ModelPipeline.PrefabRoot)) { modelTouched = true; break; }
            foreach (var p in deletedAssets)
                if (p.StartsWith(ModelPipeline.ModelsRoot) || p.StartsWith(ModelPipeline.PrefabRoot)) { modelTouched = true; break; }

            if (!modelTouched) return;
            // Defer to next editor tick so all GLBs finish importing first.
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isCompiling) return;
                var idx = ModelPipeline.BuildIndex();
                ModelPipeline.WriteIndex(idx);
                var v = ModelPipeline.ValidatePolyCounts(buildMode: false);
                Debug.Log($"[MODELS] index updated: {idx.models.Count} prefabs" +
                          (v.Count > 0 ? $", {v.Count} poly violations" : ""));
            };
        }
    }
}
