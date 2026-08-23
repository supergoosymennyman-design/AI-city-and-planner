using System;
using System.Collections.Generic;
using UnityEngine;

namespace AI2School.Districts
{
    /// <summary>
    /// A placeable piece in a district palette — one catalog entry. Mirrors the
    /// JSON manifest palette schema (DistrictManifest.palette) so the SO can be
    /// authored in-editor and exported to the same versioned JSON blob.
    /// </summary>
    [Serializable]
    public class CatalogPieceData
    {
        public string pieceId;              // unique id, e.g. "housing_pod_a"
        public string displayName;          // human name (localization later)
        public string prefab;               // Resources/Prefabs/<name> (no extension)
        public string category;             // home | service | park | road | deco | nature | prop | power
        public float cost;
        public float[] footprintMeters;     // [w, d]
        public string[] variants;           // prefab names to pick among (random variant per placement)
        public bool scatter;                // true = tiny deco, no footprint collision (nature filler)
        public string source;               // provenance: "kenney", "quaternius", "poly-pizza", "generated"
        public string license;              // "CC0", "CC-BY"
        public string attributionUrl;       // for CC-BY / provenance

        public float FootprintW => footprintMeters != null && footprintMeters.Length > 0 ? footprintMeters[0] : 8f;
        public float FootprintD => footprintMeters != null && footprintMeters.Length > 1 ? footprintMeters[1] : 8f;
    }

    /// <summary>
    /// Data-driven model catalog for a district palette — the runtime container
    /// that replaces the hardcoded PrefabFor() switch in MinimalCity. Authored as
    /// a ScriptableObject in-editor, exported to JSON mirroring DistrictManifest.
    /// </summary>
    [CreateAssetMenu(fileName = "ModelCatalog", menuName = "AI2School/Model Catalog")]
    public class ModelCatalog : ScriptableObject
    {
        [SerializeField] private string _catalogId = "city_base_models";
        [SerializeField] private int _version = 1;
        [SerializeField] private List<CatalogPieceData> _pieces = new List<CatalogPieceData>();

        public string CatalogId => _catalogId;
        public int Version => _version;
        public IReadOnlyList<CatalogPieceData> Pieces => _pieces;

        public CatalogPieceData Find(string pieceId)
        {
            foreach (var p in _pieces)
                if (p.pieceId == pieceId) return p;
            return null;
        }

        public List<CatalogPieceData> All() => _pieces;
    }
}
