import {
  Engine, Scene, FollowCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, MeshBuilder, Mesh, ParticleSystem, TrailMesh, TransformNode,
} from '@babylonjs/core';
import type { StickValue } from '../input/ArrowPadInput';
import type { UpgradeLevels } from '../profiles/IndexedDbStore';
import { soundFx } from '../audio/SoundFx';
import { buildRider, RiderRig } from './Rider';
import { SeedRng } from '../world/SeedRng';
import { stepJumpCharge } from '../game/jumpCharge';
import { addFlakes, displayFlakes, distanceSegments, DISTANCE_PAY } from '../game/economy';
import type { RunStats } from '../game/records';
import { segmentHitsCircle, segmentHitsRect } from '../game/collision';
import { judgeLanding, type LandingOutcome } from '../game/tricks';
import { BASE_MAX_LEAN, DEEP_CARVE_RESPONSE, leanLimit, physicalLeanLimit } from '../game/carve';
import type { SceneAssets } from './SceneAssets';
import type { Stage } from './Stage';
import { Terrain, type GameMode } from './Terrain';
import { ChunkStreamer } from './ChunkStreamer';
import { HP } from './halfPipeGeometry';
import { buildBackgroundMountains, buildSky, buildSnowDust, buildSnowTrail, spawnRingFlicker } from './environment';

export type { GameMode } from './Terrain';

export interface GameInput {
  leftStick(): StickValue;
  jumpHeld(): boolean;
  flipHeld(): boolean;
  forwardHeld?(): boolean;
}

export interface GameCallbacks {
  onScore?: (label: string) => void;
  onFell?: (stats: { distanceMeters: number; flips: number; spins: number; coins: number }) => void;
  // Jump charge 0..1, reported only when it moves by ≥1%.
  onChargeChange?: (charge: number) => void;
  // count = 0 hides the combo meter.
  onComboChange?: (count: number, multiplier: number) => void;
  onRingStreak?: (streak: number, best: number) => void;
  // The run-ending hit, fired immediately (onFell follows after 700 ms).
  onCrash?: () => void;
  // Every non-bail landing that did something: a trick (with its payout
  // after combo and Flake Bonus) or a sketchy landing.
  onTrick?: (t: { name: string; payout: number; comboMult: number; outcome: LandingOutcome; switch: boolean }) => void;
}

export interface GameOptions {
  // The profile's best half-pipe ring streak, shown as "best N" on the HUD.
  bestRingStreak?: number;
}

type RiderState = 'normal' | 'bailing' | 'recovering';

/**
 * One run on the shared Stage: the rider physics loop, tricks, scoring
 * and interactions. World building is delegated to Terrain,
 * ChunkStreamer, SceneAssets and the environment helpers.
 */
export class Game {
  private engine: Engine;
  private scene: Scene;
  private rider!: RiderRig;
  private mode: GameMode;
  private upgrades: UpgradeLevels;
  private assets: SceneAssets;
  private readonly beforeRender = () => this.clampCameraAboveGround();
  private terrain!: Terrain;
  private streamer!: ChunkStreamer;

  // Combo: chained clean landings within COMBO_TIMEOUT_MS raise the
  // payout multiplier ×1.0 → ×3.0 (5+ chain); a bail resets it.
  private comboCount = 0;
  private lastTrickAt = 0;
  private readonly COMBO_TIMEOUT_MS = 5000;
  private boostUntil = 0;
  // Ring streak resets when a ring is passed without being collected.
  private ringStreak = 0;
  private bestRingStreak = 0;
  // Per-run tallies for records (see game/records.ts).
  private ringsCollected = 0;
  private runBestRingStreak = 0;
  private runBestCombo = 0;
  // Throttles the boost whoosh to the rising edge of each activation.
  private boostSoundPlayingUntil = 0;
  // Grounded heading is clamped to ±80°: cos²(80°) ≈ 3% target speed, a
  // hard scrub rather than a dead stop. Air spin is unclamped.
  private readonly HEADING_MAX =  80 * Math.PI / 180;
  private readonly HEADING_MIN = -80 * Math.PI / 180;

  private speed = 0;
  private verticalVelocity = 0;
  private grounded = true;
  // Cliff detection: a frame-to-frame surface drop above CLIFF_STEP_M
  // means the rider rode off a lip and should fall, not snap down.
  private prevGroundLevel: number | null = null;
  // The wall/floor seam can step several metres without being a cliff.
  private prevWasOnWall = false;
  // Skip cliff detection on the frame after landing, so landing just
  // short of a lip doesn't pop the rider back into the air.
  private justLanded = false;
  private readonly CLIFF_STEP_M = 1.0;
  // Persisted so wall gravity accumulates into a real return velocity.
  private wallReturnVel = 0;
  private jumpCharge = 0;
  // See game/jumpCharge.ts: every jump needs a fresh press.
  private jumpReleaseRequired = false;
  private lastReportedCharge = 0;
  private lastScoreLabel = '';
  private stepFromX = 0;
  private stepFromZ = 0;
  private flipRotation = 0;
  private flipsLanded = 0;
  private spinRotation = 0;
  private spinsLanded = 0;
  private coinsCollected = 0;
  // Downhill 50 m segments already paid for (see game/economy.ts).
  private distanceSegmentsPaid = 0;
  // Bank at run start; the HUD shows bank + this run's earnings live.
  private bankAtStart = 0;
  private fellAlready = false;
  // Cleared on dispose so a quick quit can't paint the fell overlay
  // over the next session.
  private fallTimeout: ReturnType<typeof setTimeout> | null = null;

