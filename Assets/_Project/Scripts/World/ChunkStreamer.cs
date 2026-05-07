using System.Collections.Generic;
using UnityEngine;

namespace Boarder.World
{
    public class ChunkStreamer : MonoBehaviour
    {
        [SerializeField] Transform _follow;
        [SerializeField] int _chunksAhead = 4;
        [SerializeField] int _chunksBehind = 1;
        [SerializeField] float _recycleDistance = 50f;

        readonly Queue<Chunk> _live = new();
        IChunkGenerator _generator;
        SeedRng _rng;
        int _nextIndex;

        public void Begin(IChunkGenerator generator, ulong seed)
        {
            _generator = generator;
            _rng = new SeedRng(seed);
            _nextIndex = 0;
            _live.Clear();
            for (int i = 0; i < _chunksAhead; i++) Spawn();
        }

        void Update()
        {
            if (_generator == null || _follow == null) return;
            while (_live.Count > 0 && _follow.position.z - _live.Peek().ExitPoint.z > _chunksBehind * _recycleDistance)
            {
                _generator.Recycle(_live.Dequeue());
            }
            if (_live.Count < _chunksAhead) Spawn();
        }

        void Spawn()
        {
            var chunk = _generator.Generate(_nextIndex++, ref _rng);
            _live.Enqueue(chunk);
        }
    }
}
