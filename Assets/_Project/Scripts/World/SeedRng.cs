namespace Boarder.World
{
    /// <summary>
    /// Tiny xorshift64 RNG. Deterministic per-seed so a run can be replayed
    /// or shared just by stashing the seed.
    /// </summary>
    public struct SeedRng
    {
        ulong _state;

        public SeedRng(ulong seed)
        {
            _state = seed == 0 ? 0x9E3779B97F4A7C15UL : seed;
        }

        public uint NextUInt()
        {
            _state ^= _state << 13;
            _state ^= _state >> 7;
            _state ^= _state << 17;
            return (uint)_state;
        }

        public int RangeInt(int minInclusive, int maxExclusive)
        {
            var span = (uint)(maxExclusive - minInclusive);
            return minInclusive + (int)(NextUInt() % span);
        }

        public float RangeFloat(float min, float max) => min + (NextUInt() / (float)uint.MaxValue) * (max - min);
        public float Next01() => NextUInt() / (float)uint.MaxValue;
    }
}
