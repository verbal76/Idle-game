using System;
using UnityEngine;

namespace Boarder.Scoring
{
    public class ScoreSystem : MonoBehaviour
    {
        public int Score { get; private set; }
        public int Combo { get; private set; }
        public event Action<int, int> Changed;

        public void AwardTrick(TrickDictionary.Entry trick, float strength)
        {
            Combo++;
            int points = Mathf.RoundToInt(trick.basePoints * (1f + Combo * 0.25f) * Mathf.Clamp(strength, 0.5f, 1.5f));
            Score += points;
            Changed?.Invoke(Score, Combo);
        }

        public void Bail()
        {
            Combo = 0;
            Changed?.Invoke(Score, Combo);
        }

        public void ResetRun()
        {
            Score = 0; Combo = 0;
            Changed?.Invoke(Score, Combo);
        }
    }
}
