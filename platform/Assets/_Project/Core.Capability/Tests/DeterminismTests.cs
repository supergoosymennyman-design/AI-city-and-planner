using NUnit.Framework;
using AI2School.Core.Determinism;

namespace AI2School.Core.Capability.Tests
{
    public class DeterministicRngTests
    {
        [Test]
        public void SameSeed_SameSequence()
        {
            var a = new DeterministicRng(12345);
            var b = new DeterministicRng(12345);
            for (int i = 0; i < 1000; i++)
                Assert.AreEqual(a.NextUInt(), b.NextUInt(), $"mismatch at {i}");
        }

        [Test]
        public void DifferentSeeds_DifferentSequences()
        {
            var a = new DeterministicRng(1);
            var b = new DeterministicRng(2);
            bool anyDifferent = false;
            for (int i = 0; i < 100; i++)
                if (a.NextUInt() != b.NextUInt()) { anyDifferent = true; break; }
            Assert.IsTrue(anyDifferent, "two seeds produced identical sequences");
        }

        [Test]
        public void NextFloat_InRange()
        {
            var rng = new DeterministicRng(99);
            for (int i = 0; i < 10000; i++)
            {
                float v = rng.NextFloat();
                Assert.GreaterOrEqual(v, 0f);
                Assert.Less(v, 1f);
            }
        }

        [Test]
        public void NextInt_WithinRange()
        {
            var rng = new DeterministicRng(7);
            for (int i = 0; i < 10000; i++)
            {
                int v = rng.NextInt(3, 17);
                Assert.GreaterOrEqual(v, 3);
                Assert.Less(v, 17);
            }
        }

        [Test]
        public void SeedForTick_IsDeterministicAndOrderSensitive()
        {
            Assert.AreEqual(
                DeterministicRng.SeedForTick(1000, 5),
                DeterministicRng.SeedForTick(1000, 5));
            Assert.AreNotEqual(
                DeterministicRng.SeedForTick(1000, 5),
                DeterministicRng.SeedForTick(1000, 6));
        }
    }

    public class ThresholdRuntimeTests
    {
        [Test]
        public void SameCapabilityAndSnapshot_SameDecision_1000Times()
        {
            var capability = new ThresholdCapability("distance_to_service", 150.0);
            var runtime = new ThresholdRuntime();
            var snapshot = new WorldSnapshot(
                DeterministicRng.SeedForTick(42, 1),
                new System.Collections.Generic.Dictionary<string, float> { ["distance_to_service"] = 120f });

            var first = runtime.Evaluate(capability, snapshot);
            for (int i = 0; i < 1000; i++)
            {
                var again = runtime.Evaluate(capability, snapshot);
                Assert.AreEqual(first.Label, again.Label);
                Assert.AreEqual(first.Confidence, again.Confidence);
            }
        }

        [Test]
        public void BelowThreshold_Fails()
        {
            var capability = new ThresholdCapability("distance_to_service", 150.0);
            var runtime = new ThresholdRuntime();
            var snap = new WorldSnapshot(1, new System.Collections.Generic.Dictionary<string, float> { ["distance_to_service"] = 100f });
            Assert.AreEqual("fail", runtime.Evaluate(capability, snap).Label);
        }

        [Test]
        public void AtThreshold_Passes()
        {
            var capability = new ThresholdCapability("distance_to_service", 150.0);
            var runtime = new ThresholdRuntime();
            var snap = new WorldSnapshot(1, new System.Collections.Generic.Dictionary<string, float> { ["distance_to_service"] = 150f });
            Assert.AreEqual("pass", runtime.Evaluate(capability, snap).Label);
        }

        [Test]
        public void MissingFeature_DefaultsToFail()
        {
            var capability = new ThresholdCapability("distance_to_service", 150.0);
            var runtime = new ThresholdRuntime();
            var snap = new WorldSnapshot(1, new System.Collections.Generic.Dictionary<string, float>());
            Assert.AreEqual("fail", runtime.Evaluate(capability, snap).Label);
        }
    }
}
