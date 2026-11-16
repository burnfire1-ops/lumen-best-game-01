// The game's rules and state, with no drawing and no browser in it: the firefly, the
// scrolling mushrooms, vines, wind, traps, orbs and power-ups, spawning, collisions, score,
// light and the win. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns: every list is a fixed pool.
import {
  BANDS, FIELD, FIREFLY, GAP, HIDDEN, LIGHT, PALETTES, POWER, SPACING, SPEED, STEP, WIN_SCORE,
} from './config.js';
import { createFirefly } from './firefly.js';

/** Reveal alpha for a hidden trap at a horizontal distance from the firefly:
 * near-invisible (dimAlpha) beyond HIDDEN.reveal, fully lit (1.0) within 100 px,
 * fading linearly in between. At max speed (260 px/s) the reveal starts ~1.1 s
 * before the firefly reaches the gap; at base speed ~2 s. */
export function hiddenAlpha(distance) {
  if (distance >= HIDDEN.reveal) return HIDDEN.dimAlpha;
  if (distance <= 100) return 1;
  return HIDDEN.dimAlpha + (1 - HIDDEN.dimAlpha) * (HIDDEN.reveal - distance) / (HIDDEN.reveal - 100);
}

export const EVENT_SCORE = 1;
export const EVENT_ORB = 2;
export const EVENT_POWER = 4;
export const EVENT_HIT = 8;
export const EVENT_OVER = 16;
export const EVENT_WIN = 32;

const MAX_GAPS = 8;
const MAX_VINES = 6;
const MAX_ORBS = 24;
const MAX_POWERS = 3;
const MAX_DROPS = 4;
const MAX_PARTICLES = 160;
const MAX_SPORES = 42;

function circleHitsRect(cx, cy, radius, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < radius * radius;
}

function circleHitsCircle(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const reach = r1 + r2;
  return dx * dx + dy * dy < reach * reach;
}

