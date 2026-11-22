// main.js: boots Solmar, owns the game loop and the screens (title, play, paused,
// busted, wasted), and wires every system together. The world advances in fixed
// 1/60 s steps; ?shot=cover|street|mission|combat stages a screenshot scene instead
// of running the loop, paints it twice and sets window.__shotReady.

import * as THREE from 'three';
import { BUSTED_FINE, MAX_FRAME, MAX_HEALTH, STEP, WASTED_FINE } from './config.js';
import { createRandom } from './rng.js';
import { createCity } from './city.js';
import { createCharacter } from './character.js';
import { createCar, syncCarMesh, updatePlayerCar, updateTrafficCar } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createWanted } from './wanted.js';
import { createCombat } from './combat.js';
import { createMissions, MISSIONS } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_HORN, ACTION_PAUSE, createInput } from './input.js';
import { createCamera } from './camera.js';
import { clearSave, loadSave, saveGame } from './save.js';
import { stageShot } from './shots.js';
import { clamp, dist2 } from './utils.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const rng = createRandom(seed);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecfee);
scene.fog = new THREE.Fog(0xa5d6e8, 180, 540);
const camera3 = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(120, 190, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -220;
sun.shadow.camera.right = 220;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.0));

window.addEventListener('resize', () => {
  camera3.aspect = window.innerWidth / window.innerHeight;
  camera3.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- The world ----
const city = createCity(scene, rng);
const player = createCharacter(scene, city.locations.garage.x, city.locations.garage.z);
const peds = createPedestrians(scene, rng, city, 26);
const wanted = createWanted(scene, city, rng);
const combat = createCombat(scene);
const missions = createMissions(scene, city);
const hud = createHUD(document);
const audio = createAudio();
const input = createInput(canvas);
const cam = createCamera(camera3);

const world = {
  scene,
  camera3,
  city,
  rng,
  player,
  peds,
  wanted,
  combat,
  missions,
  hud,
  audio,
  input,
  cam,
  cars: [],
  car: null,
  onFoot: true,
  money: 0,
  health: MAX_HEALTH,
  screen: 'title',
  events: [],
  time: 0,
  lastDamageTime: -100,
  lastGunCrime: -100,
  saveTimer: 0,
  respawnAt: null,
};

function allCars() {
  return [...world.cars, ...wanted.state.cars];
}

function spawnTrafficCar() {
  const p = city.randomRoadPoint(rng);
  const axis = rng.chance(0.5) ? 'x' : 'z';
  const line = axis === 'x' ? p.z : p.x;
  const dir = rng.chance(0.5) ? 1 : -1;
  const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
  const car = createCar(scene, p.x, p.z, heading, { kind: 'traffic', axis, line, dir });
  car.speed = 8;
  world.cars.push(car);
  return car;
}

for (let i = 0; i < 14; i += 1) spawnTrafficCar();
for (const slot of city.parkingSlots) {
  if (!rng.chance(0.6)) continue;
  const car = createCar(scene, slot.x, slot.z, slot.heading, { kind: 'parked' });
  world.cars.push(car);
}
// A car waiting by the garage so the first job starts fast.
// The starter car waits on the road by the garage — parked at the kerb, not
// inside the block (the garage backs onto a building block).
const starterCar = createCar(scene, 4, -24, Math.PI, { kind: 'parked', color: 0xc0392b });
world.cars.push(starterCar);

cam.snap(player, Math.PI, false);

// Debug handle: lets a tester (or a curious player) inspect the live world.
window.__solmar = world;

// ---- Screens ----
const screens = {
  title: document.getElementById('title-screen'),
  pause: document.getElementById('pause-screen'),
  end: document.getElementById('end-screen'),
};
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.style.display = key === name ? 'flex' : 'none';
  if (name === 'play' || name === null) {
    for (const el of Object.values(screens)) el.style.display = 'none';
  }
}
function announce(message) {
  status.textContent = message;
}

function persist() {
  saveGame({ money: world.money, completed: missions.state.completed, x: player.x, z: player.z, health: world.health });
}

function startPlay(fromSave) {
  audio.ensure();
  showScreen(null);
  hud.show();
  world.screen = 'play';
  input.lockPointer();
  announce('Playing Solmar.');
  if (fromSave) hud.showBanner('Welcome back to Solmar', 'Your progress was saved', 2.5);
}

function applySave(data) {
  world.money = data.money;
  missions.state.completed = data.completed;
  world.health = data.health;
  if (data.x !== null && data.z !== null) player.setPosition(data.x, data.z, Math.PI);
  cam.snap(player, Math.PI, false);
}

document.getElementById('new-btn').addEventListener('click', () => {
  clearSave();
  world.money = 0;
  missions.state.completed = 0;
  world.health = MAX_HEALTH;
  player.setPosition(city.locations.garage.x, city.locations.garage.z, Math.PI);
  cam.snap(player, Math.PI, false);
  audio.click();
  startPlay(false);
  hud.showBanner('SOLMAR', 'Welcome to the city. Make yourself dangerous.', 3.5);
});
const continueBtn = document.getElementById('continue-btn');
const existingSave = loadSave();
if (existingSave) {
  continueBtn.style.display = 'inline-block';
  continueBtn.addEventListener('click', () => {
    applySave(existingSave);
    audio.click();
    startPlay(true);
  });
}
document.getElementById('resume-btn').addEventListener('click', () => {
  audio.click();
  resumeGame();
});
document.getElementById('mission-btn').addEventListener('click', () => {
  audio.click();
  const next = missions.nextIndex();
  if (next >= 0 && !missions.isActive()) {
    missions.start(next, world, world.events);
    resumeGame();
  }
});
document.getElementById('save-btn').addEventListener('click', () => {
  audio.click();
  persist();
  hud.showBanner('Game saved', '', 1.5);
});
document.getElementById('mute-btn').addEventListener('click', (e) => {
  audio.setMuted(!audio.isMuted());
  e.target.textContent = audio.isMuted() ? 'Sound: Off' : 'Sound: On';
});
document.getElementById('quit-btn').addEventListener('click', () => {
  audio.click();
  persist();
  wanted.clear();
  combat.clearEnemies();
  world.screen = 'title';
  hud.hide();
  showScreen('title');
  input.unlockPointer();
});

function pauseGame() {
  world.screen = 'paused';
  showScreen('pause');
  input.unlockPointer();
  document.getElementById('mission-btn').style.display = missions.nextIndex() >= 0 && !missions.isActive() ? 'inline-block' : 'none';
  announce('Paused.');
}
function resumeGame() {
  world.screen = 'play';
  showScreen(null);
  input.lockPointer();
  announce('Playing.');
}

function showEnd(title, sub) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-sub').textContent = sub;
  showScreen('end');
  input.unlockPointer();
}

