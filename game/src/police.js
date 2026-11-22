// The wanted system: stars, police cars that route across the grid and
// chase, foot officers who make arrests, BUSTED, and escaping by distance.
// Chases are tuned not to spiral: hit cooldowns stop one collision from
// cascading into an unstoppable pile-up.
import * as THREE from 'three';
import { CFG, ROAD_LINES } from './config.js';
import { clamp, angleDelta } from './rng.js';
import { routeOnGrid, nearestRoadCoord } from './city.js';
import { buildCarMesh } from './vehicles.js';

function copCountFor(stars) {
  if (stars <= 0) return 0;
  if (stars <= 2) return 2;
  if (stars <= 4) return 3;
  return 4;
}
function officerCountFor(stars) {
  if (stars <= 2) return 0;
  if (stars <= 4) return 2;
  return 4;
}

function makeOfficerMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1e2a4a, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), navy);
  torso.position.y = 1.1;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.7;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.16, 10), navy);
  cap.position.y = 1.86;
  const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.26);
  const legL = new THREE.Mesh(legGeo, navy);
  legL.position.set(-0.16, 0.38, 0);
  const legR = new THREE.Mesh(legGeo, navy);
  legR.position.set(0.16, 0.38, 0);
  group.add(torso, head, cap, legL, legR);
  return { group, legL, legR };
}

export class Police {
  constructor(scene, city, vehicles, rng) {
    this.scene = scene;
    this.city = city;
    this.vehicles = vehicles;
    this.rng = rng;
    this.stars = 0;
    // The player's last known position, refreshed every update. It starts
    // at the city centre so a wanted level set before the first frame
    // (screenshot staging) can still place patrol cars.
    this.playerPos = { x: 0, z: 0 };
    this.cars = []; // {car, route, routeIdx, repathTimer, stuckTimer, hitCooldown}
    this.officers = []; // {mesh, legL, legR, x, z, heading, phase}
    this.evadeTimer = 0;
    this.starFallTimer = 0;
    this.evading = false;
    this.bustedProgress = 0;
    this.busted = false;
    this.lightTimer = 0;
    this.onBusted = null;
  }

  addStars(n) {
    this.setStars(Math.min(CFG.MAX_STARS, this.stars + n));
  }
  setStars(n) {
    const next = clamp(Math.round(n), 0, CFG.MAX_STARS);
    if (next === this.stars) return;
    this.stars = next;
    this.evadeTimer = 0;
    this.starFallTimer = 0;
    this.evading = false;
    this.bustedProgress = 0;
    this._matchForce();
  }

