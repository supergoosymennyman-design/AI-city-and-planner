using System.IO;
using UnityEditor;
using UnityEngine;

namespace AI2School.Districts.Editor
{
    /// <summary>
    /// One-time editor setup: for each rigged people prefab, find its GLB walk
    /// clip and attach an Animation component with that clip so it plays at
    /// runtime (the prefab only has a bare Animator + the GLB's clips are not
    /// in Resources, so we bake the walk clip into the prefab directly).
    ///
    /// Menu: AI2School/Models/Bake People Walk Clips
    /// </summary>
    public static class PeopleWalkBaker
    {
        public const string PeopleRoot = "Assets/_Project/Art/Models/people";

        [MenuItem("AI2School/Models/Bake People Walk Clips")]
        public static void BakeAll()
        {
            string[] glbs = Directory.GetFiles(PeopleRoot, "*.glb", SearchOption.AllDirectories);
            int ok = 0;
            foreach (var glb in glbs)
            {
                string modelName = Path.GetFileNameWithoutExtension(glb);
                string prefabPath = $"Assets/_Project/Art/Resources/Prefabs/{modelName}.prefab";
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
                if (prefab == null) continue;

                var walkClip = FindWalkClip(glb);
                if (walkClip == null) continue;

                // Ensure an Animation component with the walk clip.
                var anim = prefab.GetComponent<Animation>();
                if (anim == null)
                {
                    anim = prefab.AddComponent<Animation>();
                    anim.clip = walkClip;
                    anim.AddClip(walkClip, walkClip.name);
                }
                else if (anim.GetClip(walkClip.name) == null)
                {
                    anim.AddClip(walkClip, walkClip.name);
                    if (anim.clip == null) anim.clip = walkClip;
                }

                // Apply the edit back to the prefab asset.
                PrefabUtility.SavePrefabAsset(prefab);
                ok++;
                Debug.Log($"[WALK] baked '{walkClip.name}' into {modelName}.prefab");
            }
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"[WALK] done: {ok} people prefabs have walk clips");
        }

        static AnimationClip FindWalkClip(string glbPath)
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath(glbPath);
            foreach (var a in assets)
            {
                if (a is AnimationClip c && c.name.ToLowerInvariant().Contains("walk"))
                    return c;
            }
            return null;
        }
    }
}
