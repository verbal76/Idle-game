using Boarder.World;
using UnityEngine;

namespace Boarder.Modes
{
    public class HalfPipeMode : MonoBehaviour, IRunMode
    {
        [SerializeField] ChunkStreamer _streamer;
        [SerializeField] HalfPipeGenerator _generator;

        public void Begin(ulong seed) => _streamer.Begin(_generator, seed);
        public void Tick(float dt) { /* TODO: airtime / scoring tick */ }
        public void OnFell() { /* TODO: bail current combo */ }
        public void End() { /* TODO: bank score into profile */ }
    }
}
