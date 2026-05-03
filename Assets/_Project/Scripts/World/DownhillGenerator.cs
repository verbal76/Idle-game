using UnityEngine;

namespace Boarder.World
{
    public class DownhillGenerator : MonoBehaviour, IChunkGenerator
    {
        [SerializeField] Chunk[] _slopePrefabs;
        [SerializeField] Transform _root;
        [SerializeField] float _slopeAngleDeg = 18f;

        Vector3 _cursor;
        float _difficulty;

        public Chunk Generate(int chunkIndex, ref SeedRng rng)
        {
            // TODO: scatter trees / rocks / kickers weighted by _difficulty
            //       once the chunk prefabs are imported.
            var prefab = _slopePrefabs[(int)(rng.NextUInt() % (uint)_slopePrefabs.Length)];
            var rot = Quaternion.Euler(_slopeAngleDeg, 0, 0);
            var chunk = Instantiate(prefab, _cursor, rot, _root);
            chunk.Index = chunkIndex;
            chunk.EntryPoint = _cursor;
            _cursor += rot * new Vector3(0, 0, prefab.LengthMeters);
            chunk.ExitPoint = _cursor;
            _difficulty = Mathf.Min(1f, _difficulty + 0.02f);
            return chunk;
        }

        public void Recycle(Chunk chunk) => Destroy(chunk.gameObject);
    }
}
