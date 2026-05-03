using UnityEngine;

namespace Boarder.World
{
    public class HalfPipeGenerator : MonoBehaviour, IChunkGenerator
    {
        [SerializeField] Chunk[] _segmentPrefabs;
        [SerializeField] Transform _root;

        Vector3 _cursor;

        public Chunk Generate(int chunkIndex, ref SeedRng rng)
        {
            // TODO: weighted segment selection (straight / transition / kicker / gap)
            //       and stitching along an authored half-pipe spline.
            var prefab = _segmentPrefabs[(int)(rng.NextUInt() % (uint)_segmentPrefabs.Length)];
            var chunk = Instantiate(prefab, _cursor, Quaternion.identity, _root);
            chunk.Index = chunkIndex;
            chunk.EntryPoint = _cursor;
            _cursor += new Vector3(0, 0, prefab.LengthMeters);
            chunk.ExitPoint = _cursor;
            return chunk;
        }

        public void Recycle(Chunk chunk) => Destroy(chunk.gameObject);
    }
}
