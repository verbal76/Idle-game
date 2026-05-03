using System;

namespace Boarder.Profiles
{
    public class ProfileService
    {
        readonly JsonSaveStore _store;
        ProfileIndex _index;
        SaveData _active;

        public SaveData Active => _active;
        public ProfileIndex Index => _index;

        public event Action<SaveData> ActiveChanged;

        public ProfileService(JsonSaveStore store) { _store = store; }

        public void LoadIndex()
        {
            _index = _store.LoadIndex();
            if (!string.IsNullOrEmpty(_index.activeProfileId))
                _active = _store.LoadProfile(_index.activeProfileId);
        }

        public SaveData Create(string name)
        {
            var data = new SaveData
            {
                id = Guid.NewGuid().ToString("N"),
                name = name,
                createdAtUtcTicks = DateTime.UtcNow.Ticks,
                lastPlayedUtcTicks = DateTime.UtcNow.Ticks,
            };
            _index.profiles.Add(new ProfileIndex.Entry { id = data.id, name = data.name });
            _store.SaveProfile(data);
            _store.SaveIndex(_index);
            return data;
        }

        public void Delete(string id)
        {
            _index.profiles.RemoveAll(p => p.id == id);
            if (_index.activeProfileId == id)
            {
                _index.activeProfileId = null;
                _active = null;
                ActiveChanged?.Invoke(null);
            }
            _store.DeleteProfile(id);
            _store.SaveIndex(_index);
        }

        public void SwitchTo(string id)
        {
            var data = _store.LoadProfile(id);
            if (data == null) throw new InvalidOperationException($"profile {id} missing");
            _active = data;
            _index.activeProfileId = id;
            _store.SaveIndex(_index);
            ActiveChanged?.Invoke(_active);
        }

        public void Save()
        {
            if (_active == null) return;
            _active.lastPlayedUtcTicks = DateTime.UtcNow.Ticks;
            _store.SaveProfile(_active);
        }
    }
}
