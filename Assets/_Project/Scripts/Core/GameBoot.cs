using Boarder.Profiles;
using UnityEngine;

namespace Boarder.Core
{
    public class GameBoot : MonoBehaviour
    {
        [SerializeField] SceneRouter _router;

        void Awake()
        {
            DontDestroyOnLoad(gameObject);
            Application.targetFrameRate = 60;

            ServiceLocator.Register(_router);

            var store = new JsonSaveStore();
            var profiles = new ProfileService(store);
            profiles.LoadIndex();
            ServiceLocator.Register(profiles);
        }

        void Start() => _router.Go(SceneRouter.MainMenu);

        void OnApplicationPause(bool paused)
        {
            if (paused && ServiceLocator.TryGet<ProfileService>(out var p)) p.Save();
        }

        void OnApplicationQuit()
        {
            if (ServiceLocator.TryGet<ProfileService>(out var p)) p.Save();
        }
    }
}
