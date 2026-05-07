using Boarder.Profiles;

namespace Boarder.Idle
{
    public class CurrencyService
    {
        readonly ProfileService _profiles;

        public CurrencyService(ProfileService profiles) { _profiles = profiles; }

        public long Total => _profiles.Active?.currency ?? 0;

        public void Add(long amount)
        {
            if (_profiles.Active == null) return;
            _profiles.Active.currency += amount;
        }

        public bool TrySpend(long amount)
        {
            var active = _profiles.Active;
            if (active == null || active.currency < amount) return false;
            active.currency -= amount;
            return true;
        }
    }
}
