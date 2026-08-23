using System.Collections.Generic;

namespace AI2School.Core.Capability
{
    /// <summary>
    /// Stub capability for Phase 1 — NOT from the workshop team. A threshold
    /// on one snapshot feature: returns "pass" when feature >= threshold.
    /// Parameters: { "feature": Str("distance_to_service"), "threshold": Number(150.0) }
    /// </summary>
    public sealed class ThresholdCapability : ICapability
    {
        public string TypeId => "threshold_v1";
        public int SchemaVersion => 1;
        public IReadOnlyDictionary<string, JsonValue> Parameters { get; }
        public IReadOnlyList<WorkedExample> TrainingTrace { get; }

        public ThresholdCapability(string featureName, double threshold)
        {
            Parameters = new Dictionary<string, JsonValue>
            {
                ["feature"] = JsonValue.FromString(featureName),
                ["threshold"] = JsonValue.FromNumber(threshold),
            };
            TrainingTrace = new List<WorkedExample>();
        }

        // For deserialization from a workshop JSON blob (allows any parameters).
        public ThresholdCapability(IReadOnlyDictionary<string, JsonValue> parameters, IReadOnlyList<WorkedExample> trace = null)
        {
            Parameters = parameters;
            TrainingTrace = trace ?? new List<WorkedExample>();
        }
    }

    public sealed class ThresholdRuntime : ICapabilityRuntime
    {
        public string TypeId => "threshold_v1";

        public CapabilityDecision Evaluate(ICapability capability, WorldSnapshot snapshot)
        {
            string feature = capability.Parameters.TryGetValue("feature", out var f) ? f.AsString("value") : "value";
            double threshold = capability.Parameters.TryGetValue("threshold", out var t) ? t.AsNumber(0) : 0;
            float value = snapshot.Features.TryGetValue(feature, out var v) ? v : 0f;
            bool pass = value >= threshold;
            return new CapabilityDecision(pass ? "pass" : "fail", pass ? 1f : 0f, 0, null);
        }
    }
}
