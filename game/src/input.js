// Keyboard and pointer input for a one-button game. A flap is a one-shot action: every press
// is queued as a flag and taken once by the loop, so a press between two frames is never lost
// and never counted twice. Space, click and tap all flap; P pauses, M mutes, R restarts.

export const ACTION_FLAP = 1;
export const ACTION_CONFIRM = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;

const FLAP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const CONFIRM_KEYS = new Set(['Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);
const RESTART_KEYS = new Set(['KeyR']);

export function createInput(target) {
  let actions = 0;

  function queue(flag, event) {
    actions |= flag;
    if (event) event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (FLAP_KEYS.has(event.code)) queue(ACTION_FLAP | ACTION_CONFIRM, event);
    else if (CONFIRM_KEYS.has(event.code)) queue(ACTION_CONFIRM, event);
    else if (PAUSE_KEYS.has(event.code)) queue(ACTION_PAUSE, event);
    else if (MUTE_KEYS.has(event.code)) queue(ACTION_MUTE, event);
    else if (RESTART_KEYS.has(event.code)) queue(ACTION_RESTART, event);
  });
  // A pointer press is a flap (and a confirm on menus): the whole canvas is the button.
  target.addEventListener('pointerdown', (event) => {
    queue(ACTION_FLAP | ACTION_CONFIRM, event);
  });
  // Buttons drawn on the canvas are hit-tested by the game, which calls this.
  return {
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Queue an action from a canvas button the pointer landed on. */
    press(flag) {
      actions |= flag;
    },
  };
}
