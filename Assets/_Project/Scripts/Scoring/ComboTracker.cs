using UnityEngine;

namespace Boarder.Scoring
{
    public class ComboTracker : MonoBehaviour
    {
        [SerializeField] ScoreSystem _score;
        [SerializeField] float _comboDecaySeconds = 3f;

        float _lastTrickTime = -999f;

        public void Touch() => _lastTrickTime = Time.time;

        void Update()
        {
            if (_score == null) return;
            if (_score.Combo > 0 && Time.time - _lastTrickTime > _comboDecaySeconds)
            {
                _score.Bail();
            }
        }
    }
}
