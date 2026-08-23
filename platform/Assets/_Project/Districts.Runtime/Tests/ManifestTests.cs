using System.Collections.Generic;
using NUnit.Framework;

namespace AI2School.Districts.Tests
{
    public class ManifestTests
    {
        const string ValidCityBase =
            "{ \"districtId\": \"city_base\", \"version\": 1, \"footprint\": { \"origin\": [0,0], \"sizeMeters\": [240,240] }, " +
            "\"palette\": [ { \"pieceId\": \"home\", \"cost\": 20, \"footprintMeters\": [8,8] } ] }";

        [Test]
        public void ValidManifest_Loads()
        {
            var m = DistrictManifestLoader.Load(ValidCityBase, p => Assert.Fail("unexpected problem: " + p));
            Assert.IsNotNull(m);
            Assert.AreEqual("city_base", m.districtId);
            Assert.AreEqual(1, m.palette.Length);
        }

        [Test]
        public void InvalidJson_Fails()
        {
            var problems = new List<string>();
            var m = DistrictManifestLoader.Load("{ not json", problems.Add);
            Assert.IsNull(m);
            Assert.GreaterOrEqual(problems.Count, 1);
        }

        [Test]
        public void WrongVersion_Fails()
        {
            var problems = new List<string>();
            var m = DistrictManifestLoader.Load(
                "{ \"districtId\": \"x\", \"version\": 99, \"footprint\": { \"origin\": [0,0], \"sizeMeters\": [1,1] }, \"palette\": [ { \"pieceId\": \"p\", \"cost\": 1, \"footprintMeters\": [1,1] } ] }",
                problems.Add);
            Assert.IsNull(m);
            Assert.IsTrue(problems.Exists(p => p.Contains("version")));
        }

        [Test]
        public void MissingPalette_Fails()
        {
            var problems = new List<string>();
            var m = DistrictManifestLoader.Load(
                "{ \"districtId\": \"x\", \"version\": 1, \"footprint\": { \"origin\": [0,0], \"sizeMeters\": [1,1] } }",
                problems.Add);
            Assert.IsNull(m);
            Assert.IsTrue(problems.Exists(p => p.Contains("palette")));
        }
    }
}