function doBusted() {
  world.money = Math.max(0, world.money - BUSTED_FINE);
  wanted.clear();
  if (missions.isActive()) missions.fail(world, world.events, 'Busted by the cops');
  if (world.car) {
    world.car.kind = 'parked';
    world.car.speed = 0;
    world.car = null;
  }
  world.onFoot = true;
  player.setVisible(true);
  world.respawnAt = city.locations.policeStation;
  world.screen = 'busted';
  audio.busted();
  showEnd('BUSTED', `The Solmar PD caught up with you. Fine: $${BUSTED_FINE}. Press Enter to walk free.`);
  announce('Busted.');
}

function doWasted() {
  world.money = Math.max(0, world.money - WASTED_FINE);
  wanted.clear();
  if (missions.isActive()) missions.fail(world, world.events, 'Wasted');
  if (world.car) {
    world.car.kind = 'parked';
    world.car.speed = 0;
    world.car = null;
  }
  world.onFoot = true;
  player.setVisible(true);
  world.respawnAt = city.locations.hospital;
  world.screen = 'wasted';
  audio.missionFail();
  showEnd('WASTED', `Solmar General patched you up. Bill: $${WASTED_FINE}. Press Enter to walk out.`);
  announce('Wasted.');
}

function respawn() {
  const at = world.respawnAt ?? city.locations.garage;
  player.setPosition(at.x, at.z, Math.PI);
  world.health = MAX_HEALTH;
  cam.snap(player, Math.PI, false);
  world.screen = 'play';
  showScreen(null);
  hud.show();
  input.lockPointer();
}