  private landingSquatUntil = 0;
  // Every 3–7 s the rider does a small idle gesture (arm sway/flick,
  // squat, waist flex) with a sin-bell envelope so it reads as alive.
  private idleEventStart = 0;
  private idleEventEnd = 0;
  private idleEventKind = 0;
  private idleEventAmp = 0;
  private readonly SQUAT_MS = 380;
  // Landing/bail impact: dust plume + camera dip sized by impact speed.
  private impactBurstUntil = 0;
  private impactBurstY = 0;
  private readonly BURST_MS = 180;
  private readonly BURST_EMIT = 800;

  // Rising edge of UP gives an instant lean kick.
  private prevForwardHeld = false;

  private heading = 0;
  // In the air the board spins freely while the flight path keeps its
  // take-off direction; on the ground both are `heading`.
  private travelHeading = 0;
  // π while riding switch (backward), easing back to 0 when the rider
  // turns around after SWITCH_MS.
  private bodyYawOffset = 0;
  private switchUntil = 0;
  private readonly SWITCH_MS = 1500;
  private wobbleUntil = 0;
  private edgeAngle = 0;
  private idleTime = 0;
  private readonly autoCenterAfter = 1.0;   // s of no steering before drifting back to the fall line
  private readonly autoCenterRate = 4.0;
  // Carve radius R = SIDECUT·cos(edge); ω = V/R·sin(edge).
  private readonly SIDECUT = 5.0;
  private readonly G = 9.81;

  private state: RiderState = 'normal';
  private stateEndsAt = 0;
  // A bail costs 1.5 s down + 1.5 s flickering recovery.
  private readonly bailDurationMs = 1500;
  private readonly recoverDurationMs = 1500;

  private dustParticles!: ParticleSystem;
  private trail!: TrailMesh;
  private trailAnchor?: TransformNode;
  private mountainAnchor!: TransformNode;
  private followTarget!: Mesh;
  private camera!: FollowCamera;

  // Terrain, chunks and idle animation each get their own stream so the
  // world never depends on how gameplay or spawning interleave.
  private readonly runSeed = BigInt(Date.now());
  private rng = new SeedRng(this.runSeed ^ 0x5DEECE66Dn);

  // The rider root pivots at the board base, 5 cm above the snow.
  private readonly groundY = 0.05;
  // The HUD altitude reads as a descent from a nominal 5 km peak.
  private readonly peakAltitude = 5000;
  private readonly gravity = 9.81;
  private readonly jumpMin = 4.0;
  private readonly jumpMax = 8.0;
  private readonly chargeRate = 1.4;
  private readonly flipRate = 6.5;
  private readonly airSpinRate = 5.0;

  private readonly maxLean = BASE_MAX_LEAN;
  private readonly leanResponse = 6.5;  // ~150 ms to mostly leaned
  private readonly speedCatch = 4.0;

  private running = false;
  // Gameplay time in ms. Advances by the physics step only while the run
  // is running, so pausing freezes bails, combos, boosts and animations.
  private clock = 0;

