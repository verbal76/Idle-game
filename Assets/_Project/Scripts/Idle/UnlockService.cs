using Boarder.Profiles;

namespace Boarder.Idle
{
    public class UnlockService
    {
        readonly ProfileService _profiles;
        readonly CurrencyService _currency;

        public UnlockService(ProfileService profiles, CurrencyService currency)
        {
            _profiles = profiles;
            _currency = currency;
        }

        public bool IsUnlocked(string id)
        {
            var active = _profiles.Active;
            return active != null && active.unlocks.Contains(id);
        }

        public bool TryUnlock(string id, long cost)
        {
            if (IsUnlocked(id)) return true;
            if (!_currency.TrySpend(cost)) return false;
            _profiles.Active.unlocks.Add(id);
            return true;
        }
    }
}
