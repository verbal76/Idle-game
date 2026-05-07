using Boarder.Input;
using UnityEngine;

namespace Boarder.Scoring
{
    [CreateAssetMenu(menuName = "Boarder/TrickDictionary", fileName = "TrickDictionary")]
    public class TrickDictionary : ScriptableObject
    {
        [System.Serializable]
        public class Entry
        {
            public string trickId;
            public string displayName;
            public FlickGestureRecognizer.Direction direction;
            public int basePoints = 100;
        }

        public Entry[] entries;

        public Entry Resolve(FlickGestureRecognizer.Direction dir)
        {
            if (entries == null) return null;
            foreach (var e in entries) if (e.direction == dir) return e;
            return null;
        }
    }
}
