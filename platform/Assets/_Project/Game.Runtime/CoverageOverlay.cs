using System.Collections.Generic;
using UnityEngine;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// coverage_heat overlay: a 32×32 metric grid rendered as a texture on a
    /// map-plane above the ground. Per cell = distance to nearest service
    /// (green near → red far), colour-blind paired with brightness.
    /// </summary>
    public class CoverageOverlay : MonoBehaviour
    {
        const int Grid = 32;
        const float PlaneY = 3f;   // clear of geometry — avoids z-fighting with ground/buildings

        Material _mat;
        Texture2D _tex;
        Renderer _renderer;

        void Awake()
        {
            _tex = new Texture2D(Grid, Grid, TextureFormat.RGB24, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = "CoverageOverlay";
            go.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            var s = _parentSize;
            go.transform.localScale = new Vector3(s[0], s[1], 1f);
            go.transform.position = new Vector3(s[0] / 2f, PlaneY, s[1] / 2f);
            _renderer = go.GetComponent<MeshRenderer>();
            _mat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            // Real transparency (URP Unlit is opaque by default — alpha is
            // ignored until the surface + blend are set to transparent).
            _mat.SetFloat("_Surface", 1f);
            _mat.SetFloat("_Blend", 0f);
            _mat.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            _mat.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            _mat.SetFloat("_ZWrite", 0f);
            _mat.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            _mat.color = new Color(1f, 1f, 1f, 0.45f);
            var mpb = new MaterialPropertyBlock();
            mpb.SetTexture("_BaseMap", _tex);
            _renderer.SetPropertyBlock(mpb);
            _renderer.material = _mat;
            _renderer.enabled = false;
            Destroy(go.GetComponent<Collider>());
        }

        float[] _parentSize = new[] { 240f, 240f };

        public void Rebuild(List<PlacedPieceData> pieces, DistrictManifestData manifest)
        {
            if (manifest?.footprint?.sizeMeters != null)
                _parentSize = manifest.footprint.sizeMeters;
            float w = _parentSize[0], d = _parentSize[1];

            // Collect service positions.
            var services = new List<Vector2>();
            foreach (var p in pieces)
            {
                var piece = Find(manifest, p.pieceId);
                if (piece != null && piece.category == "service") services.Add(new Vector2(p.x, p.z));
            }

            Color[] pixels = new Color[Grid * Grid];
            float maxDist = Mathf.Max(w, d) * 1.2f;
            for (int gy = 0; gy < Grid; gy++)
            for (int gx = 0; gx < Grid; gx++)
            {
                float x = (gx + 0.5f) / Grid * w;
                float z = (gy + 0.5f) / Grid * d;
                float nearest = maxDist;
                foreach (var s in services)
                    nearest = Mathf.Min(nearest, Vector2.Distance(new Vector2(x, z), s));
                float t = Mathf.Clamp01(nearest / CityController.CoverageRadius);
                // green (near) → amber → red (far); brightness varies too (not hue alone)
                pixels[gy * Grid + gx] = Color.Lerp(new Color(0.2f, 0.9f, 0.35f), new Color(0.95f, 0.25f, 0.15f), t);
            }
            _tex.SetPixels(pixels);
            _tex.Apply();
            _mat.color = new Color(1f, 1f, 1f, 0.45f);
        }

        public void Show(bool on) => _renderer.enabled = on;

        static PalettePieceData Find(DistrictManifestData m, string id)
        {
            if (m?.palette == null) return null;
            foreach (var p in m.palette) if (p.pieceId == id) return p;
            return null;
        }
    }
}
