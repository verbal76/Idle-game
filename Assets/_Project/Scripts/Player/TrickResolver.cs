using Boarder.Input;
using Boarder.Scoring;
using UnityEngine;

namespace Boarder.Player
{
    public class TrickResolver : MonoBehaviour
    {
        [SerializeField] FlickGestureRecognizer _flick;
        [SerializeField] RiderController _rider;
        [SerializeField] TrickDictionary _dict;
        [SerializeField] ScoreSystem _score;

        void OnEnable() { if (_flick != null) _flick.Flicked += OnFlick; }
        void OnDisable() { if (_flick != null) _flick.Flicked -= OnFlick; }

        void OnFlick(FlickGestureRecognizer.Direction dir, float strength)
        {
            if (_rider == null || _dict == null || _score == null) return;
            if (_rider.Current != RiderController.State.Airborne) return;
            var trick = _dict.Resolve(dir);
            if (trick == null) return;
            _score.AwardTrick(trick, strength);
            // TODO: trigger animator + spin physics on the rider rig.
        }
    }
}
