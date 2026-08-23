using System;

namespace AI2School.Districts
{
    // ── DistrictManifest (SO-authored in-editor, exported to versioned JSON
    //    at build time; mirror of the ICapability JSON-blob pattern) ─────────

    [Serializable]
    public class DistrictManifestData
    {
        public string districtId;
        public int version = 1;
        public string displayNameKey;
        public FootprintData footprint;
        public string interiorSceneId;
        public CapabilitySlotData[] capabilitySlots;
        public PalettePieceData[] palette;
        public ObjectiveData[] objectives;
        public ConstraintData[] constraints;
        public string[] overlays;
        public DifficultyTierData difficultyTier;
        public UnlockData unlock;
    }

    [Serializable]
    public class FootprintData
    {
        public float[] origin;      // [x, z] metres
        public float[] sizeMeters;  // [w, h] metres
    }

    [Serializable]
    public class CapabilitySlotData
    {
        public string slotId;
        public string[] acceptedTypes;
        public bool requiredForReveal;
    }

    [Serializable]
    public class PalettePieceData
    {
        public string pieceId;
        public string prefab;          // address / Resources path; null for procedural phase-1
        public float cost;
        public float[] footprintMeters; // [w, h]
        public string category;        // "home" | "service" | "utility" | "park" | ...
        public string displayNameKey;
    }

    [Serializable]
    public class ObjectiveData
    {
        public string metricId;
        public string goal;            // "minimize" | "maximize"
        public float[] targetBand;     // [min, max] "good enough" band
    }

    [Serializable]
    public class ConstraintData
    {
        public string constraintId;
        public float max;
    }

    [Serializable]
    public class DifficultyTierData
    {
        public TierConfigData core;
    }

    [Serializable]
    public class TierConfigData
    {
        public int agentCount = 45;
        public string paletteSubset = "full";
        public float constraintSlack = 1f;
    }

    [Serializable]
    public class UnlockData
    {
        public string[] requires;
    }

    // ── CitySave (versioned, continuous single city) ────────────────────────

    [Serializable]
    public class PlacedPieceData
    {
        public string pieceId;
        public float x;
        public float z;
        public float rotationY;
        public bool locked;
    }

    [Serializable]
    public class DistrictSaveState
    {
        public string districtId;
        public bool unlocked;
        public PlacedPieceData[] placedPieces;
        public string[] capabilityAssignments;
        public MetricSnapshotData[] bestMetrics;
    }

    [Serializable]
    public class MetricSnapshotData
    {
        public string metricId;
        public float value;
    }

    [Serializable]
    public class ProfileMetaData
    {
        public string nickname;   // kid-chosen handle, never a real name
        public string avatarSkin;
    }

    [Serializable]
    public class CitySaveData
    {
        public int saveVersion = 4;
        public ulong masterSeed = 12345;
        public DistrictSaveState[] districts;
        public string[] completedLessons;
        public ProfileMetaData profileMeta;
    }
}
