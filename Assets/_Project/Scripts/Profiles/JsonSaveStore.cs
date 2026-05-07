using System.IO;
using UnityEngine;

namespace Boarder.Profiles
{
    public class JsonSaveStore
    {
        readonly string _profilesDir;
        readonly string _indexPath;

        public JsonSaveStore()
        {
            var root = Application.persistentDataPath;
            _profilesDir = Path.Combine(root, "profiles");
            _indexPath = Path.Combine(root, "index.json");
            Directory.CreateDirectory(_profilesDir);
        }

        public ProfileIndex LoadIndex()
        {
            if (!File.Exists(_indexPath)) return new ProfileIndex();
            return JsonUtility.FromJson<ProfileIndex>(File.ReadAllText(_indexPath)) ?? new ProfileIndex();
        }

        public void SaveIndex(ProfileIndex index) => WriteAtomic(_indexPath, JsonUtility.ToJson(index, true));

        public SaveData LoadProfile(string id)
        {
            var path = ProfilePath(id);
            if (!File.Exists(path)) return null;
            return JsonUtility.FromJson<SaveData>(File.ReadAllText(path));
        }

        public void SaveProfile(SaveData data) => WriteAtomic(ProfilePath(data.id), JsonUtility.ToJson(data, true));

        public void DeleteProfile(string id)
        {
            var path = ProfilePath(id);
            if (File.Exists(path)) File.Delete(path);
        }

        string ProfilePath(string id) => Path.Combine(_profilesDir, $"{id}.json");

        static void WriteAtomic(string path, string contents)
        {
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, contents);
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }
    }
}
