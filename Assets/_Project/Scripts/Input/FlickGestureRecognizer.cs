using System;
using UnityEngine;

namespace Boarder.Input
{
    public class FlickGestureRecognizer : MonoBehaviour
    {
        public enum Direction { N, NE, E, SE, S, SW, W, NW }

        [SerializeField] TwinStickInputProvider _input;
        [SerializeField, Range(0.3f, 1f)] float _flickThreshold = 0.7f;
        [SerializeField, Range(0f, 0.6f)] float _resetThreshold = 0.2f;

        bool _armed = true;
        public event Action<Direction, float> Flicked;

        void Update()
        {
            if (_input == null) return;
            var v = _input.RightStick;
            var mag = v.magnitude;
            if (_armed && mag >= _flickThreshold)
            {
                Flicked?.Invoke(Bucket(v), mag);
                _armed = false;
            }
            else if (!_armed && mag < _resetThreshold)
            {
                _armed = true;
            }
        }

        static Direction Bucket(Vector2 v)
        {
            var angle = Mathf.Atan2(v.y, v.x) * Mathf.Rad2Deg;
            if (angle < 0) angle += 360f;
            int slot = Mathf.RoundToInt(angle / 45f) % 8;
            return slot switch
            {
                0 => Direction.E,
                1 => Direction.NE,
                2 => Direction.N,
                3 => Direction.NW,
                4 => Direction.W,
                5 => Direction.SW,
                6 => Direction.S,
                7 => Direction.SE,
                _ => Direction.E,
            };
        }
    }
}
