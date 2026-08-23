using System;

namespace AI2School.Core.Determinism
{
    /// <summary>
    /// Deterministic xoshiro128** PRNG, pure C#, no Unity dependency.
    ///
    /// One instance per subsystem stream. Gameplay logic must only ever use
    /// this (never UnityEngine.Random / System.Random / DateTime.Now).
    /// Same seed → same sequence, forever.
    /// </summary>
    public sealed class DeterministicRng
    {
        uint _s0, _s1, _s2, _s3;

        public DeterministicRng(ulong seed)
        {
            // SplitMix64 scramble of the seed into 4 uint lanes (never all-zero).
            ulong z = seed;
            _s0 = (uint)SplitMix64(ref z);
            _s1 = (uint)SplitMix64(ref z);
            _s2 = (uint)SplitMix64(ref z);
            _s3 = (uint)SplitMix64(ref z);
            if ((_s0 | _s1 | _s2 | _s3) == 0u) _s0 = 0x9E3779B9u;
        }

        /// <summary>Next uniform uint in [0, 2^32).</summary>
        public uint NextUInt()
        {
            uint result = Rotl(_s1 * 5u, 7) * 9u;
            uint t = _s1 << 9;
            _s2 ^= _s0;
            _s3 ^= _s1;
            _s1 ^= _s2;
            _s0 ^= _s3;
            _s2 ^= t;
            _s3 = Rotl(_s3, 11);
            return result;
        }

        /// <summary>Uniform float in [0, 1).</summary>
        public float NextFloat()
        {
            return (NextUInt() >> 8) * (1f / 16777216f);
        }

        /// <summary>Uniform double in [0, 1).</summary>
        public double NextDouble()
        {
            return (NextUInt() >> 11) * (1.0 / 2097152.0);
        }

        /// <summary>Uniform int in [minInclusive, maxExclusive). maxExclusive must be &gt; minInclusive.</summary>
        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;
            uint range = (uint)(maxExclusive - minInclusive);
            return minInclusive + (int)(NextUInt() % range);
        }

        public bool NextBool() => (NextUInt() & 1u) == 1u;

        /// <summary>Pick one element uniformly. Returns default(T) for empty arrays.</summary>
        public T Pick<T>(T[] array)
        {
            if (array == null || array.Length == 0) return default;
            return array[NextInt(0, array.Length)];
        }

        /// <summary>Derive a per-tick seed from a master seed + tick, e.g. hash(masterSeed, tick).</summary>
        public static ulong SeedForTick(ulong masterSeed, ulong tick)
        {
            return HashCombine(masterSeed, tick);
        }

        /// <summary>Derive a per-subsystem stream seed: hash(masterSeed, streamIndex).</summary>
        public static ulong SeedForStream(ulong masterSeed, uint streamIndex)
        {
            return HashCombine(masterSeed, streamIndex);
        }

        /// <summary>SplitMix64-style combine of two ulongs (order-sensitive).</summary>
        public static ulong HashCombine(ulong a, ulong b)
        {
            ulong z = a + 0x9E3779B97F4A7C15UL;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            z ^= z >> 31;
            z += b + 0x9E3779B97F4A7C15UL;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }

        static ulong SplitMix64(ref ulong x)
        {
            x += 0x9E3779B97F4A7C15UL;
            ulong z = x;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }

        static uint Rotl(uint x, int k) => (x << k) | (x >> (32 - k));
    }
}
