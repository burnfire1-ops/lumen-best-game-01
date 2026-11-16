// Boot and the one loop: input is taken once per frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// A flap press applies to the first step of its frame only, never twice. The game moves
// between five screens: title, play, paused, game over and the Dawn win. Slow-mo scales the
// step itself, so the whole world (and the light drain) slows together.
//
// ?seed=N fixes the random stream. ?shot=start|play|trap|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_ORB, EVENT_OVER, EVENT_POWER, EVENT_WIN } from './world.js';
import {
  ACTION_CONFIRM, ACTION_FLAP, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let pendingFlap = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    pendingFlap = false;
    screen = SCREEN_PLAY;
    audio.startCrickets();
    announce('Playing. Collect the light orbs or your glow dies.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.stopCrickets();
    audio.over();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    audio.win();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Dawn! You reached the light. Score ${world.state.score}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame();
      }
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_RESTART) {
        audio.unlock();
        startGame();
      } else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        if (screen === SCREEN_WIN) {
          // Continue the endless flight from the Dawn.
          screen = SCREEN_PLAY;
          audio.startCrickets();
          announce('Flying on past the Dawn.');
        } else {
          startGame();
        }
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) {
        startGame();
      }
    }
  }

  function step(flap) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, false, true);
      return;
    }
    const body = world.state.firefly;
    const slow = body.slowUntil > world.state.elapsed;
    const dt = slow ? STEP * 0.5 : STEP;
    const events = world.step(dt, flap, false);
    if (events & EVENT_ORB) audio.orb(world.state.elapsed);
    if (events & EVENT_POWER) audio.power();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_WIN) winGame();
    else if (events & EVENT_OVER) endGame();
    if (flap && !body.dead) audio.flap();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (actions & ACTION_FLAP) pendingFlap = true;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_WIN)) {
        step(first && pendingFlap);
        first = false;
        accumulator -= STEP;
      }
      pendingFlap = false;
    } else {
      accumulator = 0;
      pendingFlap = false;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the light drain unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A read-only handle for automated playtests (and nothing else): the live state,
  // the current screen, and the best score. It never drives the game.
  window.__lumen = {
    state: world.state,
    screen: () => screen,
    best: () => best,
  };

  announce('LUMEN. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
