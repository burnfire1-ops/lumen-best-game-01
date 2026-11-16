// The firefly itself: its height, its fall, its glow. It never moves sideways — the world
// scrolls past it. It also carries the light meter (the second way to lose) and the three
// power-up timers. Nothing here knows about obstacles; the world asks it to move and to test.

import { FIELD, FIREFLY, LIGHT, POWER } from './config.js';

export function createFirefly() {
  const body = {
    x: FIREFLY.x,
    y: FIELD.height / 2,
    vy: 0,
    radius: FIREFLY.radius,
    light: 1,
    shield: false,
    magnetUntil: 0,
    slowUntil: 0,
    dead: false,
    deadReason: '',
  };

  return {
    body,
    reset() {
      body.y = FIELD.height / 2;
      body.vy = 0;
      body.light = 1;
      body.shield = false;
      body.magnetUntil = 0;
      body.slowUntil = 0;
      body.dead = false;
      body.deadReason = '';
    },
    flap() {
      if (body.dead) return;
      body.vy = FIREFLY.flapVelocity;
    },
    /** One step: gravity, the light drain, and the power-up clocks. */
    step(dt, now) {
      if (body.dead) return;
      body.vy = Math.min(FIREFLY.maxFall, body.vy + FIREFLY.gravity * dt);
      body.y += body.vy * dt;
      body.light = Math.max(0, body.light - LIGHT.drain * dt);
      if (body.light === 0) {
        body.dead = true;
        body.deadReason = 'light';
      }
    },
    /** The glow radius grows a little with each palette shift. */
    glowRadius(paletteIndex) {
      return 90 + paletteIndex * 12;
    },
    magnetActive(now) {
      return now < body.magnetUntil;
    },
    slowActive(now) {
      return now < body.slowUntil;
    },
    refillLight() {
      body.light = Math.min(1, body.light + LIGHT.orbRefill);
    },
    grantPower(kind, now) {
      if (kind === 'shield') body.shield = true;
      else if (kind === 'magnet') body.magnetUntil = now + POWER.magnetSeconds;
      else if (kind === 'slow') body.slowUntil = now + POWER.slowSeconds;
    },
    /** A hit: the shield absorbs one, otherwise the firefly dies. */
    hit() {
      if (body.shield) {
        body.shield = false;
        return false;
      }
      body.dead = true;
      body.deadReason = 'hit';
      return true;
    },
  };
}