  constructor(
    private readonly stage: Stage,
    mode: GameMode,
    private readonly input: GameInput,
    private readonly callbacks: GameCallbacks = {},
    upgrades: UpgradeLevels = { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, coin: 0 },
    options: GameOptions = {},
  ) {
    this.mode = mode;
    this.upgrades = upgrades;
    this.bestRingStreak = options.bestRingStreak ?? 0;

    // Deferred so the HUD is mounted before it fires.
    setTimeout(() => this.callbacks.onRingStreak?.(0, this.bestRingStreak), 0);

    this.engine = stage.engine;
    this.scene = stage.scene;
    this.assets = stage.assets;

    // Warm dusk lighting, balanced with the snow material so the
    // brightest pixel stays below white. The pipe walls block the sun,
    // so the half-pipe gets more hemispheric fill.
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = (mode === 'half-pipe') ? 0.65 : 0.40;
    hemi.diffuse    = new Color3(0.78, 0.72, 0.85);
    hemi.groundColor = new Color3(0.45, 0.30, 0.40);
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -0.85, -0.25), this.scene);
    sun.intensity = 0.75;
    sun.diffuse  = new Color3(1.00, 0.78, 0.58);
    sun.specular = new Color3(0.30, 0.25, 0.20);

    this.rider = buildRider(this.scene);
    this.terrain = new Terrain(this.scene, this.mode, new SeedRng(this.runSeed), this.assets);
    this.streamer = new ChunkStreamer(this.scene, this.mode, this.runSeed, this.assets, this.terrain);

    this.mountainAnchor = buildBackgroundMountains(this.scene, this.assets.mountainMat);
    // Downhill only (the pipe is built per chunk). Build before the
    // spawn-height lookup so it hits a real segment.
    if (this.mode !== 'half-pipe') this.terrain.extendAhead(this.terrain.aheadMargin);
    this.rider.root.position.set(0, this.groundY + this.terrain.surfaceY(0, 0) + this.terrain.pipeOffsetY(0), 0);
    buildSky(this.scene, this.mountainAnchor);
    this.buildCamera();
    this.dustParticles = buildSnowDust(this.scene, this.followTarget);
    const snowTrail = buildSnowTrail(this.scene);
    this.trailAnchor = snowTrail.anchor;
    this.trail = snowTrail.trail;
    this.streamer.update(this.rider.root.position);

    this.engine.runRenderLoop(() => this.tick());
  }

  start(): void {
    this.running = true;
    // Refresh world matrices so the trail/dust sample valid positions
    // on their first frame.
    this.rider.root.computeWorldMatrix(true);
    this.rider.board.computeWorldMatrix(true);
    if (this.trail) this.trail.start();
  }
  pause(): void { this.running = false; }
  resume(): void { if (!this.fellAlready) this.running = true; }
  /** Called after the player spends in the pause-menu shop. */
  setBankSnapshot(bank: number): void { this.bankAtStart = bank; }

  /** Live stats, so any exit (fall, quit, switch) credits the run. */
  getRunStats(): RunStats {
    return {
      mode: this.mode,
      distanceMeters: Math.max(0, Math.floor(this.rider.root.position.z)),
      flips: this.flipsLanded,
      spins: this.spinsLanded,
      coins: this.coinsCollected,
      rings: this.ringsCollected,
      bestCombo: this.runBestCombo,
      bestRingStreak: this.runBestRingStreak,
    };
  }

  /** Ends the run and returns the shared stage to its template baseline. */
  dispose(): void {
    if (this.fallTimeout !== null) {
      clearTimeout(this.fallTimeout);
      this.fallTimeout = null;
    }
    this.scene.unregisterBeforeRender(this.beforeRender);
    this.stage.clearRun();
  }

  // Upgrade effects (20 levels each): speed +0.5 m/s, jump +5%, edge grip
  // +3% lean / +5% response, charge +5%, air control +4% spin & flip,
  // flake bonus +5% payout.
  private get maxSpeed(): number { return 22 + this.upgrades.speed * 0.5; }
  private get jumpMaxScaled(): number { return this.jumpMax * (1 + this.upgrades.jump * 0.05); }
  private get maxLeanScaled(): number {
    return this.maxLean * (1 + (this.upgrades.turn ?? 0) * 0.03);
  }
  private get leanResponseScaled(): number {
    return this.leanResponse * (1 + (this.upgrades.turn ?? 0) * 0.05);
  }
  private get chargeRateScaled(): number {
    return this.chargeRate * (1 + (this.upgrades.charge ?? 0) * 0.05);
  }
  private get airSpinRateScaled(): number {
    return this.airSpinRate * (1 + (this.upgrades.spin ?? 0) * 0.04);
  }
  private get flipRateScaled(): number {
    return this.flipRate * (1 + (this.upgrades.spin ?? 0) * 0.04);
  }
  private get coinMultiplier(): number {
    return 1 + (this.upgrades.coin ?? 0) * 0.05;
  }

  private buildCamera(): void {
    const follow = MeshBuilder.CreateBox('follow-target', { size: 0.001 }, this.scene);
    follow.isVisible = false;
    this.followTarget = follow;
    // Start the follow target (and camera) at the rider so frame 1 isn't
    // a lerp from the origin.
    follow.position.copyFrom(this.rider.root.position);

    const rp = this.rider.root.position;
    const cam = new FollowCamera('cam',
      new Vector3(rp.x, rp.y + 6.5, rp.z - 13),
      this.scene, follow);
    cam.heightOffset = 6.5;
    cam.radius = 13;
    cam.rotationOffset = 180;
    // Snap into place for the first ~120 ms, then smooth follow.
    cam.cameraAcceleration = 1.0;
    cam.maxCameraSpeed = 100;
    this.camera = cam;
    this.scene.activeCamera = cam;
    setTimeout(() => { cam.cameraAcceleration = 0.20; }, 120);

    this.scene.registerBeforeRender(this.beforeRender);
  }

  // Keeps the trailing camera above the terrain under both itself and the
  // rider (it can be behind a cliff lip the rider already dropped off),
  // widens FOV with speed, and dips on impacts.
  private clampCameraAboveGround(): void {
    if (!this.camera) return;
    const cp = this.camera.position;
    const cs = this.groundY + this.terrain.surfaceY(cp.x, cp.z) + this.terrain.pipeOffsetY(cp.x);
    const rp = this.rider.root.position;
    const rs = this.groundY + this.terrain.surfaceY(rp.x, rp.z) + this.terrain.pipeOffsetY(rp.x);
    const floor = Math.max(cs, rs);
    const margin = 2.5;
    if (cp.y < floor + margin) {
      cp.y = floor + margin;
    }

    const speedFrac = Math.min(1, this.speed / this.maxSpeed);
    const baseFov = 0.80;
    const fovBreathe = baseFov + 0.12 * speedFrac;
    const baseHeight = 6.5;
    let dipHeight = baseHeight;
    const now = this.clock;
    if (now < this.impactBurstUntil) {
      const remaining = this.impactBurstUntil - now;
      const t = remaining / this.BURST_MS;
      const scale = Math.min(1, this.impactBurstY / 12);
      dipHeight = baseHeight - 0.6 * t * scale;
    }
    this.camera.fov = fovBreathe;
    this.camera.heightOffset = dipHeight;
  }

  private setRiderVisible(v: boolean): void {
    for (const p of this.rider.parts) p.isVisible = v;
  }

  private comboMultiplier(): number {
    if (this.comboCount <= 0) return 1;
    return 1 + Math.min(this.comboCount - 1, 4) * 0.5;
  }

  // Bail: rider lies on their side and slides to a stop, combo resets.
  private startBail(): void {
    this.state = 'bailing';
    this.stateEndsAt = this.clock + this.bailDurationMs;
    if (this.comboCount > 0) {
      this.comboCount = 0;
      this.callbacks.onComboChange?.(0, 1);
    }
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = Math.PI / 2;
    this.rider.lean.rotation.z = 0;
    this.rider.waist.rotation.z = 0;
    this.rider.head.rotation.y = 0;
    this.rider.leftArm.rotation.z = 0;
    this.rider.rightArm.rotation.z = 0;
    this.flipRotation = 0;
    this.spinRotation = 0;
    this.edgeAngle = 0;
    this.idleTime = 0;
    this.verticalVelocity = 0;
    this.jumpCharge = 0;
    this.jumpReleaseRequired = true;
  }

  private startRecovery(): void {
    this.state = 'recovering';
    this.stateEndsAt = this.clock + this.recoverDurationMs;
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = 0;
    this.rider.lean.rotation.z = 0;
    this.rider.waist.rotation.z = 0;
    this.rider.head.rotation.y = 0;
    this.rider.leftArm.rotation.z = 0;
    this.rider.rightArm.rotation.z = 0;
    this.edgeAngle = 0;
    this.heading = 0;
    this.travelHeading = 0;
    this.bodyYawOffset = 0;
    this.rider.heading.rotation.y = 0;
    // Recovery restarts facing downhill at 40% speed, flickering and
    // invulnerable until it ends.
    this.speed = this.maxSpeed * 0.4;
  }

  private exitRecovery(): void {
    this.state = 'normal';
    this.setRiderVisible(true);
  }

  private tick(): void {
    if (!this.running) { this.scene.render(); return; }
    const dt = Math.min(0.05, this.engine.getDeltaTime() / 1000);
    this.clock += dt * 1000;
    const now = this.clock;
    // Where this frame's movement starts, for swept collision checks.
    this.stepFromX = this.rider.root.position.x;
    this.stepFromZ = this.rider.root.position.z;

    if (this.state === 'bailing' && now >= this.stateEndsAt) this.startRecovery();
    else if (this.state === 'recovering' && now >= this.stateEndsAt) this.exitRecovery();

    if (this.state === 'recovering') {
      const phase = Math.floor((now - (this.stateEndsAt - this.recoverDurationMs)) / 80) % 2;
      this.setRiderVisible(phase === 0);
    }

    this.followTarget.position.copyFrom(this.rider.root.position);
    this.mountainAnchor.position.copyFrom(this.rider.root.position);

    if (this.state === 'bailing') {
      this.speed *= Math.max(0, 1 - 1.2 * dt);
      this.rider.root.position.z += this.speed * dt;

      const newGround = this.groundY
        + this.terrain.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.terrain.pipeOffsetY(this.rider.root.position.x);

      // A bailed rider sliding off a cliff falls rather than snapping down
      // (the camera would otherwise chase them through the cliff face).
      const droppedOffCliff = !this.justLanded
        && this.prevGroundLevel !== null
        && (this.prevGroundLevel - newGround) > this.CLIFF_STEP_M;
      if (droppedOffCliff) this.verticalVelocity = 0;

      const aboveGround = this.rider.root.position.y - newGround > 0.05;
      if (aboveGround || droppedOffCliff) {
        this.verticalVelocity -= this.gravity * dt;
        this.rider.root.position.y += this.verticalVelocity * dt;
        if (this.rider.root.position.y < newGround) {
          this.rider.root.position.y = newGround;
          this.verticalVelocity = 0;
        }
      } else {
        this.rider.root.position.y = newGround;
        this.verticalVelocity = 0;
      }
      this.prevGroundLevel = newGround;

      this.dustParticles.emitRate = 100;
      this.streamer.update(this.rider.root.position);
      this.scene.render();
      return;
    }

    const stickX = this.input.leftStick().x;
    const stickActive = Math.abs(stickX) > 0.05;
    this.idleTime = stickActive ? 0 : this.idleTime + dt;

    // Carving uses a minimum reference speed so a stopped rider can still
    // pivot out of a side-slip.
    const carveV = Math.max(8.0, this.speed);

    const physThetaMax = physicalLeanLimit(carveV, this.SIDECUT, this.G);
    // UP = deep carve: lean cap ~42% above the current normal cap (see
    // game/carve.ts), much faster lean response, and an instant kick on
    // the rising edge.
    const forwardBoost = this.input.forwardHeld?.() ?? false;
    const forwardBoostJustPressed = forwardBoost && !this.prevForwardHeld;
    this.prevForwardHeld = forwardBoost;
    const thetaMax = leanLimit(this.maxLeanScaled, physThetaMax, forwardBoost);
    const targetEdge = stickX * thetaMax;
    const baseLeanRate = forwardBoost ? this.leanResponseScaled * DEEP_CARVE_RESPONSE : this.leanResponseScaled;
    const leanRate = stickActive ? baseLeanRate : baseLeanRate * 0.35;
    if (forwardBoostJustPressed && stickActive) {
      this.edgeAngle += (targetEdge - this.edgeAngle) * 0.6;
    }
    this.edgeAngle += (targetEdge - this.edgeAngle) * Math.min(1, leanRate * dt);

    if (this.grounded) {
      // Turn rate ∝ sin(edge), so it tapers to zero as the board flattens.
      const R = this.SIDECUT * Math.cos(Math.abs(this.edgeAngle));
      const omega = (carveV / R) * Math.sin(this.edgeAngle);
      this.heading += omega * dt;

      // No steering for a second: drift back to the fall line.
      if (!stickActive && this.idleTime > this.autoCenterAfter) {
        this.heading += (0 - this.heading) * Math.min(1, this.autoCenterRate * dt);
      }
    } else {
      const spinDelta = stickX * this.airSpinRateScaled * dt;
      this.heading += spinDelta;
      this.spinRotation += spinDelta;
    }

    if (this.grounded) {
      // Grounded only; spins in the air are free.
      if (this.heading >  this.HEADING_MAX) this.heading = this.HEADING_MAX;
      if (this.heading <  this.HEADING_MIN) this.heading = this.HEADING_MIN;
      this.travelHeading = this.heading;
      // After a switch landing the rider turns back around.
      if (this.bodyYawOffset > 0 && this.clock >= this.switchUntil) {
        this.bodyYawOffset = Math.max(0, this.bodyYawOffset - Math.PI * dt / 0.35);
      }
    }

    const boardYaw = this.heading + this.bodyYawOffset;
    this.rider.root.rotation.x = this.terrain.activeSlope;
    this.rider.heading.rotation.y = boardYaw;
    this.rider.lean.rotation.z = -this.edgeAngle;

    // The head keeps looking down the fall line through carves.
    this.rider.head.rotation.y = Math.PI / 2 - boardYaw;

    this.applyBodyAnimation(now);

    const moveHeading = this.grounded ? this.heading : this.travelHeading;
    const cosH = Math.cos(moveHeading);
    const sinH = Math.sin(moveHeading);
    const boostActive = this.clock < this.boostUntil;
    const boostMult = boostActive ? 2.0 : 1.0;
    // Board across the fall line brakes: target speed falls to 50% at 90°.
    // Half-pipe boost strips double it.
    const targetSpeed = this.maxSpeed * (0.5 + 0.5 * cosH * cosH) * boostMult;
    if (this.grounded) {
      const brake = Math.abs(sinH);
      const brakeRate = this.speedCatch + brake * brake * 3.0;
      this.speed += (targetSpeed - this.speed) * Math.min(1, brakeRate * dt);
    } else {
      this.speed += (targetSpeed - this.speed) * Math.min(1, this.speedCatch * 0.3 * dt);
    }

    if (this.grounded) {
      const jump = { charge: this.jumpCharge, releaseRequired: this.jumpReleaseRequired };
      const launch = stepJumpCharge(jump, this.input.jumpHeld(), dt, this.chargeRateScaled);
      this.jumpCharge = jump.charge;
      this.jumpReleaseRequired = jump.releaseRequired;
      if (launch !== null) {
        this.verticalVelocity = this.jumpMin + launch * (this.jumpMaxScaled - this.jumpMin);
        this.grounded = false;
      }
    }
    // Only touch the DOM when the charge moves by 1%.
    const chargeStepped = Math.round(this.jumpCharge * 100) / 100;
    if (chargeStepped !== this.lastReportedCharge) {
      this.lastReportedCharge = chargeStepped;
      this.callbacks.onChargeChange?.(chargeStepped);
    }

    if (!this.grounded) {
      this.verticalVelocity -= this.gravity * dt;
      this.rider.root.position.y += this.verticalVelocity * dt;

      if (this.input.flipHeld()) {
        // FLIP alone = front flip; FLIP + Deep carve = back flip.
        const dir = forwardBoost ? -1 : 1;
        this.flipRotation += dir * this.flipRateScaled * dt;
        this.rider.body.rotation.x = this.flipRotation;
      }

      const groundLevel = this.groundY
        + this.terrain.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.terrain.pipeOffsetY(this.rider.root.position.x);
      if (this.rider.root.position.y <= groundLevel) {
        const impactSpeed = Math.abs(this.verticalVelocity);
        this.rider.root.position.y = groundLevel;
        this.verticalVelocity = 0;
        this.grounded = true;
        // Suppress cliff detection next frame; require a fresh jump press.
        this.justLanded = true;
        this.jumpReleaseRequired = true;

        const landing = judgeLanding(this.flipRotation, this.spinRotation, this.bodyYawOffset !== 0);
        if (landing.outcome === 'bail') {
          this.impactBurstUntil = this.clock + this.BURST_MS;
          this.impactBurstY = Math.min(14, impactSpeed);
          this.startBail();
          this.scene.render();
          return;
        }

        if (landing.isTrick) {
          this.flipsLanded += landing.flips;
          if (landing.halfTurns > 0) this.spinsLanded++;
          // Chained tricks within COMBO_TIMEOUT_MS raise the multiplier.
          if (this.comboCount > 0 && this.clock - this.lastTrickAt < this.COMBO_TIMEOUT_MS) {
            this.comboCount++;
          } else {
            this.comboCount = 1;
          }
          this.lastTrickAt = this.clock;
          this.runBestCombo = Math.max(this.runBestCombo, this.comboCount);
          const mult = this.comboMultiplier();
          const payout = landing.pay * mult * this.coinMultiplier;
          this.coinsCollected = addFlakes(this.coinsCollected, payout);
          this.callbacks.onComboChange?.(this.comboCount, mult);
          this.callbacks.onTrick?.({ name: landing.name, payout, comboMult: mult, outcome: 'clean', switch: landing.switch });
        } else if (landing.outcome === 'sketchy') {
          // Landed, but off-balance: no payout, the combo doesn't grow,
          // and the wobble costs some speed.
          this.speed *= 0.7;
          this.wobbleUntil = this.clock + 500;
          this.callbacks.onTrick?.({ name: 'SKETCHY', payout: 0, comboMult: this.comboMultiplier(), outcome: 'sketchy', switch: landing.switch });
        }

        // Snap the board to the flight direction (forgiving landing); a
        // sketchy one keeps half its error. Backward landings ride switch.
        const adj = landing.outcome === 'sketchy' ? landing.residual * 0.5 : 0;
        this.heading = Math.atan2(Math.sin(this.travelHeading + adj), Math.cos(this.travelHeading + adj));
        if (landing.switch) {
          this.bodyYawOffset = Math.PI;
          this.switchUntil = this.clock + this.SWITCH_MS;
        } else {
          this.bodyYawOffset = 0;
        }
        this.flipRotation = 0;
        this.rider.body.rotation.x = 0;
        this.spinRotation = 0;

        this.landingSquatUntil = this.clock + this.SQUAT_MS;
        this.impactBurstUntil = this.clock + this.BURST_MS;
        this.impactBurstY = Math.min(12, impactSpeed);
      }
    }

    this.rider.root.position.z += cosH * this.speed * dt;
    this.rider.root.position.x += sinH * this.speed * dt;

    if (this.mode === 'half-pipe') {
      const limit = HP.PIPE_HALF;
      const r = this.rider.root.position;
      // Hitting the lip redirects the rider ~17° back inward, always mostly
      // forward, so contacts never ping-pong across the pipe.
      const REBOUND_HEADING = 0.30;
      if (r.x > limit) {
        r.x = limit;
        if (moveHeading > 0) {
          if (this.grounded) this.heading = -REBOUND_HEADING;
          else this.travelHeading = -REBOUND_HEADING;
          this.edgeAngle = 0;
        }
      } else if (r.x < -limit) {
        r.x = -limit;
        if (moveHeading < 0) {
          if (this.grounded) this.heading = REBOUND_HEADING;
          else this.travelHeading = REBOUND_HEADING;
          this.edgeAngle = 0;
        }
      }
    } else {
      // Walls are rideable up to x=±475 (the wall mesh tops out at ±522).
      const limit = 475;
      if (this.rider.root.position.x >  limit) this.rider.root.position.x =  limit;
      if (this.rider.root.position.x < -limit) this.rider.root.position.x = -limit;

      const ax = Math.abs(this.rider.root.position.x);
      if (this.grounded && ax > this.terrain.wallFootX) {
        const wallDepth = ax - this.terrain.wallFootX;
        // Gravity's lateral component on the wall, g·m/(1+m²), integrated into
        // a persistent velocity; eased in over the first 80 m of wall.
        const lateralAccel = 9.8 * this.terrain.wallRise
          / (1 + this.terrain.wallRise * this.terrain.wallRise);
        const dir = this.rider.root.position.x > 0 ? -1 : +1;
        const factor = Math.min(1, wallDepth / 80);
        this.wallReturnVel += dir * lateralAccel * factor * dt;
        this.rider.root.position.x += this.wallReturnVel * dt;
      } else {
        this.wallReturnVel = 0;
      }
    }

    if (this.grounded) {
      const groundLevel = this.groundY
        + this.terrain.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.terrain.pipeOffsetY(this.rider.root.position.x);
      // Cliff detection is skipped across the wall seam and right after landing.
      const onWall = Math.abs(this.rider.root.position.x) > this.terrain.wallFootX;
      const droppedOffCliff = !onWall && !this.prevWasOnWall && !this.justLanded
        && this.prevGroundLevel !== null
        && (this.prevGroundLevel - groundLevel) > this.CLIFF_STEP_M;
      if (droppedOffCliff) {
        this.grounded = false;
      } else {
        this.rider.root.position.y = groundLevel;
      }
      this.prevGroundLevel = groundLevel;
      this.prevWasOnWall = Math.abs(this.rider.root.position.x) > this.terrain.wallFootX;
      this.justLanded = false;
    } else {
      this.prevGroundLevel = null;
      this.prevWasOnWall = false;
      this.justLanded = false;
    }

    this.checkInteractions();

    // Downhill pays for distance: 1 ❄ per 50 m × Flake Bonus.
    if (this.mode === 'downhill') {
      const due = distanceSegments(this.rider.root.position.z);
      if (due > this.distanceSegmentsPaid) {
        const n = due - this.distanceSegmentsPaid;
        this.distanceSegmentsPaid = due;
        this.coinsCollected = addFlakes(this.coinsCollected, n * DISTANCE_PAY * this.coinMultiplier);
      }
    }

    if (this.mode !== 'half-pipe') {
      this.terrain.extendAhead(this.rider.root.position.z + 50);
    }
    {
      const groundLevel = this.groundY
        + this.terrain.surfaceY(this.rider.root.position.x, this.rider.root.position.z)
        + this.terrain.pipeOffsetY(this.rider.root.position.x);
      // Safety net: never let the rider end up buried below the surface.
      if (this.rider.root.position.y < groundLevel - 1.5) {
        this.rider.root.position.y = groundLevel;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    const carveIntensity = Math.min(1, Math.abs(sinH));
    if (now < this.impactBurstUntil) {
      this.dustParticles.emitRate = this.BURST_EMIT;
    } else {
      this.dustParticles.emitRate = this.grounded ? (30 + carveIntensity * 100) : 0;
    }

    // Spray kicks sideways off the edge while carving.
    const sideKick = Math.sign(sinH) * carveIntensity * 4.0;
    this.dustParticles.direction1.x = -0.6 + sideKick;
    this.dustParticles.direction2.x =  0.6 + sideKick;

    // Trail marks stay on the snow and pause while airborne.
    if (this.trailAnchor) {
      if (this.grounded) {
        const rx = this.rider.root.position.x;
        const rz = this.rider.root.position.z;
        const surfY = this.groundY + this.terrain.surfaceY(rx, rz) + this.terrain.pipeOffsetY(rx);
        this.trailAnchor.position.set(rx, surfY + 0.02, rz);
        this.trail.start();
      } else {
        this.trail.stop();
      }
    }

    this.streamer.update(this.rider.root.position);

    const meters = Math.floor(this.rider.root.position.z);
    const altitude = this.mode === 'half-pipe'
      ? null
      : Math.max(0, Math.round(this.peakAltitude + this.rider.root.position.y - this.groundY));
    const altTag = altitude !== null ? `${altitude} m ↧  •  ` : '';
    const flipTag = this.flipsLanded > 0 ? `  •  ${this.flipsLanded} flip${this.flipsLanded > 1 ? 's' : ''}` : '';
    const spinTag = this.spinsLanded > 0 ? `  •  ${this.spinsLanded} spin${this.spinsLanded > 1 ? 's' : ''}` : '';
    const liveBank = displayFlakes(this.bankAtStart + this.coinsCollected);
    const coinTag = `  •  ${liveBank} ❄`;
    const label = `${altTag}${meters} m${coinTag}${flipTag}${spinTag}`;
    if (label !== this.lastScoreLabel) {
      this.lastScoreLabel = label;
      this.callbacks.onScore?.(label);
    }

    this.scene.render();
  }

  // Waist bend from the carve, crouch while charging a jump, landing
  // squat, and random idle gestures.
  private applyBodyAnimation(now: number): void {
    let waistZ = -this.edgeAngle * 0.4;
    // Sketchy landing: a quick side-to-side wobble.
    if (now < this.wobbleUntil) {
      const env = (this.wobbleUntil - now) / 500;
      waistZ += Math.sin(now * 0.045) * 0.35 * env;
    }

    let scaleY = 1;
    if (this.grounded && this.jumpCharge > 0) {
      scaleY = Math.min(scaleY, 1 - this.jumpCharge * 0.5);
    }
    if (now < this.landingSquatUntil) {
      scaleY = Math.min(scaleY, 0.70);
    }

    if (this.state === 'normal') {
      if (now >= this.idleEventEnd) {
        this.idleEventStart = now + 3000 + this.rng.next01() * 4000;
        this.idleEventEnd   = this.idleEventStart + 700 + this.rng.next01() * 600;
        this.idleEventKind  = Math.floor(this.rng.next01() * 5);
        this.idleEventAmp   = 0.12 + this.rng.next01() * 0.18;
      }
      this.rider.leftArm.rotation.z  *= 0.85;
      this.rider.rightArm.rotation.z *= 0.85;
      if (now >= this.idleEventStart && now < this.idleEventEnd) {
        const t = (now - this.idleEventStart) / Math.max(1, this.idleEventEnd - this.idleEventStart);
        const env = Math.sin(t * Math.PI);
        const v = env * this.idleEventAmp;
        switch (this.idleEventKind) {
          case 0: // both-arm balance sway
            this.rider.leftArm.rotation.z  =  v;
            this.rider.rightArm.rotation.z = -v;
            break;
          case 1: // single left-arm flick forward
            this.rider.leftArm.rotation.z  = v * 1.6;
            break;
          case 2: // single right-arm flick forward
            this.rider.rightArm.rotation.z = -v * 1.6;
            break;
          case 3: // brief squat to "loosen the legs"
            scaleY *= 1 - env * 0.08;
            break;
          case 4: // brief waist flex
            waistZ += v * 0.6;
            break;
        }
      }
    } else {
      this.rider.leftArm.rotation.z  = 0;
      this.rider.rightArm.rotation.z = 0;
    }

    this.rider.waist.rotation.z = waistZ;
    this.rider.humanoid.scaling.set(1, scaleY, 1);
  }

  // Combo timeout, half-pipe rings and boost strips, kickers, obstacles.
  private checkInteractions(): void {
    if (this.fellAlready) return;
    const r = this.rider.root.position;
    const invulnerable = this.state !== 'normal';

    if (this.comboCount > 0 && this.clock - this.lastTrickAt > this.COMBO_TIMEOUT_MS) {
      this.comboCount = 0;
      this.callbacks.onComboChange?.(0, 1);
    }

    if (this.mode === 'half-pipe' && !invulnerable) {
      // All chunks (≤10 in the pipe): a ring passed during a bail must
      // still count as missed once the bail ends.
      for (const chunk of this.streamer.chunks.values()) {
        if (chunk.rings) {
          for (const ring of chunk.rings) {
            if (ring.collected) continue;
            const dx = r.x - ring.x;
            const dy = r.y - ring.y;
            const dz = r.z - ring.z;
            // 3 m catch radius around the ring centre.
            if (dx * dx + dy * dy + dz * dz < 9.0) {
              ring.collected = true;
              ring.mesh.isVisible = false;
              spawnRingFlicker(this.scene, ring.x, ring.y, ring.z);
              this.coinsCollected = addFlakes(this.coinsCollected, 3 * this.comboMultiplier() * this.coinMultiplier);
              this.ringStreak++;
              this.ringsCollected++;
              this.runBestRingStreak = Math.max(this.runBestRingStreak, this.ringStreak);
              this.bestRingStreak = Math.max(this.bestRingStreak, this.ringStreak);
              soundFx.playRingChime();
              this.callbacks.onRingStreak?.(this.ringStreak, this.bestRingStreak);
            // Passed the ring without collecting it: streak resets.
            } else if (!ring.missed && r.z > ring.z + 5) {
              ring.missed = true;
              if (this.ringStreak > 0) {
                this.ringStreak = 0;
                this.callbacks.onRingStreak?.(0, this.bestRingStreak);
              }
            }
          }
        }
        if (chunk.boosts) {
          for (const b of chunk.boosts) {
            // Only when riding on the strip, not flying over it.
            if (this.grounded
              && Math.abs(r.x - b.x) < b.halfX
              && Math.abs(r.z - b.z) < b.halfZ) {
              const now = this.clock;
              if (now > this.boostSoundPlayingUntil) {
                soundFx.playBoostWhoosh();
                this.boostSoundPlayingUntil = now + 450;
              }
              this.boostUntil = now + 1200;
            }
          }
        }
      }
    }

    for (const chunk of this.streamer.nearby(r.x, r.z)) {
      if (this.grounded && !invulnerable) {
        for (const k of chunk.kickers) {
          if (segmentHitsRect(this.stepFromX, this.stepFromZ, r.x, r.z, k.x, k.z, k.width / 2, 1.6)) {
            this.verticalVelocity = k.power;
            this.grounded = false;
          }
        }
      }
      if (!invulnerable) {
        const surfaceAtRider = this.terrain.surfaceY(r.x, r.z);
        for (const o of chunk.rocks) {
          // Round hit-box, tested along this frame's whole movement.
          const hr = o.radius ?? 1.5;
          if (segmentHitsCircle(this.stepFromX, this.stepFromZ, r.x, r.z, o.x, o.z, hr)
            && r.y - (this.terrain.surfaceY(o.x, o.z)) < 1.55 && r.y - surfaceAtRider < 1.55) {
            this.fall();
            return;
          }
        }
      }
    }
  }

  private fall(): void {
    this.fellAlready = true;
    this.running = false;
    this.callbacks.onCrash?.();
    this.dustParticles.stop();
    this.rider.lean.rotation.z = 0;
    this.rider.body.rotation.x = 0;
    this.rider.body.rotation.z = Math.PI / 2;
    const distanceMeters = Math.floor(this.rider.root.position.z);
    this.fallTimeout = setTimeout(() => {
      this.fallTimeout = null;
      this.callbacks.onFell?.({
        distanceMeters,
        flips: this.flipsLanded,
        spins: this.spinsLanded,
        coins: this.coinsCollected,
      });
    }, 700);
  }}
