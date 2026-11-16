// The screenshot scenes behind ?shot=start|play|trap|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot that aims
// for the centre of the next gap, so the frame is what a short game really looks like and
// the same seed always gives the same frame. The play pilot is careful; the end pilot flaps
// late, so it is caught out once the gaps speed up, as a hurried player is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 24;
const TRAP_SECONDS = 32;
const END_LIMIT_SECONDS = 120;

/** How far below the gap centre the pilot lets the firefly sink before flapping. 25 puts the
 * 65 px hover band inside the safe zone of even the narrowest gap: the band is [centre-40,
 * centre+25] and the safe zone of a 116 px gap is [centre-44, centre+44]. */
const MARGIN_PLAY = 25;
const MARGIN_TRAP = 25;
const MARGIN_END = 55;

/** The next gap the firefly has not passed yet: the smallest x still ahead of it. The
 * pool is not sorted by x, so a first match would aim at a far gap. A gap stays the target
 * until the firefly is fully clear of its column (right edge + firefly radius), not just
 * past its centre, or the pilot climbs for the next gap while still inside this one. */
function nextGap(state) {
  let best = null;
  for (const gap of state.gaps) {
    if (!gap.active || gap.x + 60 <= state.firefly.x) continue;
    if (best === null || gap.x < best.x) best = gap;
  }
  return best;
}

/** Flap when the firefly is below the next gap's centre (plus the pilot's margin). A vine
 * close ahead overrides the gap: between gaps it always dives under the tip, and even
 * inside a gap's column it dives unless the firefly is about to clip the gap's floor (the
 * vine's sway reaches sideways, so its danger zone starts before its base x does). A vine
 * behind the next gap never overrides it. While diving, the firefly keeps falling until it
 * is a full flap-rise below the tip (a flap from any higher would rise straight back into
 * the vine), only flapping again once it is clear (or near the ground). While a vine is
 * ahead and the firefly is still above its tip, the pilot aims LOW in the gap (a bigger
 * margin, capped by the gap's own safe floor) so it exits the gap already near the tip
 * instead of flapping up to the centre and then having to fall the whole way down. */
function autopilot(state, margin) {
  const body = state.firefly;
  const gap = nextGap(state);
  let vine = null;
  for (const v of state.vines) {
    if (!v.active) continue;
    if (v.x > body.x - 30 && v.x < body.x + 300) {
      if (vine === null || v.x < vine.x) vine = v;
    }
  }
  const vineAhead = vine !== null && body.y < vine.len + 75;
  const insideGap = gap !== null && Math.abs(body.x - gap.x) < 60;
  if (vine !== null && (gap === null || vine.x < gap.x) && vineAhead) {
    // Inside a gap, only flap to avoid the floor; otherwise dive under the vine.
    if (insideGap && gap !== null && body.y > gap.gapY + gap.gapH / 2 - 30) return true;
    return body.y > 620;
  }
  if (gap === null) return false;
  // Aim low when a vine is ahead, but never below the gap's own safe floor: the low aim
  // is capped at the gap's half-height minus the firefly radius and a small safety gap.
  const low = Math.min(60, Math.max(margin, gap.gapH / 2 - 19));
  return body.y > gap.gapY + (vineAhead ? low : margin);
}

/**
 * Set `world` to the named scene (start, play, trap or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'trap' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, false, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const seconds = name === 'end' ? END_LIMIT_SECONDS : name === 'trap' ? TRAP_SECONDS : PLAY_SECONDS;
  const margin = name === 'end' ? MARGIN_END : name === 'trap' ? MARGIN_TRAP : MARGIN_PLAY;
  let over = false;
  for (let index = 0; index < seconds / STEP; index += 1) {
    if (world.step(STEP, autopilot(world.state, margin), false) & EVENT_OVER) {
      over = true;
      break;
    }
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
