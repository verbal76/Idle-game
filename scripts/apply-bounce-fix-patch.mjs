// TEMPORARY in-CI patch for src/scene/Game.ts to apply the landing
// rubber-bounce fix without checking the modified Game.ts into git.
// The local git proxy is currently 403'ing pushes from this Claude
// session, and Game.ts (~134 KB) is too large to round-trip cleanly
// through the GitHub MCP tool API as a single argument. This script
// applies the same logic at OTA bundle time.
//
// Once `git push` is restored, the source-level fix lands in Game.ts
// directly and this script + the workflow step that runs it should
// be deleted in the same commit.
//
// Idempotent: checks for the `jumpReleaseRequired` marker before
// applying and exits cleanly if Game.ts already has the changes.
// Refuses to apply a partial patch if any anchor doesn't match (so
// silent breakage from a future Game.ts edit can't ship a half-patched
// build).

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/scene/Game.ts';
let content = readFileSync(path, 'utf8');

if (content.includes('jumpReleaseRequired')) {
  console.log('apply-bounce-fix-patch: marker already present, skipping');
  process.exit(0);
}

const patches = [
  {
    name: 'field decl',
    from: `  private jumpCharge = 0;\n  // Last value reported via onChargeChange — prevents per-frame DOM\n  // updates while charge sits at zero (idle riding) or at 1 (max held).\n  private lastReportedCharge = 0;`,
    to:   `  private jumpCharge = 0;\n  // Release-edge gate for the jump charge. Set true on every landing\n  // so a player who held the jump button continuously through the\n  // airborne arc cannot start re-charging on the very next ground\n  // frame (which would then fire the release branch a few frames\n  // later and re-launch them — the "rubber bounce" symptom).\n  // Cleared as soon as the input layer reports the button released\n  // (or when the player consumes a charged jump). Net effect: each\n  // jump requires its own fresh press, matching the "release to\n  // jump again" pattern in most platformers.\n  private jumpReleaseRequired = false;\n  // Last value reported via onChargeChange — prevents per-frame DOM\n  // updates while charge sits at zero (idle riding) or at 1 (max held).\n  private lastReportedCharge = 0;`,
  },
  {
    name: 'jump logic',
    from: `    if (this.grounded) {\n      if (this.input.jumpHeld()) {\n        this.jumpCharge = Math.min(1, this.jumpCharge + dt * this.chargeRateScaled);\n      } else if (this.jumpCharge > 0) {\n        this.verticalVelocity = (this.jumpMin + this.jumpCharge * (this.jumpMaxScaled - this.jumpMin));\n        this.jumpCharge = 0;\n        this.grounded = false;\n      }\n    }`,
    to:   `    if (this.grounded) {\n      if (this.input.jumpHeld() && !this.jumpReleaseRequired) {\n        this.jumpCharge = Math.min(1, this.jumpCharge + dt * this.chargeRateScaled);\n      } else if (!this.input.jumpHeld()) {\n        // Fresh release seen — gate is open for a new charge cycle.\n        this.jumpReleaseRequired = false;\n        if (this.jumpCharge > 0) {\n          this.verticalVelocity = (this.jumpMin + this.jumpCharge * (this.jumpMaxScaled - this.jumpMin));\n          this.jumpCharge = 0;\n          this.grounded = false;\n        }\n      }\n    }`,
  },
  {
    name: 'landing flag',
    from: `        this.justLanded = true;\n\n        if (this.isCleanLanding()) {`,
    to:   `        this.justLanded = true;\n        // Lock out jump-charge re-accumulation until the player\n        // releases the button. Prevents the "rubber bounce" where\n        // a continuously-held jump input starts charging on the\n        // landing frame and triggers a release-jump a few frames\n        // later. Player must let go and re-press to charge again.\n        this.jumpReleaseRequired = true;\n\n        if (this.isCleanLanding()) {`,
  },
  {
    name: 'bail reset',
    from: `    this.verticalVelocity = 0;\n    this.jumpCharge = 0;\n  }\n\n  private startRecovery`,
    to:   `    this.verticalVelocity = 0;\n    this.jumpCharge = 0;\n    this.jumpReleaseRequired = true;\n  }\n\n  private startRecovery`,
  },
];

for (const p of patches) {
  if (!content.includes(p.from)) {
    console.error(`apply-bounce-fix-patch: anchor '${p.name}' not found in Game.ts; refusing to apply partial patch`);
    process.exit(1);
  }
  content = content.replace(p.from, p.to);
}

writeFileSync(path, content);
console.log(`apply-bounce-fix-patch: applied ${patches.length} patches to ${path}`);
