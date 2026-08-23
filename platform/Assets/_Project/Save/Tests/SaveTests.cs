using System.IO;
using NUnit.Framework;
using UnityEngine;

namespace AI2School.Save.Tests
{
    public class SaveSystemTests
    {
        string _dir;

        [SetUp]
        public void Setup()
        {
            _dir = Path.Combine(Application.temporaryCachePath, "SaveTests_" + System.Guid.NewGuid().ToString("N"));
        }

        [TearDown]
        public void Teardown()
        {
            if (Directory.Exists(_dir)) Directory.Delete(_dir, true);
        }

        [Test]
        public void RoundTrip_PreservesPayload()
        {
            const string payload = "{ \"saveVersion\": 4, \"masterSeed\": 42 }";
            Assert.IsTrue(SaveSystem.SaveJson(_dir, "city", payload, out var err), err);
            var loaded = SaveSystem.LoadJson(_dir, "city");
            Assert.AreEqual(payload, loaded);
        }

        [Test]
        public void CorruptedMain_FallsBackToBackup()
        {
            const string good = "{ \"ok\": true }";
            SaveSystem.SaveJson(_dir, "city", good, out _);           // main + bak1
            SaveSystem.SaveJson(_dir, "city", "{ \"ok\": false }", out _); // rotates: main2, bak1=main1

            // Corrupt the main file payload (flip a byte inside the envelope).
            string mainPath = Path.Combine(_dir, "city.json");
            var bytes = File.ReadAllBytes(mainPath);
            bytes[bytes.Length / 2] ^= 0xFF;
            File.WriteAllBytes(mainPath, bytes);

            // Rotation: before the 2nd save overwrote main, it copied the 1st
            // save ("good") into bak1. So recovery returns the 1st payload.
            var loaded = SaveSystem.LoadJson(_dir, "city");
            Assert.AreEqual(good, loaded, "should have recovered the pre-corruption backup");
        }

        [Test]
        public void AllCorrupt_ReturnsNull()
        {
            SaveSystem.SaveJson(_dir, "city", "{ \"a\": 1 }", out _);
            foreach (var f in Directory.GetFiles(_dir))
                File.WriteAllBytes(f, new byte[] { 0xDE, 0xAD, 0xBE, 0xEF });
            Assert.IsNull(SaveSystem.LoadJson(_dir, "city"));
        }

        [Test]
        public void Crc32_Deterministic()
        {
            Assert.AreEqual(Crc32.Compute("hello"), Crc32.Compute("hello"));
            Assert.AreNotEqual(Crc32.Compute("hello"), Crc32.Compute("hello!"));
        }
    }
}
