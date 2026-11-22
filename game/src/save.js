// Save games in localStorage: money, mission progress, player position and
// health. Written on mission completion, on pause-save, on quit and by the
// autosave timer; read on the title screen for Continue.
import { CFG, GARAGE } from './config.js';

export function defaultSave() {
  return {
    money: 0,
    missionsDone: 0,
    x: GARAGE.x,
    z: GARAGE.z,
    heading: GARAGE.heading,
    health: CFG.PLAYER_HEALTH,
    savedAt: Date.now(),
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const save = defaultSave();
    if (Number.isFinite(data.money)) save.money = data.money;
    if (Number.isInteger(data.missionsDone)) save.missionsDone = data.missionsDone;
    if (Number.isFinite(data.x)) save.x = data.x;
    if (Number.isFinite(data.z)) save.z = data.z;
    if (Number.isFinite(data.heading)) save.heading = data.heading;
    if (Number.isFinite(data.health)) save.health = data.health;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    const data = { ...save, savedAt: Date.now() };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(CFG.SAVE_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}
