using System.Collections.Generic;

namespace AI2School.Core.Capability
{
    /// <summary>A worked example the child used to build the capability — replay/explainability, never PII.</summary>
    public readonly struct WorkedExample
    {
        public readonly IReadOnlyDictionary<string, float> Features;
        public readonly string Label;

        public WorkedExample(IReadOnlyDictionary<string, float> features, string label)
        {
            Features = features;
            Label = label;
        }
    }

    /// <summary>
    /// Frozen contract v1 — capability ↔ simulation. Engine-agnostic.
    /// The external workshop team builds JSON blobs that deserialize into
    /// implementations of this interface.
    /// </summary>
    public interface ICapability
    {
        string TypeId { get; }               // "threshold_v1" | "classifier_v1" | "router_v1" | "optimizer_v1"
        int SchemaVersion { get; }
        IReadOnlyDictionary<string, JsonValue> Parameters { get; }
        IReadOnlyList<WorkedExample> TrainingTrace { get; }
    }

    /// <summary>
    /// One tick of world state fed to Evaluate(). The seed is threaded through
    /// the snapshot (not a stateful RNG by reference) so Evaluate is a pure
    /// function: same capability + snapshot → same decision, forever.
    /// </summary>
    public readonly struct WorldSnapshot
    {
        public readonly ulong Seed;
        public readonly IReadOnlyDictionary<string, float> Features;

        public WorldSnapshot(ulong seed, IReadOnlyDictionary<string, float> features)
        {
            Seed = seed;
            Features = features;
        }
    }

    /// <summary>The output of a capability evaluation.</summary>
    public readonly struct CapabilityDecision
    {
        public readonly string Label;       // classifier / threshold
        public readonly float Confidence;   // classifier / threshold
        public readonly int RouteIndex;     // router
        public readonly float[] Allocation; // optimizer / budget

        public CapabilityDecision(string label, float confidence, int routeIndex, float[] allocation)
        {
            Label = label;
            Confidence = confidence;
            RouteIndex = routeIndex;
            Allocation = allocation;
        }
    }

    /// <summary>Evaluates a capability against a snapshot. Pure + deterministic.</summary>
    public interface ICapabilityRuntime
    {
        string TypeId { get; }
        CapabilityDecision Evaluate(ICapability capability, WorldSnapshot snapshot);
    }
}
