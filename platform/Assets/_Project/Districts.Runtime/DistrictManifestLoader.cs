using System;
using System.Collections.Generic;
using UnityEngine;

namespace AI2School.Districts
{
    /// <summary>Loads + validates a DistrictManifest from its exported JSON.</summary>
    public static class DistrictManifestLoader
    {
        public const int ManifestVersion = 1;

        /// <summary>Returns null if invalid; logs problems via onProblem.</summary>
        public static DistrictManifestData Load(string json, Action<string> onProblem = null)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                onProblem?.Invoke("Manifest JSON is empty.");
                return null;
            }

            DistrictManifestData m;
            try
            {
                m = JsonUtility.FromJson<DistrictManifestData>(json);
            }
            catch (Exception e)
            {
                onProblem?.Invoke("Malformed manifest JSON: " + e.Message);
                return null;
            }

            var problems = Validate(m);
            if (problems.Count > 0)
            {
                foreach (var p in problems) onProblem?.Invoke(p);
                return null;
            }
            return m;
        }

        public static List<string> Validate(DistrictManifestData m)
        {
            var problems = new List<string>();
            if (m == null) { problems.Add("Manifest is null."); return problems; }
            if (string.IsNullOrWhiteSpace(m.districtId)) problems.Add("districtId is required.");
            if (m.version != ManifestVersion) problems.Add($"Unsupported manifest version {m.version} (expected {ManifestVersion}).");
            if (m.footprint == null || m.footprint.sizeMeters == null || m.footprint.sizeMeters.Length < 2)
                problems.Add("footprint.sizeMeters [w,h] is required.");
            if (m.palette == null || m.palette.Length == 0) problems.Add("palette must contain at least one piece.");
            foreach (var p in m.palette ?? Array.Empty<PalettePieceData>())
            {
                if (string.IsNullOrWhiteSpace(p.pieceId)) problems.Add("palette piece has no pieceId.");
                if (p.footprintMeters == null || p.footprintMeters.Length < 2) problems.Add($"piece '{p.pieceId}' has no footprintMeters [w,h].");
            }
            return problems;
        }
    }
}
