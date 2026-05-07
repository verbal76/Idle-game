using System;

namespace Boarder.Idle
{
    /// <summary>
    /// v1 stub. The downhill mode is the idle layer; once auto-runs are wired
    /// up we'll record the timestamp at app pause and award currency on resume
    /// based on elapsed time and the player's current downhill rate.
    /// </summary>
    public interface IOfflineAccrual
    {
        void RecordPaused(DateTime utc);
        long ResumeAndAccrue(DateTime utc);
    }
}