  _matchForce() {
    // Spawn or remove police cars and officers to match the wanted level.
    while (this.cars.length < copCountFor(this.stars)) this._spawnCar();
    while (this.cars.length > copCountFor(this.stars)) {
      const c = this.cars.pop();
      this.vehicles.removeCar(c.car);
    }
    while (this.officers.length < officerCountFor(this.stars)) this._spawnOfficer();
    while (this.officers.length > officerCountFor(this.stars)) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }
  }

  _spawnPointNear(player, minDist, maxDist) {
    // A road point at a fair distance from the player.
    for (let i = 0; i < 12; i++) {
      const p = this.city.randomRoadPoint(this.rng);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d >= minDist && d <= maxDist) return p;
    }
    return { x: player.x + 80, z: player.z };
  }

  _spawnCar() {
    const p = this._spawnPointNear(this.playerPos, 60, 130);
    const mesh = buildCarMesh(0xffffff, true);
    const car = {
      mesh: mesh.group, wheels: mesh.wheels, bodyMat: mesh.bodyMat,
      x: p.x, z: p.z, heading: 0, speed: 0, damage: 0,
      isPolice: true, isTraffic: false, isParked: false,
      hasDriver: true, radius: 2.0,
      sync() {
        this.mesh.position.set(this.x, 0, this.z);
        this.mesh.rotation.y = this.heading;
        for (const w of this.wheels) w.rotation.x += this.speed * 0.06;
      },
    };
    car.sync();
    this.scene.add(car.mesh);
    this.vehicles.cars.push(car);
    this.cars.push({ car, route: [], routeIdx: 0, repathTimer: 0, stuckTimer: 0, hitCooldown: 0 });
  }

  _spawnOfficer() {
    const p = this._spawnPointNear(this.playerPos, 25, 60);
    const parts = makeOfficerMesh();
    parts.group.position.set(p.x, 0, p.z);
    this.scene.add(parts.group);
    this.officers.push({ ...parts, x: p.x, z: p.z, heading: 0, phase: 0 });
  }

  // The player stole one of our cars: it is no longer police-controlled.
  releaseCar(car) {
    const entry = this.cars.find((c) => c.car === car);
    if (!entry) return;
    this.cars = this.cars.filter((c) => c !== entry);
    // A replacement joins the chase after a short delay.
    entry.replacementTimer = 6;
    this._pendingReplacement = entry;
  }

  update(dt, player, playerInCar) {
    this.playerPos = { x: player.x, z: player.z };
    if (this.stars <= 0) {
      this.evading = false;
      this.bustedProgress = 0;
      return;
    }
    // Flash the light bars.
    this.lightTimer += dt;
    const phase = Math.floor(this.lightTimer * 4) % 2 === 0;
    for (const c of this.cars) {
      const bar = c.car.mesh.userData.lightBar;
      if (!bar) continue;
      bar.redMat.emissiveIntensity = phase ? 2.2 : 0.2;
      bar.blueMat.emissiveIntensity = phase ? 0.2 : 2.2;
    }
    // Replacement for a stolen police car.
    if (this._pendingReplacement) {
      this._pendingReplacement.replacementTimer -= dt;
      if (this._pendingReplacement.replacementTimer <= 0) {
        this._pendingReplacement = null;
        this._matchForce();
      }
    }
    let nearestCop = Infinity;
    for (const c of this.cars) {
      const d = Math.hypot(c.car.x - player.x, c.car.z - player.z);
      if (d < nearestCop) nearestCop = d;
      this._updateCar(c, dt, player, playerInCar);
    }
    for (const o of this.officers) {
      const d = Math.hypot(o.x - player.x, o.z - player.z);
      if (d < nearestCop) nearestCop = d;
      this._updateOfficer(o, dt, player, playerInCar);
    }
    this.nearestCop = nearestCop;

    // --- Busted? ---
    let bustRate = 0;
    if (!playerInCar) {
      for (const o of this.officers) {
        if (Math.hypot(o.x - player.x, o.z - player.z) < 2.4) bustRate = 1 / CFG.BUSTED_FOOT_TIME;
      }
    } else if (player.car && Math.abs(player.car.speed) < 1) {
      for (const c of this.cars) {
        if (Math.hypot(c.car.x - player.x, c.car.z - player.z) < 7) bustRate = 1 / CFG.BUSTED_CAR_TIME;
      }
    }
    if (bustRate > 0) {
      this.bustedProgress += bustRate * dt;
      if (this.bustedProgress >= 1 && !this.busted) {
        this.busted = true;
        if (this.onBusted) this.onBusted();
      }
    } else {
      this.bustedProgress = Math.max(0, this.bustedProgress - dt * 0.8);
    }

    // --- Escape: far from every cop for a while, then stars fall. ---
    if (nearestCop > CFG.EVADE_DISTANCE) {
      this.evadeTimer += dt;
      if (this.evadeTimer > CFG.EVADE_WAIT) {
        this.evading = true;
        this.starFallTimer += dt;
        if (this.starFallTimer > CFG.STAR_FALL_EVERY) {
          this.starFallTimer = 0;
          this.setStars(this.stars - 1);
        }
      }
    } else {
      this.evadeTimer = 0;
      this.starFallTimer = 0;
      this.evading = false;
    }
  }

  _updateCar(c, dt, player, playerInCar) {
    const car = c.car;
    c.hitCooldown = Math.max(0, c.hitCooldown - dt);
    c.repathTimer -= dt;
    const distToPlayer = Math.hypot(car.x - player.x, car.z - player.z);
    // Direct pursuit up close; grid route from further away.
    let tx;
    let tz;
    if (distToPlayer < 30) {
      tx = player.x;
      tz = player.z;
    } else {
      if (c.repathTimer <= 0 || c.routeIdx >= c.route.length) {
        c.route = routeOnGrid(car.x, car.z, player.x, player.z);
        c.routeIdx = 0;
        c.repathTimer = 2.5;
      }
      // Skip waypoints already passed.
      while (c.routeIdx < c.route.length) {
        const [wx, wz] = c.route[c.routeIdx];
        if (Math.hypot(wx - car.x, wz - car.z) < 8) c.routeIdx++;
        else break;
      }
      if (c.routeIdx < c.route.length) {
        [tx, tz] = c.route[c.routeIdx];
      } else {
        tx = player.x;
        tz = player.z;
      }
    }
    const desired = Math.atan2(tx - car.x, tz - car.z);
    const turn = angleDelta(car.heading, desired);
    car.heading += clamp(turn, -2.6 * dt, 2.6 * dt);
    // Slow down for sharp turns so the chase looks driven, not sliding.
    const aligned = Math.abs(turn) < 0.5;
    const top = aligned ? CFG.POLICE_TOP_SPEED : 13;
    if (car.speed < top) car.speed = Math.min(top, car.speed + 18 * dt);
    else car.speed = Math.max(top, car.speed - 20 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    const fixed = this.city.collideCircle(nx, nz, car.radius);
    car.x = fixed.x;
    car.z = fixed.z;
    // A hard wall hit costs speed (with a cooldown so one crash cannot
    // cascade into a pile-up of repeated hits).
    if ((fixed.x !== nx || fixed.z !== nz) && c.hitCooldown <= 0 && car.speed > 8) {
      car.speed *= 0.4;
      c.hitCooldown = 1.0;
    }
    // Stuck against something while far from the player: respawn nearby.
    const moved = Math.hypot(car.x - before.x, car.z - before.z);
    if (car.speed > 4 && moved < car.speed * dt * 0.25) {
      c.stuckTimer += dt;
      if (c.stuckTimer > 3 && distToPlayer > 40) {
        const p = this._spawnPointNear(player, 50, 90);
        car.x = p.x;
        car.z = p.z;
        car.speed = 8;
        c.stuckTimer = 0;
        c.repathTimer = 0;
      }
    } else {
      c.stuckTimer = 0;
    }
    car.sync();
  }

  _updateOfficer(o, dt, player, playerInCar) {
    const dx = player.x - o.x;
    const dz = player.z - o.z;
    const dist = Math.hypot(dx, dz);
    // Officers cannot catch a moving car: they hold position and watch.
    const playerSpeed = player.car ? Math.abs(player.car.speed) : 0;
    if (playerInCar && playerSpeed > 4) return;
    if (dist < 1.6) return; // close enough to arrest
    const speed = 6.8;
    const targetHeading = Math.atan2(dx, dz);
    o.heading += angleDelta(o.heading, targetHeading) * Math.min(1, dt * 8);
    const step = Math.min(speed * dt, dist - 1.4);
    let nx = o.x + Math.sin(o.heading) * step;
    let nz = o.z + Math.cos(o.heading) * step;
    const fixed = this.city.collideCircle(nx, nz, 0.6);
    o.x = fixed.x;
    o.z = fixed.z;
    o.phase += dt * speed * 1.8;
    const swing = Math.sin(o.phase) * 0.6;
    o.legL.rotation.x = swing;
    o.legR.rotation.x = -swing;
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.y = o.heading;
  }

  // For the HUD minimap: police car positions.
  copPositions() {
    return this.cars.map((c) => ({ x: c.car.x, z: c.car.z }));
  }
}
