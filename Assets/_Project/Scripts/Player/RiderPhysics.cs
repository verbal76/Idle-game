using UnityEngine;

namespace Boarder.Player
{
    public class RiderPhysics : MonoBehaviour
    {
        [SerializeField] Rigidbody _rb;
        [SerializeField] float _suspensionDistance = 0.5f;
        [SerializeField] float _steerStrength = 8f;

        public bool Grounded { get; private set; }
        public Vector3 GroundNormal { get; private set; } = Vector3.up;

        public void Steer(Vector2 stick)
        {
            if (_rb == null) return;
            // TODO: project steer onto ground tangent and apply edge bias.
            _rb.AddTorque(transform.up * (stick.x * _steerStrength), ForceMode.Acceleration);
        }

        void FixedUpdate()
        {
            var origin = transform.position + Vector3.up * 0.1f;
            if (Physics.Raycast(origin, Vector3.down, out var hit, _suspensionDistance + 0.1f))
            {
                Grounded = true;
                GroundNormal = hit.normal;
            }
            else Grounded = false;
        }
    }
}
