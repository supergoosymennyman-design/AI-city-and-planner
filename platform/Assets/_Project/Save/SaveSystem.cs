using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace AI2School.Save
{
    /// <summary>
    /// Corruption-tolerant local save: write-temp + atomic rename, rolling
    /// 2-slot backup, CRC32 checksum envelope. Never locks the child out —
    /// callers fall back to backup, then to a fresh city.
    /// </summary>
    public static class SaveSystem
    {
        public const int SaveSlotCount = 2;

        /// <summary>Default save directory (persistent device storage).</summary>
        public static string DefaultDirectory => Path.Combine(Application.persistentDataPath, "Save");

        [Serializable]
        class Envelope
        {
            public uint checksum;
            public string payloadJson;
        }

        /// <summary>Atomic save to a specific directory (pure-ish; testable with a temp dir).</summary>
        public static bool SaveJson(string directory, string slotName, string payloadJson, out string error)
        {
            error = null;
            try
            {
                if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);

                string mainPath = Path.Combine(directory, slotName + ".json");
                string backupPath = Path.Combine(directory, slotName + ".bak" + (SaveSlotCount - 1) + ".json");
                string tmpPath = Path.Combine(directory, slotName + ".tmp.json");

                var env = new Envelope
                {
                    checksum = Crc32.Compute(Encoding.UTF8.GetBytes(payloadJson ?? string.Empty)),
                    payloadJson = payloadJson ?? string.Empty,
                };
                string envJson = JsonUtility.ToJson(env);
                File.WriteAllText(tmpPath, envJson);

                // Rotate backups: main -> bak1 (only if bak1 already exists, shift).
                if (SaveSlotCount > 1 && File.Exists(mainPath))
                {
                    string prevBackup = Path.Combine(directory, slotName + ".bak1.json");
                    if (File.Exists(prevBackup)) File.Copy(prevBackup, backupPath, overwrite: true);
                    File.Copy(mainPath, prevBackup, overwrite: true);
                }

                // Atomic replace of main.
                if (File.Exists(mainPath)) File.Delete(mainPath);
                File.Move(tmpPath, mainPath);
                return true;
            }
            catch (Exception e)
            {
                error = e.Message;
                return false;
            }
        }

        /// <summary>Load main, then backups; returns null only if all slots are missing/corrupt.</summary>
        public static string LoadJson(string directory, string slotName)
        {
            if (string.IsNullOrEmpty(directory) || !Directory.Exists(directory)) return null;

            for (int slot = 0; slot < SaveSlotCount; slot++)
            {
                string path = slot == 0
                    ? Path.Combine(directory, slotName + ".json")
                    : Path.Combine(directory, slotName + ".bak" + slot + ".json");
                if (!File.Exists(path)) continue;

                try
                {
                    string envJson = File.ReadAllText(path);
                    var env = JsonUtility.FromJson<Envelope>(envJson);
                    if (env == null) continue;
                    uint actual = Crc32.Compute(Encoding.UTF8.GetBytes(env.payloadJson ?? string.Empty));
                    if (actual != env.checksum) continue;   // corrupt — try next slot
                    return env.payloadJson;
                }
                catch
                {
                    // try next slot
                }
            }
            return null;
        }

        public static bool DeleteSave(string directory, string slotName)
        {
            try
            {
                for (int slot = 0; slot < SaveSlotCount; slot++)
                {
                    string path = slot == 0
                        ? Path.Combine(directory, slotName + ".json")
                        : Path.Combine(directory, slotName + ".bak" + slot + ".json");
                    if (File.Exists(path)) File.Delete(path);
                }
                return true;
            }
            catch
            {
                return false;
            }
        }
    }

    /// <summary>IEEE CRC-32, table-based.</summary>
    public static class Crc32
    {
        static readonly uint[] Table = BuildTable();

        static uint[] BuildTable()
        {
            var table = new uint[256];
            for (uint i = 0; i < 256; i++)
            {
                uint c = i;
                for (int k = 0; k < 8; k++)
                    c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
                table[i] = c;
            }
            return table;
        }

        public static uint Compute(byte[] data)
        {
            uint crc = 0xFFFFFFFFu;
            foreach (var b in data)
                crc = Table[(crc ^ b) & 0xFF] ^ (crc >> 8);
            return crc ^ 0xFFFFFFFFu;
        }

        public static uint Compute(string text) => Compute(Encoding.UTF8.GetBytes(text ?? string.Empty));
    }
}
