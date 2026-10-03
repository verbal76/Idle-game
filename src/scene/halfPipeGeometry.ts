// Half-pipe cross-section, in metres. The pipe is flat for FLAT_HALF
// either side of the centreline, then a quarter-circle transition of
// PIPE_RADIUS up to the lip at PIPE_HALF.
export const HP = {
  PIPE_HALF: 12.0,
  FLAT_HALF: 6.0,
  PIPE_RADIUS: 6.0,   // = PIPE_HALF - FLAT_HALF
  LIP_HEIGHT: 0.8,
  CONTEXT_WIDTH: 220,
  // Lamp poles sit just outside the lip so they never clip the rider.
  POLE_HEIGHT: 5.0,
  POLE_OFFSET: 1.5,
} as const;
