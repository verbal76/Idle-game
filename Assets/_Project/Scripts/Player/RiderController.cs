using Boarder.Input;
using UnityEngine;

namespace Boarder.Player
{
    public class RiderController : MonoBehaviour
    {
        public enum State { OnGround, Airborne, Grinding, Wiping }

        [SerializeField] TwinStickInputProvider _input;
        [SerializeField] RiderPhysics _physics;

        public State Current { get; private set; } = State.OnGround;

        void Update()
        {
            if (_input == null || _physics == null) return;
            _physics.Steer(_input.LeftStick);
            Current = _physics.Grounded ? State.OnGround : State.Airborne;
        }

        public void EnterWipe() { Current = State.Wiping; }
    }
}
