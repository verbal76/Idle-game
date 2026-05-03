using UnityEngine;

namespace Boarder.World
{
    public interface IChunkGenerator
    {
        Chunk Generate(int chunkIndex, ref SeedRng rng);
        void Recycle(Chunk chunk);
    }

    public class Chunk : MonoBehaviour
    {
        public int Index;
        public Vector3 EntryPoint;
        public Vector3 ExitPoint;
        public float LengthMeters;
    }
}
