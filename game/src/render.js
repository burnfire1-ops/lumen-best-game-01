// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The firefly's glow is a radial gradient; mushrooms, vines and orbs are flat canvas
// shapes with a soft glow. The HUD is variant B: the score on a glowing mushroom cap, the
// light meter as a hanging lantern, the best on a wooden sign, and a small round pause button.
import { FIELD, FONT, GAP, HIDDEN, PALETTES, WIN_SCORE } from './config.js';
import { hiddenAlpha } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 620, line: 36 };

/** A deterministic wobble in [-0.5, 0.5) from the world's clock: the screen shake must
 * look random but paint the same frame for the same world time, or screenshots differ
 * run to run. (Math.random here made the end scene non-deterministic.) */
function shakeNoise(time, salt) {
  const s = Math.sin(time * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function font(size, weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'center', weight = '') {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function glowText(value, x, y, size, color, glow, align = 'center', weight = '700') {
    context.save();
    context.shadowColor = glow;
    context.shadowBlur = 18;
    text(value, x, y, size, color, align, weight);
    context.restore();
  }

  function ellipse(cx, cy, rx, ry) {
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
  }

  /** A mushroom cap dome, glowing, with pale spots. `down` hangs it from above. */
  function drawCap(x, y, width, height, palette, down) {
    context.save();
    context.shadowColor = palette.capGlow;
    context.shadowBlur = 22;
    context.fillStyle = palette.cap;
    context.beginPath();
    if (down) {
      context.ellipse(x, y, width / 2, height, 0, 0, Math.PI);
    } else {
      context.ellipse(x, y, width / 2, height, 0, Math.PI, Math.PI * 2);
    }
    context.fill();
    context.restore();
    // Spots on the cap.
    context.fillStyle = 'rgba(255,255,255,0.35)';
    ellipse(x - width * 0.22, y + (down ? height * 0.35 : -height * 0.35), width * 0.07, height * 0.16);
    ellipse(x + width * 0.18, y + (down ? height * 0.5 : -height * 0.5), width * 0.09, height * 0.2);
    ellipse(x + width * 0.32, y + (down ? height * 0.2 : -height * 0.2), width * 0.05, height * 0.12);
  }

  function drawStem(x, yTop, yBottom, width, palette) {
    context.fillStyle = palette.stem;
    context.fillRect(x - width / 2, yTop, width, yBottom - yTop);
    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(x - width / 2 + 4, yTop, 5, yBottom - yTop);
  }

  function drawBackground(state) {
    const palette = PALETTES[state.paletteIndex];
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, palette.sky);
    gradient.addColorStop(1, palette.deep);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    // Distant mushroom silhouettes, drifting slowly with the world.
    context.fillStyle = palette.fog;
    const offset = (state.time * 12) % 320;
    for (let i = -1; i < 5; i += 1) {
      const bx = i * 320 - offset + 80;
      drawCap(bx, FIELD.height - 40, 150, 46, palette, false);
      context.fillRect(bx - 18, FIELD.height - 40, 36, 40);
      drawCap(bx + 170, FIELD.height - 20, 100, 32, palette, false);
      context.fillRect(bx + 158, FIELD.height - 20, 24, 20);
    }

    // Floating spores, lit by the firefly's glow.
    for (const spore of state.spores) {
      const dx = spore.x - state.firefly.x;
      const dy = spore.y - state.firefly.y;
      const near = Math.hypot(dx, dy) < 220;
      context.fillStyle = near ? 'rgba(217,249,157,0.85)' : 'rgba(148,163,184,0.35)';
      ellipse(spore.x, spore.y + Math.sin(state.time * 0.7 + spore.phase) * 4, spore.size, spore.size);
    }

    // The ground: dark ferns at the bottom edge.
    context.fillStyle = palette.deep;
    context.fillRect(0, FIELD.height - 26, FIELD.width, 26);
    context.fillStyle = palette.fog;
    for (let x = 0; x < FIELD.width; x += 46) {
      context.beginPath();
      context.moveTo(x, FIELD.height - 26);
      context.lineTo(x + 12, FIELD.height - 58 - ((x * 7) % 18));
      context.lineTo(x + 24, FIELD.height - 26);
      context.closePath();
      context.fill();
    }
  }

  function drawWind(gap, palette) {
    const alpha = 0.28 + Math.sin(gap.x * 0.05) * 0.08;
    context.save();
    context.strokeStyle = `rgba(165,243,252,${alpha})`;
    context.lineWidth = 5;
    context.lineCap = 'round';
    for (let i = 0; i < 4; i += 1) {
      const y = gap.gapY - 120 + i * 80 + Math.sin(gap.x * 0.03 + i) * 14;
      context.beginPath();
      context.moveTo(gap.x - 130, y);
      context.bezierCurveTo(gap.x - 60, y + gap.windDir * 26, gap.x + 40, y - gap.windDir * 26, gap.x + 130, y);
      context.stroke();
    }
    context.restore();
    text(gap.windDir > 0 ? '▼ angin' : '▲ angin', gap.x, gap.gapY - 150, 18, palette.text, 'center', '600');
  }

  function drawGap(gap, palette, fireflyX) {
    const top = gap.gapY - gap.gapH / 2;
    const bottom = gap.gapY + gap.gapH / 2;
    const stemW = GAP.width - 26;
    // Top mushroom hangs from above; bottom one rises from the ground.
    drawStem(gap.x, -10, top, stemW, palette);
    drawCap(gap.x, top, GAP.width + 34, 30, palette, true);
    drawStem(gap.x, bottom, FIELD.height + 10, stemW, palette);
    drawCap(gap.x, bottom, GAP.width + 34, 30, palette, false);

    if (gap.trap === 'drop') {
      const shaking = gap.trapState === 1 ? Math.sin(gap.trapT * 60) * 4 : 0;
      const y = gap.trapState === 2 ? gap.dropY : gap.gapY - gap.gapH / 2 - 110;
      context.save();
      if (gap.trapState === 1) {
        context.shadowColor = '#fca5a5';
        context.shadowBlur = 16;
      }
      drawCap(gap.x + shaking, y, 84, 26, palette, true);
      context.restore();
      if (gap.trapState === 1) {
        text('!', gap.x, y - 34, 26, '#fca5a5', 'center', '700');
      }
    }
    if (gap.trap === 'snap') {
      const glowing = gap.trapState === 1;
      // The vine hangs in the gap, glowing before it snaps.
      context.save();
      context.strokeStyle = glowing ? '#fde047' : palette.cap;
      context.lineWidth = glowing ? 7 : 5;
      context.shadowColor = glowing ? '#fde047' : 'transparent';
      context.shadowBlur = glowing ? 18 : 0;
      context.beginPath();
      context.moveTo(gap.x + 44, top - 30);
      context.quadraticCurveTo(gap.x + 60, gap.gapY - 40, gap.x + 40, gap.snapY);
      context.stroke();
      context.restore();
      if (gap.trapState === 2) {
        // The bar that sweeps across the gap.
        context.save();
        context.shadowColor = '#fde047';
        context.shadowBlur = 16;
        context.fillStyle = '#facc15';
        context.fillRect(gap.x - 70, gap.snapY - 9, 140, 18);
        context.fillStyle = '#a16207';
        for (let sx = gap.x - 60; sx <= gap.x + 60; sx += 20) {
          context.beginPath();
          context.moveTo(sx, gap.snapY - 9);
          context.lineTo(sx + 8, gap.snapY - 22);
          context.lineTo(sx + 16, gap.snapY - 9);
          context.closePath();
          context.fill();
        }
        context.restore();
      }
    }
    if (gap.trap === 'wind') drawWind(gap, palette);
    if (gap.trap === 'hidden') {
      // A thorn cluster hidden in the dark: near-invisible while far away, fading
      // in with a gold glow as the firefly's light reaches it, in time to react.
      const alpha = hiddenAlpha(Math.max(0, gap.x - fireflyX));
      const revealed = alpha > 0.6;
      context.save();
      context.globalAlpha = alpha;
      if (revealed) {
        context.shadowColor = '#fde047';
        context.shadowBlur = 16;
      }
      context.fillStyle = '#171233';
      context.strokeStyle = revealed ? '#fde047' : '#3b2a63';
      context.lineWidth = 1.5;
      for (let i = 0; i < 5; i += 1) {
        const angle = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const tipX = gap.x + Math.cos(angle) * HIDDEN.radius;
        const tipY = gap.hiddenY + Math.sin(angle) * HIDDEN.radius;
        const baseA = angle + 0.3;
        const baseB = angle - 0.3;
        context.beginPath();
        context.moveTo(tipX, tipY);
        context.lineTo(gap.x + Math.cos(baseA) * 9, gap.hiddenY + Math.sin(baseA) * 9);
        context.lineTo(gap.x + Math.cos(baseB) * 9, gap.hiddenY + Math.sin(baseB) * 9);
        context.closePath();
        context.fill();
        context.stroke();
      }
      context.restore();
      if (revealed) {
        text('!', gap.x, gap.hiddenY - HIDDEN.radius - 14, 26, '#fde047', 'center', '700');
      }
    }
  }

  function drawVine(vine, palette) {
    const tipX = vine.x + Math.sin(vine.phase) * vine.amp;
    context.save();
    context.strokeStyle = palette.stem;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(vine.x, -6);
    context.quadraticCurveTo(vine.x + Math.sin(vine.phase) * vine.amp * 0.5, vine.len * 0.55, tipX, vine.len);
    context.stroke();
    // Thorns along the vine.
    context.fillStyle = palette.cap;
    for (let t = 0.2; t < 1; t += 0.2) {
      const y = vine.len * t;
      const x = vine.x + Math.sin(vine.phase + y * 0.004) * vine.amp * (y / vine.len);
      ellipse(x, y, 4, 7);
    }
    context.restore();
  }

  function drawOrb(orb, palette, time) {
    const y = orb.y + Math.sin(orb.bob) * 5;
    const pulse = 1 + Math.sin(time * 5 + orb.bob) * 0.08;
    context.save();
    context.shadowColor = palette.orb;
    context.shadowBlur = 18;
    context.fillStyle = palette.orb;
    ellipse(orb.x, y, 12 * pulse, 12 * pulse);
    context.restore();
    context.fillStyle = 'rgba(255,255,255,0.75)';
    ellipse(orb.x - 3, y - 4, 3.5, 3.5);
  }

  function drawPower(power, time) {
    const bob = Math.sin(time * 3 + power.x * 0.01) * 5;
    const y = power.y + bob;
    context.save();
    context.shadowBlur = 16;
    if (power.kind === 'shield') {
      context.shadowColor = '#60a5fa';
      context.fillStyle = '#3b82f6';
      ellipse(power.x, y, 15, 15);
      context.strokeStyle = '#dbeafe';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(power.x, y, 9, 0, Math.PI * 2);
      context.stroke();
    } else if (power.kind === 'magnet') {
      context.shadowColor = '#c084fc';
      context.fillStyle = '#a855f7';
      ellipse(power.x, y, 15, 15);
      text('U', power.x, y + 6, 18, '#ffffff', 'center', '700');
    } else {
      context.shadowColor = '#67e8f9';
      context.fillStyle = '#06b6d4';
      ellipse(power.x, y, 15, 15);
      text('◔', power.x, y + 6, 16, '#ffffff', 'center', '700');
    }
    context.restore();
  }

  function drawFirefly(state, palette) {
    const body = state.firefly;
    const glow = 90 + state.paletteIndex * 12;
    const flicker = 1 + Math.sin(state.time * 6) * 0.08;
    // The glow that lights the forest.
    const gradient = context.createRadialGradient(body.x, body.y, 6, body.x, body.y, glow * flicker);
    gradient.addColorStop(0, 'rgba(253,224,71,0.55)');
    gradient.addColorStop(0.4, 'rgba(217,249,157,0.22)');
    gradient.addColorStop(1, 'rgba(217,249,157,0)');
    context.fillStyle = gradient;
    context.fillRect(body.x - glow, body.y - glow, glow * 2, glow * 2);
    if (body.dead) return;
    // Wings, beating with the flap.
    const wing = Math.sin(state.time * 26) * 0.5 + 0.5;
    context.save();
    context.fillStyle = 'rgba(224,242,254,0.75)';
    context.translate(body.x, body.y - 6);
    context.rotate(-0.5 - wing * 0.5);
    ellipse(-6, -8, 9, 4);
    context.rotate(1 + wing);
    ellipse(6, -8, 9, 4);
    context.restore();
    // Body and head.
    context.save();
    context.shadowColor = '#fde047';
    context.shadowBlur = 14;
    context.fillStyle = '#365314';
    ellipse(body.x, body.y, 11, 8);
    context.fillStyle = '#facc15';
    ellipse(body.x + 7, body.y + 2, 7, 6);
    context.restore();
    context.fillStyle = '#111827';
    ellipse(body.x + 9, body.y - 1, 1.6, 1.6);
    // Shield ring.
    if (body.shield) {
      context.save();
      context.strokeStyle = 'rgba(96,165,250,0.9)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(body.x, body.y, 24 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      ellipse(p.x, p.y, p.size, p.size);
    }
    context.globalAlpha = 1;
  }

  /** HUD variant B: score on a glowing mushroom cap, light as a hanging lantern, best on a
   * wooden sign, and a small round pause button in the corner. No bar across the top. */
  function drawHud(state, best) {
    const palette = PALETTES[state.paletteIndex];
    const body = state.firefly;
    // The score mushroom cap, top centre.
    drawCap(FIELD.width / 2, 78, 300, 52, palette, true);
    glowText(String(state.score), FIELD.width / 2, 96, 58, '#fef9c3', palette.capGlow);
    text('SKOR', FIELD.width / 2, 46, 15, palette.muted, 'center', '600');
    // The wooden sign, top left.
    context.save();
    context.fillStyle = '#7c4a21';
    context.strokeStyle = '#5b3413';
    context.lineWidth = 3;
    const signX = 34;
    const signY = 34;
    const signW = 168;
    const signH = 62;
    context.beginPath();
    context.roundRect(signX, signY, signW, signH, 10);
    context.fill();
    context.stroke();
    context.fillStyle = '#a16207';
    context.fillRect(signX, signY + signH / 2 - 1, signW, 2);
    context.restore();
    text('Terbaik', signX + signW / 2, signY + 24, 16, '#fde68a', 'center', '600');
    text(String(best), signX + signW / 2, signY + 50, 24, '#fef3c7', 'center', '700');
    // The hanging lantern, top right: its golden liquid is the light meter.
    const lanternX = FIELD.width - 118;
    const lanternTop = 30;
    context.save();
    context.strokeStyle = '#8a6d3b';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(lanternX, 0);
    context.lineTo(lanternX, lanternTop);
    context.stroke();
    context.fillStyle = '#6b4f1d';
    context.fillRect(lanternX - 22, lanternTop, 44, 12);
    const jarH = 62;
    const jarY = lanternTop + 12;
    context.shadowColor = '#fbbf24';
    context.shadowBlur = 16;
    context.fillStyle = 'rgba(254,243,199,0.9)';
    context.beginPath();
    context.roundRect(lanternX - 26, jarY, 52, jarH, 14);
    context.fill();
    context.restore();
    const liquidH = Math.max(0, (jarH - 10) * body.light);
    context.fillStyle = body.light < 0.25 ? '#f97316' : '#f59e0b';
    context.beginPath();
    context.roundRect(lanternX - 22, jarY + jarH - 5 - liquidH, 44, liquidH, 8);
    context.fill();
    context.fillStyle = '#6b4f1d';
    context.fillRect(lanternX - 22, jarY + jarH - 4, 44, 8);
    text(`${Math.round(body.light * 100)}%`, lanternX, jarY + jarH + 22, 15, palette.text, 'center', '600');
    // The pause button, top right corner.
    context.save();
    context.fillStyle = 'rgba(10,18,38,0.6)';
    context.strokeStyle = palette.text;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(FIELD.width - 34, 40, 20, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = palette.text;
    context.fillRect(FIELD.width - 40, 31, 4, 18);
    context.fillRect(FIELD.width - 32, 31, 4, 18);
    context.restore();
    // Power-up timers, small, under the lantern.
    let line = 0;
    if (body.shield) {
      text('Perisai aktif', FIELD.width - 118, 158, 15, '#93c5fd', 'center', '600');
      line += 1;
    }
    if (state.elapsed < body.magnetUntil) {
      text(`Magnet ${Math.ceil(body.magnetUntil - state.elapsed)} dtk`, FIELD.width - 118, 158 + line * 20, 15, '#d8b4fe', 'center', '600');
      line += 1;
    }
    if (state.elapsed < body.slowUntil) {
      text(`Slow-mo ${Math.ceil(body.slowUntil - state.elapsed)} dtk`, FIELD.width - 118, 158 + line * 20, 15, '#67e8f9', 'center', '600');
    }
    // Low light warning.
    if (body.light > 0 && body.light < 0.25) {
      const blink = Math.sin(state.time * 8) > 0 ? 1 : 0.35;
      context.globalAlpha = blink;
      glowText('Cahaya hampir padam!', FIELD.width / 2, 170, 24, '#fca5a5', '#ef4444');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent, titleSize = 46) {
    const height = 150 + lines.length * PANEL.line + 90;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.fillStyle = 'rgba(5,8,20,0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTES[0].panel;
    context.globalAlpha = 0.96;
    context.beginPath();
    context.roundRect(x, y, PANEL.width, height, 18);
    context.fill();
    context.restore();
    glowText(title, FIELD.width / 2, y + 74, titleSize, '#fef9c3', accent || '#f2c94c');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 140 + i * PANEL.line, 22, '#e2e8f0', 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, '#f2c94c', 'center', '600');
  }

  function drawTitle(state, best) {
    const palette = PALETTES[0];
    // A few mushrooms framing the title.
    drawCap(200, FIELD.height - 30, 260, 70, palette, false);
    drawStem(200, FIELD.height - 30, FIELD.height, 70, palette);
    drawCap(1080, FIELD.height - 20, 220, 58, palette, false);
    drawStem(1080, FIELD.height - 20, FIELD.height, 60, palette);
    glowText('LUMEN', FIELD.width / 2, 210, 110, '#fef9c3', '#a3e635');
    text('Perjalanan Kunang Terakhir', FIELD.width / 2, 262, 30, palette.text, 'center');
    // The round START button.
    context.save();
    context.shadowColor = '#a3e635';
    context.shadowBlur = 26;
    context.fillStyle = '#65a30d';
    context.beginPath();
    context.arc(FIELD.width / 2, 430, 64, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.fillStyle = '#1a2e05';
    context.beginPath();
    context.arc(FIELD.width / 2, 430, 56, 0, Math.PI * 2);
    context.fill();
    text('MULAI', FIELD.width / 2, 442, 26, '#ecfccb', 'center', '700');
    text(`Skor Terbaik: ${best}`, FIELD.width / 2, 540, 22, palette.muted, 'center');
    text('Spasi / klik / sentuh untuk terbang  •  Kumpulkan bola cahaya agar cahayamu tidak padam',
      FIELD.width / 2, 580, 18, palette.muted, 'center');
    text('Capai skor 50 untuk sampai di Fajar', FIELD.width / 2, 612, 18, palette.muted, 'center');
  }

  function drawWin(state, best) {
    const lines = [
      `Skor ${state.score}  •  Terbaik ${best}`,
      `Cahaya terkumpul ${state.orbsCollected}`,
      '',
      'Fajar terbit. Hutan kembali terang.',
    ];
    // Fit the full win title inside the panel: shrink from 46 until it fits.
    const winTitle = 'FAJAR TIBA, Kamu Sampai!';
    let titleSize = 46;
    context.font = font(titleSize, '700');
    while (titleSize > 32 && context.measureText(winTitle).width > PANEL.width - 40) {
      titleSize -= 2;
      context.font = font(titleSize, '700');
    }
    drawPanel(winTitle, lines, 'Klik TERUS TERBANG untuk lanjut, atau tekan R untuk main lagi', '#fbbf24', titleSize);
    // The two buttons.
    context.save();
    context.fillStyle = '#65a30d';
    context.beginPath();
    context.roundRect(FIELD.width / 2 - 260, FIELD.height / 2 + 96, 240, 54, 12);
    context.fill();
    context.fillStyle = '#78350f';
    context.beginPath();
    context.roundRect(FIELD.width / 2 + 20, FIELD.height / 2 + 96, 240, 54, 12);
    context.fill();
    context.restore();
    text('TERUS TERBANG', FIELD.width / 2 - 140, FIELD.height / 2 + 131, 20, '#ecfccb', 'center', '700');
    text('MAIN LAGI', FIELD.width / 2 + 140, FIELD.height / 2 + 131, 20, '#fef3c7', 'center', '700');
  }

  /** Paint one frame: the field, the firefly, then the HUD or a panel for the screen. */
  function draw(state, screen, best) {
    const palette = PALETTES[state.paletteIndex];
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = palette.deep;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? shakeNoise(state.time, 1) * state.shake * 30 : 0;
    const shakeY = state.shake > 0 ? shakeNoise(state.time, 2) * state.shake * 30 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(state);
    for (const gap of state.gaps) {
      if (gap.active) drawGap(gap, palette, state.firefly.x);
    }
    for (const vine of state.vines) {
      if (vine.active) drawVine(vine, palette);
    }
    for (const orb of state.orbs) {
      if (orb.active) drawOrb(orb, palette, state.time);
    }
    for (const power of state.powers) {
      if (power.active) drawPower(power, state.time);
    }
    drawParticles(state);
    drawFirefly(state, palette);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Kunang-kunang menunggu.', `Skor ${state.score}`], 'Tekan P untuk lanjut  •  R untuk mulai lagi');
    } else if (screen === SCREEN_OVER) {
      const reason = state.firefly.deadReason === 'light'
        ? 'Cahayamu padam...'
        : 'Kamu menabrak!';
      drawPanel('GAME OVER', [
        reason,
        `Skor ${state.score}  •  Terbaik ${best}`,
        `Cahaya terkumpul ${state.orbsCollected}`,
      ], 'Tekan Spasi atau klik untuk MAIN LAGI');
    } else if (screen === SCREEN_WIN) {
      drawWin(state, best);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
