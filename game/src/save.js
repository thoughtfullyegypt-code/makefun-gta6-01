// save.js: persistence in localStorage — money, finished missions, where the player
// stood and their health. A save that fails to parse is ignored, never fatal.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      money: typeof data.money === 'number' ? data.money : 0,
      completed: typeof data.completed === 'number' ? data.completed : 0,
      x: typeof data.x === 'number' ? data.x : null,
      z: typeof data.z === 'number' ? data.z : null,
      health: typeof data.health === 'number' ? data.health : 100,
    };
  } catch {
    return null;
  }
}

export function saveGame(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
