using UnityEngine;

namespace Boarder.Player
{
    public class RagdollOnFall : MonoBehaviour
    {
        [SerializeField] Rigidbody[] _ragdollBodies;
        [SerializeField] Animator _animator;

        public void Engage()
        {
            if (_animator) _animator.enabled = false;
            foreach (var rb in _ragdollBodies) if (rb) rb.isKinematic = false;
        }

        public void Restore()
        {
            if (_animator) _animator.enabled = true;
            foreach (var rb in _ragdollBodies) if (rb) rb.isKinematic = true;
        }
    }
}
