// Keyboard and mouse state. One place reads the hardware; the game reads
// this module. Pointer lock is requested on canvas click and released by
// Esc; shooting works whether or not the pointer is locked.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false; // set true on a fresh left click, consumed by the game
    this.locked = false;
    this.lockFailed = false; // pointer lock denied or unavailable: shooting still works
    this._onKeyDown = (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    };
    this._onMouseDown = (e) => {
      // Only clicks on the canvas itself count as game input; clicks on
      // menus and buttons must not fire the pistol.
      if (e.button === 0 && e.target === this.canvas) {
        this.mouseDown = true;
        this.clicked = true;
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };
    this._onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
  }

  down(code) {
    return this.keys.has(code);
  }
  // Movement axes: x = strafe right, y = forward, each in [-1, 1].
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    return { x, y };
  }
  get sprint() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }
  get handbrake() {
    return this.down('Space');
  }
  // Ask for pointer lock; a rejected promise is caught, never thrown.
  requestLock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { this.lockFailed = true; });
    } catch {
      // Pointer lock unavailable (iframe, headless): the game still works.
      this.lockFailed = true;
    }
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // Mouse deltas since the last frame; calling this consumes them.
  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
  takeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('blur', this._onBlur);
  }
}