// ---- Getting in and out of cars ----
function nearestCar(maxDist) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const car of allCars()) {
    const d2 = dist2(player.x, player.z, car.x, car.z);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  return best;
}

function enterExitCar() {
  if (!world.onFoot) {
    // Get out beside the car.
    const car = world.car;
    car.kind = 'parked';
    car.speed *= 0.2;
    world.car = null;
    world.onFoot = true;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    player.setPosition(car.x + sideX * 2.6, car.z + sideZ * 2.6, car.heading);
    player.setVisible(true);
    cam.snap(player, car.heading, false);
    audio.click();
    return;
  }
  // Start the next mission at the garage marker first.
  const marker = missions.marker();
  if (marker && marker.start && dist2(player.x, player.z, marker.x, marker.z) < 7 * 7) {
    missions.start(missions.nextIndex(), world, world.events);
    return;
  }
  const car = nearestCar(4.5);
  if (!car) return;
  if (car.kind === 'police') {
    const i = wanted.state.cars.indexOf(car);
    if (i !== -1) wanted.state.cars.splice(i, 1);
    world.cars.push(car);
    world.events.push({ type: 'crime', stars: 2, reason: 'stole a cop car' });
  } else if (car.kind === 'traffic') {
    world.events.push({ type: 'crime', stars: 1, reason: 'car jacked in traffic' });
  }
  car.kind = 'player';
  world.car = car;
  world.onFoot = false;
  player.setVisible(false);
  player.setPosition(car.x, car.z, car.heading);
  cam.snap(player, car.heading, true);
  audio.click();
  announce('Driving.');
}

// ---- Events ----
function processEvents() {
  for (const event of world.events) {
    if (event.type === 'crime') {
      // Ramming a cop car mid-chase happens every other step: count it rarely.
      if (event.reason === 'rammed a cop car') {
        if (world.time - (world.lastCopRam ?? -100) < 6) continue;
        world.lastCopRam = world.time;
      }
      const wasClean = wanted.state.stars === 0;
      wanted.addStars(event.stars);
      if (wasClean) hud.showBanner('WANTED', event.reason, 2);
    } else if (event.type === 'crash') {
      audio.crash(event.strength);
      // Crash damage to the player at most once per 1.5 s — a pile-up is one crash.
      if (!world.onFoot && event.strength > 14 && world.time - (world.lastCrashHurt ?? -100) > 1.5) {
        world.lastCrashHurt = world.time;
        world.health -= (event.strength - 14) * 1.5;
        world.lastDamageTime = world.time;
        hud.flashDamage();
      }
    } else if (event.type === 'damage') {
      world.health -= event.amount;
      world.lastDamageTime = world.time;
      hud.flashDamage();
    } else if (event.type === 'gunshot') {
      peds.scare(event.x, event.z, 30);
      if (!event.enemy && world.time - world.lastGunCrime > 8) {
        world.lastGunCrime = world.time;
        const wasClean = wanted.state.stars === 0;
        wanted.addStars(1);
        if (wasClean) hud.showBanner('WANTED', 'shots fired', 2);
      }
    } else if (event.type === 'ped-down') {
      peds.scare(event.x, event.z, 25);
    } else if (event.type === 'ped-shot') {
      const ped = event.ped;
      ped.state = 'down';
      ped.downTimer = 6;
      ped.parts.group.rotation.x = -Math.PI / 2;
      ped.parts.group.position.y = 0.2;
      wanted.addStars(1);
      peds.scare(event.x, event.z, 25);
    } else if (event.type === 'busted') {
      doBusted();
    } else if (event.type === 'evaded') {
      hud.showBanner('YOU LOST THEM', 'The heat is off — for now', 2.5);
      audio.pickup();
    } else if (event.type === 'mission-start') {
      hud.showBanner(event.name, event.briefing, 5);
      audio.pickup();
    } else if (event.type === 'mission-complete') {
      world.money += event.reward;
      persist();
      hud.showBanner('MISSION PASSED', `${event.name} — +$${event.reward.toLocaleString('en-US')}`, 3.5);
      audio.missionComplete();
      if (missions.state.completed >= MISSIONS.length) {
        setTimeout(() => hud.showBanner('YOU RULE SOLMAR', 'Every job done. The city is yours.', 5), 4000);
      }
    } else if (event.type === 'mission-failed') {
      hud.showBanner('MISSION FAILED', event.reason, 3);
      audio.missionFail();
    } else if (event.type === 'checkpoint') {
      audio.pickup();
      hud.showBanner(event.name, 'Drop complete', 1.5);
    }
  }
  world.events.length = 0;
  if (world.health <= 0 && (world.screen === 'play')) doWasted();
}

