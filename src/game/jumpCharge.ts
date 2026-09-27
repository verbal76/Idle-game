// Hold-to-charge jump with a release gate. Each jump needs its own
// fresh press: after landing (or a bail) the button must be released
// before charging can start again, so holding JUMP through the air
// can't auto-relaunch the rider on touchdown ("rubber bounce").

export interface JumpChargeState {
  charge: number;          // 0..1
  releaseRequired: boolean;
}

/**
 * Advances one grounded frame. Returns the charge to launch with
 * (0..1] on the release frame, or null when no jump fires.
 */
export function stepJumpCharge(
  s: JumpChargeState,
  held: boolean,
  dt: number,
  rate: number,
): number | null {
  if (held) {
    if (!s.releaseRequired) s.charge = Math.min(1, s.charge + dt * rate);
    return null;
  }
  s.releaseRequired = false;
  if (s.charge <= 0) return null;
  const launch = s.charge;
  s.charge = 0;
  return launch;
}