export function createWorld(random) {
  const firefly = createFirefly();
  const body = firefly.body;

  const gaps = [];
  for (let i = 0; i < MAX_GAPS; i += 1) {
    gaps.push({
      active: false, x: 0, gapY: 0, gapH: 0, passed: false, id: 0,
      trap: '', trapState: 0, trapT: 0, dropY: 0, dropVy: 0,
      snapY: 0, windDir: 0, narrowFrom: 0, narrowTo: 0, hiddenY: 0,
    });
  }
  const vines = [];
  for (let i = 0; i < MAX_VINES; i += 1) {
    vines.push({ active: false, x: 0, len: 0, phase: 0, amp: 0 });
  }
  const orbs = [];
  for (let i = 0; i < MAX_ORBS; i += 1) {
    orbs.push({ active: false, x: 0, y: 0, bob: 0 });
  }
  const powers = [];
  for (let i = 0; i < MAX_POWERS; i += 1) {
    powers.push({ active: false, x: 0, y: 0, kind: '' });
  }
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#f2c94c' });
  }
  const spores = [];
  for (let i = 0; i < MAX_SPORES; i += 1) {
    spores.push({ x: 0, y: 0, size: 2, phase: 0, drift: 0 });
  }

  const state = {
    firefly: body,
    gaps, vines, orbs, powers, particles, spores,
    score: 0, orbsCollected: 0, time: 0, elapsed: 0,
    paletteIndex: 0, shake: 0, won: false, winShown: false,
    speed: SPEED.base,
  };

  let nextGapX = FIELD.width + 120;
  let lastGapY = FIELD.height / 2;
  let gapNumber = 0;
  let bandIndex = -1;
  let guaranteeAt = {};
  let gapSpacing = SPACING[0][0];
  let overSent = false;

  function speed() {
    return Math.min(SPEED.cap, SPEED.base + SPEED.perPoint * state.score);
  }

  function gapHeight() {
    return Math.max(GAP.floor, GAP.height - GAP.shrinkPerPoint * state.score);
  }

  /** Which score band a gap number belongs to (gap n is scored when it is passed). */
  function bandFor(n) {
    if (n <= BANDS[0].to) return 0;
    if (n <= BANDS[1].to) return 1;
    if (n <= BANDS[2].to) return 2;
    return 3;
  }

  /** When a band starts, roll the random gap numbers its guaranteed traps land on. */
  function planBand(band) {
    guaranteeAt = {};
    const def = BANDS[band];
    const lo = band === 0 ? 1 : BANDS[band - 1].to + 1;
    // Band 1's drop lands in gaps 6-9 (the spec's range); band 2's traps anywhere in 11-20.
    const hi = band === 1 ? 9 : band === 3 ? lo + 9 : def.to;
    const used = new Set();
    for (const trap of def.guarantee || []) {
      let n = lo + Math.floor(random.next() * (hi - lo + 1));
      while (used.has(n)) n = lo + Math.floor(random.next() * (hi - lo + 1));
      used.add(n);
      guaranteeAt[n] = trap;
    }
  }

  function free(list) {
    for (let i = 0; i < list.length; i += 1) if (!list[i].active) return list[i];
    return null;
  }

  function spawnParticle(x, y, vx, vy, life, size, color) {
    const p = free(particles);
    if (p === null) return;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.size = size; p.color = color;
  }

  function burst(x, y, count, color, power) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.next() * Math.PI * 2;
      const speedValue = 40 + random.next() * power;
      spawnParticle(x, y, Math.cos(angle) * speedValue, Math.sin(angle) * speedValue,
        0.4 + random.next() * 0.4, 2 + random.next() * 3, color);
    }
  }

  function spawnGap() {
    const gap = free(gaps);
    if (gap === null) return;
    gapNumber += 1;
    const band = bandFor(gapNumber);
    if (band !== bandIndex) {
      bandIndex = band;
      planBand(band);
    }
    const def = BANDS[band];
    // Roll this gap's spacing from its band's range: it is the distance from
    // this gap to the next one, so the cursor advances by it below (and the
    // vine between them sits at 65% of it). Hard floor 240 px.
    gapSpacing = Math.max(240, random.range(SPACING[band][0], SPACING[band][1]));
    gap.active = true;
    gap.x = nextGapX;
    gap.id = gapNumber;
    gap.gapH = gapHeight();
    gap.gapY = Math.max(130, Math.min(FIELD.height - 130,
      lastGapY + random.range(-130, 130)));
    lastGapY = gap.gapY;
    gap.passed = false;
    gap.trap = '';
    gap.trapState = 0;
    gap.trapT = 0;
    gap.windDir = 0;
    if (guaranteeAt[gapNumber]) gap.trap = guaranteeAt[gapNumber];
    else if (def.extraChance && random.chance(def.extraChance)) {
      gap.trap = random.pick(def.extra);
    }
    if (gap.trap === 'wind') gap.windDir = random.chance(0.5) ? 1 : -1;
    if (gap.trap === 'narrow') {
      gap.narrowFrom = gap.gapH;
      gap.narrowTo = Math.max(116, gap.gapH - 20);
    }
    if (gap.trap === 'snap') gap.snapY = gap.gapY;
    if (gap.trap === 'drop') {
      gap.dropY = gap.gapY - gap.gapH / 2 - 110;
      gap.dropVy = 0;
    }
    if (gap.trap === 'hidden') {
      // Thorn cluster near the top or bottom edge of the gap (random side), so the
      // opposite side stays a wide clear path: the cluster nestles against the
      // mushroom, and the clear side (gapH - 50 px) always fits the firefly's
      // flap rise (~65 px) with room to spare.
      const side = random.chance(0.5) ? 1 : -1;
      gap.hiddenY = gap.gapY + side * (gap.gapH / 2 - 16);
    }
    nextGapX += gapSpacing;

    // Orbs: a row of three through every second gap, at its centre.
    if (gapNumber % 2 === 0) {
      for (let i = 0; i < 3; i += 1) {
        const orb = free(orbs);
        if (orb === null) break;
        orb.active = true;
        orb.x = gap.x - 30 + i * 52;
        orb.y = gap.gapY + (i === 1 ? -14 : 10);
        orb.bob = random.next() * Math.PI * 2;
      }
    }
    // A power-up every so often, floating in a gap.
    if (gapNumber % POWER.everyGaps === 0) {
      const power = free(powers);
      if (power !== null) {
        power.active = true;
        power.x = gap.x + 60;
        power.y = gap.gapY;
        power.kind = random.pick(['shield', 'magnet', 'slow']);
      }
    }
    // A swaying vine between gaps, once the learning zone is over. It hangs closer to the
    // next gap than to the one just passed, so the firefly has room to dive under it after
    // clearing a gap instead of meeting it the instant it exits.
    if (gapNumber > 5 && random.chance(0.25)) {
      const vine = free(vines);
      if (vine !== null) {
        vine.active = true;
        vine.x = gap.x + gapSpacing * 0.65;
        vine.len = random.range(140, 200);
        vine.phase = random.next() * Math.PI * 2;
        vine.amp = random.range(8, 18);
      }
    }
  }

  function vineXAt(vine, y) {
    return vine.x + Math.sin(vine.phase + y * 0.004 + state.time * 1.1) * vine.amp * (y / vine.len);
  }

  function reset() {
    firefly.reset();
    for (const gap of gaps) gap.active = false;
    for (const vine of vines) vine.active = false;
    for (const orb of orbs) orb.active = false;
    for (const power of powers) power.active = false;
    for (const p of particles) p.active = false;
    for (let i = 0; i < spores.length; i += 1) {
      spores[i].x = random.next() * FIELD.width;
      spores[i].y = random.next() * FIELD.height;
      spores[i].size = 1.5 + random.next() * 2.5;
      spores[i].phase = random.next() * Math.PI * 2;
      spores[i].drift = 6 + random.next() * 14;
    }
    state.score = 0;
    state.orbsCollected = 0;
    state.time = 0;
    state.elapsed = 0;
    state.paletteIndex = 0;
    state.shake = 0;
    state.won = false;
    state.winShown = false;
    nextGapX = FIELD.width + 120;
    lastGapY = FIELD.height / 2;
    gapNumber = 0;
    bandIndex = -1;
    guaranteeAt = {};
    overSent = false;
    while (nextGapX < FIELD.width + gapSpacing * 2) spawnGap();
  }

  /**
   * One fixed step. `flap` is true when the firefly flaps this step. With `harmless` set (the
   * title screen's backdrop) the world scrolls and the firefly hovers, but nothing scores,
   * nothing hurts and the light never drains.
   */
  function step(dt, flap, harmless) {
    let events = 0;
    const now = state.elapsed;
    state.elapsed += dt;
    state.time += dt;
    const move = speed() * dt;
    state.speed = speed();
    state.paletteIndex = Math.min(PALETTES.length - 1, Math.floor(state.score / 10)) % PALETTES.length;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    // The firefly.
    if (harmless) {
      body.y = FIELD.height / 2 + Math.sin(state.time * 1.1) * 70;
      body.vy = 0;
    } else {
      if (flap) firefly.flap();
      // Wind pushes the firefly while it is inside a wind zone.
      for (const gap of gaps) {
        if (!gap.active || gap.trap !== 'wind') continue;
        if (Math.abs(body.x - gap.x) < 130) body.vy += gap.windDir * 300 * dt;
      }
      firefly.step(dt, now);
      if (body.y < body.radius) {
        body.y = body.radius;
        body.vy = Math.max(0, body.vy);
      }
      // Light-out is decided inside firefly.step; report it once.
      if (body.dead && body.deadReason === 'light' && !overSent) {
        overSent = true;
        state.shake = 0.3;
        burst(body.x, body.y, 14, '#fde047', 160);
        events |= EVENT_OVER;
      }
    }

    // Spawn ahead as the world scrolls: the cursor rides left with everything else,
    // so a new gap appears off-screen right each time the last one has room behind it.
    nextGapX -= move;
    while (nextGapX < FIELD.width + gapSpacing) spawnGap();

    // Glow trail behind the firefly.
    if (!harmless && !body.dead && random.chance(0.6)) {
      spawnParticle(body.x - 16, body.y + random.range(-6, 6),
        -30 - random.next() * 30, random.range(-12, 12),
        0.45, 2 + random.next() * 2, '#d9f99d');
    }

    // Gaps scroll, traps arm, score is counted when a gap passes the firefly.
    for (const gap of gaps) {
      if (!gap.active) continue;
      gap.x -= move;
      if (gap.x < -160) {
        gap.active = false;
        continue;
      }
      if (!gap.passed && gap.x + GAP.width / 2 < body.x) {
        gap.passed = true;
        if (!harmless) {
          state.score += 1;
          events |= EVENT_SCORE;
          if (state.score >= WIN_SCORE && !state.won) {
            state.won = true;
            events |= EVENT_WIN;
          }
        }
      }
      // Trap arming: each trap wakes as its gap nears the firefly.
      const near = gap.x - body.x;
      if (gap.trap === 'drop' && gap.trapState === 0 && near < 480) {
        gap.trapState = 1;
        gap.trapT = 0;
      } else if (gap.trap === 'drop' && gap.trapState === 1) {
        gap.trapT += dt;
        if (gap.trapT > 0.5) {
          gap.trapState = 2;
          gap.dropVy = 30;
        }
      } else if (gap.trap === 'drop' && gap.trapState === 2) {
        gap.dropVy += 1500 * dt;
        gap.dropY += gap.dropVy * dt;
        if (gap.dropY > FIELD.height + 80) gap.trap = '';
      } else if (gap.trap === 'narrow' && near < 500) {
        gap.trapT += dt;
        const k = Math.min(1, gap.trapT / 1.2);
        gap.gapH = gap.narrowFrom + (gap.narrowTo - gap.narrowFrom) * k;
      } else if (gap.trap === 'snap' && gap.trapState === 0 && near < 420) {
        gap.trapState = 1;
        gap.trapT = 0;
      } else if (gap.trap === 'snap' && gap.trapState === 1) {
        gap.trapT += dt;
        if (gap.trapT > 0.5) {
          gap.trapState = 2;
          gap.trapT = 0;
        }
      } else if (gap.trap === 'snap' && gap.trapState === 2) {
        gap.trapT += dt;
        if (gap.trapT > 0.8) {
          gap.trapState = 3;
          gap.trap = '';
        }
      }
    }

    // Vines sway and scroll.
    for (const vine of vines) {
      if (!vine.active) continue;
      vine.x -= move;
      vine.phase += dt * 0.9;
      if (vine.x < -40) vine.active = false;
    }

    // Orbs drift, bob, and are collected (the magnet pulls them in).
    for (const orb of orbs) {
      if (!orb.active) continue;
      orb.x -= move;
      orb.bob += dt * 3;
      if (orb.x < -30) {
        orb.active = false;
        continue;
      }
      if (harmless || body.dead) continue;
      const oy = orb.y + Math.sin(orb.bob) * 5;
      let dx = body.x - orb.x;
      let dy = body.y - oy;
      if (firefly.magnetActive(now)) {
        const dist = Math.hypot(dx, dy);
        if (dist < 190 && dist > 1) {
          orb.x += (dx / dist) * 260 * dt;
          orb.y += (dy / dist) * 260 * dt;
          dx = body.x - orb.x;
          dy = body.y - oy;
        }
      }
      if (circleHitsCircle(body.x, body.y, body.radius + 6, orb.x, oy, 13)) {
        orb.active = false;
        state.orbsCollected += 1;
        firefly.refillLight();
        burst(orb.x, oy, 8, '#fde047', 120);
        events |= EVENT_ORB;
      }
    }

    // Power-ups scroll and are collected.
    for (const power of powers) {
      if (!power.active) continue;
      power.x -= move;
      if (power.x < -30) {
        power.active = false;
        continue;
      }
      if (harmless || body.dead) continue;
      if (circleHitsCircle(body.x, body.y, body.radius + 8, power.x, power.y, 16)) {
        power.active = false;
        firefly.grantPower(power.kind, now);
        burst(power.x, power.y, 10, '#a5b4fc', 140);
        events |= EVENT_POWER;
      }
    }

    // Particles and spores drift.
    for (const p of particles) {
      if (!p.active) continue;
      p.x += p.vx * dt - move * 0.4;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    for (const spore of spores) {
      spore.x -= (move * 0.15 + spore.drift * dt);
      spore.y += Math.sin(state.time * 0.7 + spore.phase) * 6 * dt;
      if (spore.x < -10) {
        spore.x = FIELD.width + 10;
        spore.y = random.next() * FIELD.height;
      }
    }

    // Collisions (only in real play, while the firefly lives).
    if (!harmless && !body.dead) {
      // The ground is deadly; the ceiling is a soft stop.
      if (body.y + body.radius >= FIELD.height) {
        body.dead = true;
        body.deadReason = 'hit';
        state.shake = 0.35;
        burst(body.x, body.y, 16, '#f2c94c', 200);
        events |= EVENT_OVER;
        return events;
      }
      for (const gap of gaps) {
        if (!gap.active) continue;
        const top = gap.gapY - gap.gapH / 2;
        const bottom = gap.gapY + gap.gapH / 2;
        const halfW = GAP.width / 2 + 8;
        if (Math.abs(body.x - gap.x) < halfW + body.radius) {
          if (circleHitsRect(body.x, body.y, body.radius, gap.x - halfW, -40, halfW * 2, top + 40)
            || circleHitsRect(body.x, body.y, body.radius, gap.x - halfW, bottom, halfW * 2, FIELD.height - bottom + 40)) {
            if (firefly.hit()) {
              state.shake = 0.35;
              burst(body.x, body.y, 16, '#f2c94c', 200);
              events |= EVENT_OVER;
              return events;
            }
            events |= EVENT_HIT;
          }
        }
        // The falling mushroom of a drop trap.
        if (gap.trap === 'drop' && gap.trapState === 2) {
          if (circleHitsCircle(body.x, body.y, body.radius, gap.x, gap.dropY, 38)) {
            if (firefly.hit()) {
              state.shake = 0.35;
              burst(body.x, body.y, 16, '#f2c94c', 200);
              events |= EVENT_OVER;
              return events;
            }
            events |= EVENT_HIT;
          }
        }
        // The extended bar of a snap trap.
        if (gap.trap === 'snap' && gap.trapState === 2) {
          if (circleHitsRect(body.x, body.y, body.radius, gap.x - 70, gap.snapY - 9, 140, 18)) {
            if (firefly.hit()) {
              state.shake = 0.35;
              burst(body.x, body.y, 16, '#f2c94c', 200);
              events |= EVENT_OVER;
              return events;
            }
            events |= EVENT_HIT;
          }
        }
        // The hidden thorn cluster: a circle at its centre, live from spawn.
        if (gap.trap === 'hidden') {
          if (circleHitsCircle(body.x, body.y, body.radius, gap.x, gap.hiddenY, HIDDEN.radius)) {
            if (firefly.hit()) {
              state.shake = 0.35;
              burst(body.x, body.y, 16, '#f2c94c', 200);
              events |= EVENT_OVER;
              return events;
            }
            events |= EVENT_HIT;
          }
        }
      }
      for (const vine of vines) {
        if (!vine.active) continue;
        if (Math.abs(body.x - vine.x) > 60 || body.y > vine.len) continue;
        const vineX = vineXAt(vine, body.y);
        if (Math.abs(body.x - vineX) < body.radius + 9) {
          if (firefly.hit()) {
            state.shake = 0.35;
            burst(body.x, body.y, 16, '#f2c94c', 200);
            events |= EVENT_OVER;
            return events;
          }
          events |= EVENT_HIT;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, burst };
}