// ---- One fixed step of the world ----
function stepWorld(dt, scripted) {
  world.time += dt;
  const move = scripted ? scripted.move : input.move();
  const sprint = scripted ? scripted.sprint : input.sprint();
  const handbrake = scripted ? scripted.handbrake : input.handbrake();
  const shooting = scripted ? scripted.shooting : input.shooting();
  const fakeInput = {
    move: () => move,
    sprint: () => sprint,
    handbrake: () => handbrake,
  };

  // The player, on foot or behind the wheel.
  if (world.onFoot) {
    const yaw = cam.lookHeading();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const mx = fx * move.forward + rx * move.strafe;
    const mz = fz * move.forward + rz * move.strafe;
    player.update(dt, mx, mz, sprint, city, allCars());
    // Clicking fires, locked or not: the crosshair is centre-screen and the
    // shot goes where the camera looks. Pointer lock is only for mouse-look,
    // and it can fail (Esc, a denied request) — that must never disarm the gun.
    if (shooting) {
      combat.tryShoot(dt, camera3, player, city, { enemies: combat.enemies, peds: peds.list, cars: allCars() }, world.events);
    }
  } else if (world.car) {
    const car = world.car;
    if (car.damage >= 1) car.speed = 0;
    else updatePlayerCar(car, dt, fakeInput, city, allCars(), world.events);
    syncCarMesh(car, dt);
    player.setPosition(car.x, car.z, car.heading);
    player.speed = Math.abs(car.speed);
  }

  // Traffic keeps the city moving; thin it out far away, thicken it near the player.
  for (const car of world.cars) {
    if (car.kind === 'traffic') {
      if (dist2(car.x, car.z, player.x, player.z) > 230 * 230) {
        for (let tries = 0; tries < 10; tries += 1) {
          const p = city.randomRoadPoint(rng);
          const d2 = dist2(p.x, p.z, player.x, player.z);
          if (d2 > 70 * 70 && d2 < 130 * 130) {
            car.x = p.x;
            car.z = p.z;
            car.axis = rng.chance(0.5) ? 'x' : 'z';
            car.line = car.axis === 'x' ? p.z : p.x;
            car.dir = rng.chance(0.5) ? 1 : -1;
            car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
            car.speed = 8;
            break;
          }
        }
      }
      updateTrafficCar(car, dt, city, allCars(), rng);
      syncCarMesh(car, dt);
    } else if (car.kind === 'parked') {
      syncCarMesh(car, dt);
    }
  }

  peds.update(dt, city, world.onFoot ? null : world.car, world.events);
  wanted.update(dt, { x: player.x, z: player.z, speed: player.speed, onFoot: world.onFoot }, city, world.events);
  combat.update(dt, player, world.events);
  missions.update(dt, world, world.events);

  // Slow recovery when nobody has hurt the player for a while.
  if (world.time - world.lastDamageTime > 15 && world.health > 0 && world.health < MAX_HEALTH) {
    world.health = Math.min(MAX_HEALTH, world.health + 3 * dt);
  }

  // Autosave every 20 seconds of play.
  world.saveTimer += dt;
  if (world.saveTimer > 20 && world.screen === 'play') {
    world.saveTimer = 0;
    persist();
  }

  cam.update(dt, player, player.heading, !world.onFoot);
  processEvents();
}

