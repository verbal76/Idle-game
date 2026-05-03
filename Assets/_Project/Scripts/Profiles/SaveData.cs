using System;
using System.Collections.Generic;

namespace Boarder.Profiles
{
    [Serializable]
    public class SaveData
    {
        public string id;
        public string name;
        public long createdAtUtcTicks;
        public long lastPlayedUtcTicks;

        public long currency;
        public List<string> unlocks = new();
        public string equippedCharacter;
        public string equippedBoard;

        public int bestHalfPipeScore;
        public float longestDownhillMeters;

        public Settings settings = new();

        [Serializable]
        public class Settings
        {
            public float musicVolume = 0.7f;
            public float sfxVolume = 1f;
            public bool invertRightStick = false;
        }
    }

    [Serializable]
    public class ProfileIndex
    {
        public string activeProfileId;
        public List<Entry> profiles = new();

        [Serializable]
        public class Entry
        {
            public string id;
            public string name;
        }
    }
}
