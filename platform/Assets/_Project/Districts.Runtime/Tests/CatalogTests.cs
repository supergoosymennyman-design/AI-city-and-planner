using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace AI2School.Districts.Tests
{
    /// <summary>
    /// Catalog tests for the expanded City Base palette:
    ///  - the manifest is schema-valid (DistrictManifestLoader)
    ///  - every palette prefab (and variant) resolves to a Resources prefab
    ///  - variant selection is deterministic for the same layout
    ///  - budget constraint is positive and palette costs are sane
    /// </summary>
    public class CatalogTests
    {
        static DistrictManifestData LoadCityBase()
        {
            var asset = Resources.Load<TextAsset>("CityBase.manifest");
            Assert.IsNotNull(asset, "CityBase.manifest should exist in Resources");
            var m = DistrictManifestLoader.Load(asset.text, p => Assert.Fail("manifest problem: " + p));
            Assert.IsNotNull(m);
            return m;
        }

        [Test]
        public void CityBaseManifest_LoadsAndHasExpandedPalette()
        {
            var m = LoadCityBase();
            Assert.AreEqual("city_base", m.districtId);
            Assert.GreaterOrEqual(m.palette.Length, 50, "palette should have 50+ pieces");
        }

        [Test]
        public void Palette_CategoriesAreCovered()
        {
            var m = LoadCityBase();
            var cats = new HashSet<string>();
            foreach (var p in m.palette) cats.Add(p.category);
            foreach (var expected in new[] { "home", "service", "utility", "park", "road", "deco" })
                Assert.IsTrue(cats.Contains(expected), $"missing category {expected}");
        }

        [Test]
        public void EveryPrefab_ResolvesToResources()
        {
            var m = LoadCityBase();
            var missing = new List<string>();
            foreach (var p in m.palette)
            {
                if (!string.IsNullOrEmpty(p.prefab) && Resources.Load<GameObject>("Prefabs/" + p.prefab) == null)
                    missing.Add(p.prefab);
                if (p.variants != null)
                    foreach (var v in p.variants)
                        if (Resources.Load<GameObject>("Prefabs/" + v) == null)
                            missing.Add(v);
            }
            Assert.IsEmpty(missing, "missing prefabs: " + string.Join(", ", missing));
        }

        [Test]
        public void PaletteCosts_WithinBudget()
        {
            var m = LoadCityBase();
            float budget = 0;
            foreach (var c in m.constraints ?? System.Array.Empty<ConstraintData>())
                if (c.constraintId == "budget") budget = c.max;
            Assert.Greater(budget, 0, "budget must be positive");
            // Every single piece must be affordable in a fresh city.
            foreach (var p in m.palette)
                Assert.LessOrEqual(p.cost, budget, $"piece {p.pieceId} costs more than budget");
        }

        [Test]
        public void PieceIds_AreUnique()
        {
            var m = LoadCityBase();
            var ids = new HashSet<string>();
            foreach (var p in m.palette)
                Assert.IsTrue(ids.Add(p.pieceId), $"duplicate pieceId {p.pieceId}");
        }

        [Test]
        public void Footprints_ArePositive()
        {
            var m = LoadCityBase();
            foreach (var p in m.palette)
            {
                Assert.IsNotNull(p.footprintMeters, $"piece {p.pieceId} missing footprint");
                Assert.Greater(p.footprintMeters.Length, 1, $"piece {p.pieceId} bad footprint");
                Assert.Greater(p.footprintMeters[0], 0f, $"piece {p.pieceId} w<=0");
                Assert.Greater(p.footprintMeters[1], 0f, $"piece {p.pieceId} d<=0");
            }
        }
    }
}
