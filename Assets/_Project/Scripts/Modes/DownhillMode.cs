using Boarder.World;
using UnityEngine;

namespace Boarder.Modes
{
    public class DownhillMode : MonoBehaviour, IRunMode
    {
        [SerializeField] ChunkStreamer _streamer;
        [SerializeField] DownhillGenerator _generator;

        public void Begin(ulong seed) => _streamer.Begin(_generator, seed);

        public void Tick(float dt)
        {
            // TODO: auto-steer rider toward open path, accrue currency per meter,
            //       apply tap-to-jump and right-stick flip-flick.
        }

        public void OnFell() { /* TODO: stop currency accrual */ }
        public void End() { /* TODO: bank distance + currency into profile */ }
    }
}
