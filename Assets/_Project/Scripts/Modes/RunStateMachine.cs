using System;
using UnityEngine;

namespace Boarder.Modes
{
    public class RunStateMachine : MonoBehaviour
    {
        public enum State { Intro, Running, Paused, Falling, Summary }

        public State Current { get; private set; } = State.Intro;
        public event Action<State> StateChanged;

        IRunMode _mode;

        public void Bind(IRunMode mode) { _mode = mode; }

        public void Begin(ulong seed)
        {
            _mode.Begin(seed);
            Set(State.Running);
        }

        public void Pause()
        {
            if (Current != State.Running) return;
            Time.timeScale = 0f;
            Set(State.Paused);
        }

        public void Resume()
        {
            if (Current != State.Paused) return;
            Time.timeScale = 1f;
            Set(State.Running);
        }

        public void ReportFall()
        {
            if (Current != State.Running) return;
            _mode.OnFell();
            Set(State.Falling);
        }

        public void ShowSummary()
        {
            if (Current != State.Falling) return;
            _mode.End();
            Set(State.Summary);
        }

        void Update()
        {
            if (Current == State.Running && _mode != null) _mode.Tick(Time.deltaTime);
        }

        void Set(State s) { Current = s; StateChanged?.Invoke(s); }
    }
}