// ---- The frame loop ----
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  const mouse = input.takeMouse();
  if (mouse.dx !== 0 || mouse.dy !== 0) cam.orbit(mouse.dx, mouse.dy);

  const actions = input.takeActions();
  if (world.screen === 'title') {
    if (actions & ACTION_CONFIRM) {
      if (existingSave) {
        applySave(existingSave);
        startPlay(true);
      } else {
        document.getElementById('new-btn').click();
      }
    }
  } else if (world.screen === 'play') {
    if (actions & ACTION_PAUSE) pauseGame();
    else if (actions & ACTION_ENTER) enterExitCar();
    else if (actions & ACTION_HORN) audio.horn();
  } else if (world.screen === 'paused') {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) resumeGame();
  } else if (world.screen === 'busted' || world.screen === 'wasted') {
    if (actions & ACTION_CONFIRM) respawn();
  }

  if (world.screen === 'title') {
    // Attract mode: the city lives while the camera drifts around the garage.
    cam.state.yaw += frameDt * 0.05;
    accumulator += frameDt;
    while (accumulator >= STEP) {
      stepWorld(STEP, { move: { forward: 0, strafe: 0 }, sprint: false, handbrake: false, shooting: false });
      accumulator -= STEP;
    }
  } else if (world.screen === 'play') {
    accumulator += frameDt;
    while (accumulator >= STEP) {
      stepWorld(STEP, null);
      accumulator -= STEP;
    }
    // Contextual prompt: what E does right now.
    if (world.onFoot) {
      const marker = missions.marker();
      if (marker && marker.start && dist2(player.x, player.z, marker.x, marker.z) < 7 * 7) {
        hud.setPrompt(`Press E — start "${MISSIONS[missions.nextIndex()].name}"`);
      } else if (nearestCar(4.5)) {
        hud.setPrompt('Press E — get in the car');
      } else {
        hud.setPrompt('');
      }
      hud.setCrosshair(input.isLocked());
    } else {
      hud.setPrompt(world.car && world.car.damage >= 1 ? "The car's totaled — press E to get out" : 'Press E — get out   ·   Space — handbrake');
      hud.setCrosshair(false);
    }
    audio.engine(world.onFoot ? 0 : clamp(Math.abs(world.car.speed) / 34, 0, 1), !world.onFoot);
    const nearestCop = wanted.nearestCopDistance(player.x, player.z);
    audio.siren(wanted.sirenOn() && nearestCop < 90, frameDt);
    hud.update(frameDt, world);
  }

  renderer.render(scene, camera3);
}

// ---- Screenshot mode ----
function runShot(name) {
  showScreen(null);
  stageShot(name, world, stepWorld);
  let painted = 0;
  function paint() {
    renderer.render(scene, camera3);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) {
  runShot(shot);
} else {
  showScreen('title');
  hud.hide();
  announce('Solmar. A sun-soaked open-world crime game. Press Enter or click New Game to start.');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.screen === 'play') pauseGame();
  });
  requestAnimationFrame(frame);
}
