using System;
using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Boarder.Core
{
    public class SceneRouter : MonoBehaviour
    {
        public const string MainMenu = "10_MainMenu";
        public const string RunHalfPipe = "20_Run_HalfPipe";
        public const string RunDownhill = "21_Run_Downhill";

        public void Go(string sceneName, Action onLoaded = null) => StartCoroutine(LoadAsync(sceneName, onLoaded));

        IEnumerator LoadAsync(string sceneName, Action onLoaded)
        {
            var op = SceneManager.LoadSceneAsync(sceneName);
            while (!op.isDone) yield return null;
            onLoaded?.Invoke();
        }
    }
}
