// SOLMAR — entry point. Builds the renderer, the world and every system,
// runs the game loop, and owns the screens (title, pause, busted, wasted)
// plus crimes, saving and the debug handle the test harness reads.
import * as THREE from 'three';
import { CFG, GARAGE, LOCATIONS } from './config.js';
import { Rng } from './rng.js';
import { City } from './city.js';
import { VehicleManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { FollowCamera } from './camera.js';
import { Input } from './input.js';
import { loadSave, writeSave, clearSave, defaultSave } from './save.js';
import { shotFromUrl, stageShot } from './shots.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    const shot = shotFromUrl();
    this.seed = shot.seed;
    this.rng = new Rng(this.seed);
    this.state = 'title'; // title | playing | paused | busted | wasted
    this.money = 0;
    this.objective = '';
    this.time = 0;
    this.lastShotAt = -99;
    this.lastCrimeAt = {};
    this.autosaveTimer = 0;
    this.prevKeys = new Set();
    this.shotName = shot.name;

    // --- Renderer / scene ---
    // Note: antialias is off on purpose — MSAA costs far more than it buys
    // in a software renderer, and the game stays crisp without it.
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false });
    // Test aids (no effect on normal play): ?lowres=1 renders at half
    // resolution and ?noshadow=1 skips the shadow pass, so the game stays
    // interactive on a software renderer while it is being tested.
    const testParams = new URLSearchParams(window.location.search);
    this.renderer.setPixelRatio(
      testParams.get('lowres') === '1' ? 0.25 : Math.min(window.devicePixelRatio || 1, 1.5),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = testParams.get('noshadow') !== '1';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c5e8);
    this.scene.fog = new THREE.Fog(0xa8d0e6, 220, 620);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
    sun.position.set(140, 200, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -220;
    sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220;
    sun.shadow.camera.bottom = -220;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    // --- World and systems ---
    this.city = new City(this.scene, this.seed);
    this.vehicles = new VehicleManager(this.scene, this.city, this.rng);
    this.starterCar = this.vehicles.populate(GARAGE.x, GARAGE.z);
    this.peds = new PedestrianManager(this.scene, this.city, this.rng);
    this.peds.populate();
    this.peds.onRunOver = () => this.commitCrime('runover', 1, 3);
    this.player = new Player(this.scene);
    this.player.setPosition(GARAGE.x, GARAGE.z, GARAGE.heading);
    this.combat = new Combat(this.scene, this.city);
    this.police = new Police(this.scene, this.city, this.vehicles, this.rng);
    this.police.onBusted = () => this.showEnd('busted');
    this.missions = new MissionManager(this.scene);
    this.missions.onBanner = (t, s) => this.hud.showBanner(t, s);
    this.missions.onObjective = (t) => { this.objective = t; };
    this.missions.onComplete = (m) => this.onMissionComplete(m);
    this.missions.onFailed = () => {
      this.sound.missionFailed();
      this.hud.showBanner('MISSION FAILED', 'Too slow — try again.');
    };
    this.missions.onNeedEnemies = () => this.combat.spawnEnemies(MissionManager.enemySpots());
    this.missions.onNeedContact = () => {
      const c = this.peds.spawn(52, -52, { isContact: true });
      c.state = 'wait';
      return c;
    };
    this.missions.onSetStars = (n) => this.police.setStars(n);
    this.hud = new Hud();
    this.sound = new Sound();
    this.followCam = new FollowCamera(this.camera, this.city);
    this.input = new Input($('game'));
    this.vehicles.onCrash = (s) => this.sound.crash(s);

    this._wireScreens();
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    // Debug handle for the test harness (read-only state).
    window.__solmar = {
      game: this,
      get state() { return this.game.state; },
      get money() { return this.game.money; },
      get stars() { return this.game.police.stars; },
      get health() { return this.game.player.health; },
      get missionsDone() { return this.game.missions.missionsDone; },
      get inCar() { return !!this.game.player.car; },
      get speed() { return this.game.player.car ? this.game.player.car.speed : 0; },
      get playerPos() { return { x: this.game.player.x, z: this.game.player.z }; },
      get objective() { return this.game.objective; },
      get timer() { return this.game.missions.current ? this.game.missions.current.timer : null; },
      get camYaw() { return this.game.followCam.yaw; },
      get copCount() { return this.game.police.cars.length; },
      get trafficCount() { return this.game.vehicles.traffic.length; },
      get pedCount() { return this.game.peds.peds.length; },
      get nearestTrafficCar() {
        const p = this.game.player;
        let best = null;
        let bd = Infinity;
        for (const c of this.game.vehicles.traffic) {
          const d = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
          if (d < bd) { bd = d; best = c; }
        }
        return best ? { x: best.x, z: best.z } : null;
      },
      get nearestPed() {
        const p = this.game.player;
        let best = null;
        let bd = Infinity;
        for (const ped of this.game.peds.peds) {
          if (ped.down) continue;
          const d = (ped.x - p.x) ** 2 + (ped.z - p.z) ** 2;
          if (d < bd) { bd = d; best = ped; }
        }
        return best ? { x: best.x, z: best.z, state: best.state } : null;
      },
    };

    // A screenshot scene skips the title screen entirely.
    if (this.shotName) {
      stageShot(this, this.shotName);
    }
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  _wireScreens() {
    const save = loadSave();
    $('btn-continue').disabled = !save;
    if (save) {
      $('continue-info').textContent =
        `Continue — $${save.money.toLocaleString('en-US')} · ${save.missionsDone} of 5 missions done`;
    }
    $('btn-new').addEventListener('click', () => {
      this.sound.ensure();
      this.sound.click();
      this.startNewGame();
    });
    $('btn-continue').addEventListener('click', () => {
      this.sound.ensure();
      this.sound.click();
      this.continueGame();
    });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-save').addEventListener('click', () => {
      this.saveGame();
      this.hud.toast('Game saved.');
    });
    $('btn-quit').addEventListener('click', () => {
      this.saveGame();
      this.toTitle();
    });
    $('btn-end').addEventListener('click', () => this.respawn());
    $('game').addEventListener('mousedown', () => {
      this.sound.ensure();
      if (this.state === 'playing') this.input.requestLock();
    });
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _showOnly(screenId) {
    for (const id of ['title-screen', 'pause-screen', 'end-screen']) {
      $(id).classList.toggle('hidden', id !== screenId);
    }
    $('hud').classList.toggle('hidden', screenId === 'title-screen');
  }

  startNewGame({ skipIntro = false } = {}) {
    clearSave();
    this.money = 0;
    this.player.health = CFG.PLAYER_HEALTH;
    this.player.setPosition(GARAGE.x, GARAGE.z, GARAGE.heading);
    this.player.car = null;
    this.player.sync();
    this.police.setStars(0);
    this.police.busted = false;
    this.missions.startFromSave(0);
    this.state = 'playing';
    this._showOnly(null);
    if (!skipIntro) this.hud.showBanner('SOLMAR', 'Marco Delgado is back in town. Ray is waiting.', 4200);
  }

  continueGame() {
    const save = loadSave() || defaultSave();
    this.money = save.money;
    this.player.health = save.health;
    this.player.setPosition(save.x, save.z, save.heading);
    this.player.car = null;
    this.player.sync();
    this.police.setStars(0);
    this.police.busted = false;
    this.missions.startFromSave(save.missionsDone);
    this.state = 'playing';
    this._showOnly(null);
    this.hud.showBanner('WELCOME BACK', 'Solmar missed you.', 3000);
  }

  toTitle() {
    this.state = 'title';
    this.input.releaseLock();
    this._showOnly('title-screen');
    const save = loadSave();
    $('btn-continue').disabled = !save;
    if (save) {
      $('continue-info').textContent =
        `Continue — $${save.money.toLocaleString('en-US')} · ${save.missionsDone} of 5 missions done`;
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this._showOnly('pause-screen');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._showOnly(null);
  }

  showEnd(kind) {
    this.state = kind;
    this.input.releaseLock();
    this.sound.busted();
    const lost = Math.floor(this.money * 0.15);
    this.money -= lost;
    $('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    $('end-sub').textContent =
      kind === 'busted'
        ? `The Solmar police took you in. You lost $${lost.toLocaleString('en-US')}.`
        : `You went down in Solmar. The hospital bill is $${lost.toLocaleString('en-US')}.`;
    $('btn-end').textContent = 'Back on the streets';
    this._showOnly('end-screen');
    this.saveGame();
  }

  respawn() {
    this.player.health = CFG.PLAYER_HEALTH;
    this.player.setPosition(GARAGE.x, GARAGE.z, GARAGE.heading);
    if (this.player.car) {
      this.player.car.speed = 0;
      this.player.car = null;
    }
    this.player.sync();
    this.police.setStars(0);
    this.police.busted = false;
    this.police.bustedProgress = 0;
    this.state = 'playing';
    this._showOnly(null);
  }

  saveGame() {
    return writeSave({
      money: this.money,
      missionsDone: this.missions.missionsDone,
      x: this.player.x,
      z: this.player.z,
      heading: this.player.heading,
      health: this.player.health,
    });
  }

  onMissionComplete(mission) {
    this.money += mission.payout;
    this.sound.missionComplete();
    this.hud.showBanner('MISSION COMPLETE', `${mission.name} — +$${mission.payout.toLocaleString('en-US')}`);
    this.saveGame();
    if (this.missions.storyDone) {
      setTimeout(() => {
        this.hud.showBanner('STORY COMPLETE', 'Solmar is yours now. Free roam.', 5000);
      }, 3600);
    }
  }

  commitCrime(kind, stars, cooldownSec) {
    const now = this.time;
    if (this.lastCrimeAt[kind] && now - this.lastCrimeAt[kind] < cooldownSec) return;
    this.lastCrimeAt[kind] = now;
    this.police.addStars(stars);
    this.hud.toast(kind === 'runover' ? 'Pedestrian down — the cops are coming' : 'Wanted level increased');
  }

  enterCar(car, { quiet = false } = {}) {
    const crime = this.vehicles.steal(car);
    if (crime === 'traffic') {
      // The driver jumps out and runs.
      const d = this.peds.spawn(car.x + 2, car.z, {});
      this.peds.fleeFrom(d, car.x, car.z, 6);
      if (!quiet) this.commitCrime('steal', 1, 0);
    } else if (crime === 'police') {
      this.police.releaseCar(car);
      if (!quiet) this.commitCrime('stealCop', 2, 0);
    }
    this.player.car = car;
    this.player.sync();
    this.sound.click();
  }

  exitCar() {
    const car = this.player.car;
    if (!car) return;
    const sideX = Math.cos(car.heading);
    const sideZ = -Math.sin(car.heading);
    let nx = car.x + sideX * 2.6;
    let nz = car.z + sideZ * 2.6;
    const fixed = this.city.collideCircle(nx, nz, CFG.PLAYER_RADIUS);
    this.player.setPosition(fixed.x, fixed.z, car.heading);
    this.player.car = null;
    car.speed *= 0.4;
    this.player.sync();
  }

  shoot() {
    if (this.player.car || this.state !== 'playing') return;
    if (this.time - this.lastShotAt < 0.25) return;
    this.lastShotAt = this.time;
    const origin = this.player.gunPosition();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // The camera looks down at the player from behind, so its raw forward
    // direction points into the ground a few units ahead. Shots travel
    // horizontally from the gun, the way the crosshair reads.
    dir.y = 0;
    dir.normalize();
    const targets = [];
    for (const ped of this.peds.peds) targets.push({ group: ped.group, ref: ped, kind: 'ped' });
    for (const e of this.combat.enemies) targets.push({ group: e.group, ref: e, kind: 'enemy' });
    for (const o of this.police.officers) targets.push({ group: o.mesh, ref: o, kind: 'officer' });
    const { hit, point } = this.combat.playerShot(
      origin,
      { x: dir.x, y: dir.y, z: dir.z },
      targets,
    );
    this.sound.gunshot();
    this.player.heading = Math.atan2(dir.x, dir.z);
    // A shot in earshot of the law draws heat.
    if (this.police.nearestCop !== undefined && this.police.nearestCop < 45) {
      this.commitCrime('shooting', 1, 5);
    }
    if (!hit) return;
    const entry = targets.find((t) => t.ref === hit);
    if (!entry) return;
    if (entry.kind === 'ped') {
      const killed = this.peds.shoot(hit, CFG.SHOT_DAMAGE);
      this.peds.fleeAllNear(hit.x, hit.z, 25, 5);
      if (killed) this.commitCrime('kill', 1, 0);
    } else if (entry.kind === 'enemy') {
      hit.health -= CFG.SHOT_DAMAGE;
      if (hit.health <= 0 && !hit.down) {
        hit.down = true;
        hit.group.rotation.x = -Math.PI / 2;
        hit.group.position.y = 0.3;
        this.hud.toast('Viper down');
      }
    } else if (entry.kind === 'officer') {
      this.scene.remove(hit.mesh);
      this.police.officers = this.police.officers.filter((o) => o !== hit);
      this.commitCrime('killCop', 2, 0);
    }
    void point;
  }

  _edgePressed(code) {
    return this.input.down(code) && !this.prevKeys.has(code);
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const input = this.input;

    // The world stays alive behind the title screen.
    if (this.state === 'title') {
      this.followCam.orbit(dt, this.time);
      this.vehicles.updateTraffic(dt, { x: 0, z: 0 }, this.peds.peds);
      this.peds.update(dt, { x: 0, z: 0 }, false, 0);
      this.renderer.render(this.scene, this.camera);
      this.prevKeys = new Set(input.keys);
      return;
    }
    if (this.state === 'paused' || this.state === 'busted' || this.state === 'wasted') {
      this.renderer.render(this.scene, this.camera);
      this.prevKeys = new Set(input.keys);
      return;
    }

    // --- Playing ---
    const player = this.player;
    if (this._edgePressed('Escape') || this._edgePressed('KeyP')) this.pause();
    if (this._edgePressed('KeyM')) {
      this.sound.muted = !this.sound.muted;
      this.hud.toast(this.sound.muted ? 'Sound off' : 'Sound on');
    }
    if (this._edgePressed('KeyE')) {
      if (player.car) this.exitCar();
      else {
        const car = this.vehicles.nearestCar(player.x, player.z, 4.5);
        if (car) this.enterCar(car);
      }
    }
    if (this._edgePressed('KeyH') && player.car) this.sound.horn();

    // Mouse look.
    const { dx, dy } = input.takeMouse();
    this.followCam.addMouse(dx, dy);
    player.camYaw = this.followCam.yaw + Math.PI;

    // Move.
    if (player.car) {
      this.vehicles.drivePlayer(player.car, input, dt);
      player.x = player.car.x;
      player.z = player.car.z;
      player.heading = player.car.heading;
      this.sound.setEngine(Math.min(1, Math.abs(player.car.speed) / CFG.CAR_TOP_SPEED));
      this._checkRunOver();
    } else {
      player.updateOnFoot(input, dt, this.city);
      this.sound.setEngine(null);
      if (input.mouseDown && (input.locked || input.lockFailed)) this.shoot();
    }
    input.takeClick();

    // Systems.
    this.vehicles.updateTraffic(dt, player, this.peds.peds);
    this.peds.update(dt, player, !!player.car, player.car ? Math.abs(player.car.speed) : 0);
    this.police.update(dt, player, !!player.car);
    this.combat.update(dt);
    this.combat.updateEnemies(dt, player, (dmg) => {
      player.hurt(dmg, this.time);
      if (player.health <= 0) this.showEnd('wasted');
    });
    this.missions.update(dt, { player, police: this.police, combat: this.combat });
    player.regen(dt, this.time);
    this.sound.setSiren(this.police.stars > 0 && this.police.nearestCop < 80, dt);

    // Camera.
    const focus = player.car
      ? { x: player.car.x, y: 1.2, z: player.car.z }
      : { x: player.x, y: 1.2, z: player.z };
    this.followCam.update(dt, focus, player.heading, !!player.car, player.car ? player.car.speed : 0);

    // Location banner.
    const loc = this.city.locationAt(player.x, player.z);
    if (loc) this.hud.showLocation(loc);

    // Autosave.
    this.autosaveTimer += dt;
    if (this.autosaveTimer > CFG.AUTOSAVE_EVERY) {
      this.autosaveTimer = 0;
      this.saveGame();
    }

    // HUD.
    let hint = '';
    if (player.car) hint = 'E — Get out · Space — Handbrake · H — Horn · P — Pause';
    else if (this.vehicles.nearestCar(player.x, player.z, 4.5)) hint = 'E — Get in the car';
    else hint = 'WASD — Move · Shift — Sprint · Click — Shoot · E — Enter car';
    this.hud.update({
      money: this.money,
      stars: this.police.stars,
      evading: this.police.evading,
      health: player.health,
      speed: player.car ? player.car.speed : 0,
      inCar: !!player.car,
      objective: this.objective,
      timer: this.missions.current ? this.missions.current.timer : null,
      bustedProgress: this.police.bustedProgress,
      hint,
      playerX: player.x,
      playerZ: player.z,
      heading: player.heading,
      beacon: this.missions.beaconTarget(),
      cops: this.police.copPositions(),
    });

    this.renderer.render(this.scene, this.camera);
    this.prevKeys = new Set(input.keys);
  }

  _checkRunOver() {
    const car = this.player.car;
    if (!car || Math.abs(car.speed) < 5) return;
    for (const ped of this.peds.peds) {
      if (ped.down) continue;
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        this.peds.knockDown(ped);
        this.peds.fleeAllNear(ped.x, ped.z, 30, 5);
        this.sound.crash(0.5);
      }
    }
  }
}

new Game();
