// input.js: keyboard, mouse and pointer-lock camera orbit. The game reads held keys
// every frame and edge-triggered actions (enter car, pause, shoot) through takeActions().

export const ACTION_ENTER = 1; // E: get in / out of a car
export const ACTION_PAUSE = 2; // Esc or P
export const ACTION_CONFIRM = 4; // Enter: menus
export const ACTION_SHOOT = 8; // mouse click (held)
export const ACTION_HORN = 16; // H

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') actions |= ACTION_ENTER;
    if (e.code === 'Escape' || e.code === 'KeyP') actions |= ACTION_PAUSE;
    if (e.code === 'Enter') actions |= ACTION_CONFIRM;
    if (e.code === 'KeyH') actions |= ACTION_HORN;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    mouseDX += e.movementX;
    mouseDY += e.movementY;
  }
  function onMouseDown(e) {
    if (e.button === 0) mouseDown = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) mouseDown = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    /** Held-key movement: {forward, strafe} in [-1, 1]. */
    move() {
      const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { forward, strafe };
    },
    sprint() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    handbrake() {
      return keys.has('Space');
    },
    shooting() {
      return mouseDown;
    },
    isLocked() {
      return locked;
    },
    lockPointer() {
      if (locked) return;
      // requestPointerLock returns a promise in modern Chrome; it rejects when
      // the call has no user gesture behind it (or the browser denies it).
      // A failed lock must never surface as an uncaught error — the game plays
      // fine with the mouse unlocked, it just doesn't orbit the camera.
      let p;
      try {
        p = canvas.requestPointerLock();
      } catch {
        return;
      }
      if (p && typeof p.catch === 'function') p.catch(() => {});
    },
    unlockPointer() {
      if (locked) document.exitPointerLock();
    },
    /** Mouse movement since the last frame, consumed. */
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    /** Edge-triggered actions since the last frame, consumed. */
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    /** For menus: is Enter or Space held right now. */
    confirmHeld() {
      return keys.has('Enter') || keys.has('Space');
    },
  };
}
