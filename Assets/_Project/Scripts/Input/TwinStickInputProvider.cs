using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Boarder.Input
{
    public class TwinStickInputProvider : MonoBehaviour
    {
        [SerializeField] InputActionReference _leftStick;
        [SerializeField] InputActionReference _rightStick;
        [SerializeField] InputActionReference _pause;

        public Vector2 LeftStick { get; private set; }
        public Vector2 RightStick { get; private set; }
        public event Action PausePressed;

        void OnEnable()
        {
            _leftStick.action.Enable();
            _rightStick.action.Enable();
            _pause.action.Enable();
            _pause.action.performed += OnPause;
        }

        void OnDisable()
        {
            _pause.action.performed -= OnPause;
            _leftStick.action.Disable();
            _rightStick.action.Disable();
            _pause.action.Disable();
        }

        void Update()
        {
            LeftStick = _leftStick.action.ReadValue<Vector2>();
            RightStick = _rightStick.action.ReadValue<Vector2>();
        }

        void OnPause(InputAction.CallbackContext _) => PausePressed?.Invoke();
    }
}
