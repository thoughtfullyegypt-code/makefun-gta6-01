// Pedestrians: sidewalk walkers who flee from danger and get run down if
// they are too slow. Each ped is a small articulated figure with a walk
// cycle; downed peds lie on the ground, then fade out and respawn.
import * as THREE from 'three';
import { CFG, PALETTE, ROAD_LINES } from './config.js';
import { Rng, clamp, angleDelta } from './rng.js';
import { nearestRoadCoord } from './city.js';

function makePedMesh(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick(PALETTE.pedSkin), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick(PALETTE.pedShirt), roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: rng.pick([0x2a3a5e, 0x3a3a3a, 0x5e3a2a, 0x2e4a2e]), roughness: 0.9 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.24);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.15, 0.35, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.15, 0.35, 0);
  const armGeo = new THREE.BoxGeometry(0.16, 0.6, 0.2);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.38, 1.05, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.38, 1.05, 0);
  group.add(torso, head, legL, legR, armL, armR);
  return { group, legL, legR, armL, armR };
}

export class PedestrianManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    this.onRunOver = null; // (ped) => void
  }

  spawn(x, z, opts = {}) {
    const parts = makePedMesh(this.rng);
    const ped = {
      ...parts,
      x, z,
      heading: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(1.2, 2.0),
      walkPhase: this.rng.range(0, Math.PI * 2),
      state: opts.state || 'walk', // walk | flee | down | follow
      downTimer: 0,
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      targetX: x,
      targetZ: z,
      followTarget: opts.followTarget || null,
      down: false,
      isContact: !!opts.isContact,
      isEnemy: !!opts.isEnemy,
      health: 100,
    };
    this.scene.add(ped.group);
    ped.group.position.set(x, 0, z);
    this.peds.push(ped);
    this._pickWalkTarget(ped);
    return ped;
  }

  populate() {
    for (let i = 0; i < CFG.PED_COUNT; i++) {
      // Spawn on a sidewalk: just off a road line.
      const vertical = this.rng.chance(0.5);
      const line = this.rng.pick(ROAD_LINES);
      const along = this.rng.range(CFG.GRID_MIN, CFG.GRID_MAX);
      const off = this.rng.chance(0.5) ? 8 : -8;
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      this.spawn(x, z);
    }
  }

  _pickWalkTarget(ped) {
    // Walk along the current sidewalk to a random point on it.
    const onVertical = Math.abs(ped.x - nearestRoadCoord(ped.x)) < Math.abs(ped.z - nearestRoadCoord(ped.z));
    if (onVertical) {
      ped.targetX = ped.x;
      ped.targetZ = this.rng.range(CFG.GRID_MIN, CFG.GRID_MAX);
    } else {
      ped.targetX = this.rng.range(CFG.GRID_MIN, CFG.GRID_MAX);
      ped.targetZ = ped.z;
    }
  }

  fleeFrom(ped, x, z, seconds = 4) {
    if (ped.down || ped.state === 'follow') return;
    ped.state = 'flee';
    ped.fleeTimer = seconds;
    const dx = ped.x - x;
    const dz = ped.z - z;
    const d = Math.hypot(dx, dz) || 1;
    ped.fleeX = ped.x + (dx / d) * 40;
    ped.fleeZ = ped.z + (dz / d) * 40;
  }

  fleeAllNear(x, z, radius, seconds = 4) {
    for (const ped of this.peds) {
      const dx = ped.x - x;
      const dz = ped.z - z;
      if (dx * dx + dz * dz < radius * radius) this.fleeFrom(ped, x, z, seconds);
    }
  }

  knockDown(ped) {
    if (ped.down) return;
    ped.down = true;
    ped.state = 'down';
    ped.downTimer = 0;
    ped.group.rotation.x = -Math.PI / 2;
    ped.group.position.y = 0.3;
    if (this.onRunOver) this.onRunOver(ped);
  }

  shoot(ped, damage) {
    if (ped.down) return true;
    ped.health -= damage;
    if (ped.health <= 0) {
      this.knockDown(ped);
      return true;
    }
    return false;
  }

  update(dt, playerPos, playerInCar, playerSpeed) {
    for (const ped of this.peds) {
      if (ped.down) {
        ped.downTimer += dt;
        if (ped.downTimer > 9) {
          // Fade out and respawn somewhere quiet.
          this.scene.remove(ped.group);
          const vertical = this.rng.chance(0.5);
          const line = this.rng.pick(ROAD_LINES);
          const along = this.rng.range(CFG.GRID_MIN, CFG.GRID_MAX);
          const off = this.rng.chance(0.5) ? 8 : -8;
          ped.x = vertical ? line + off : along;
          ped.z = vertical ? along : line + off;
          ped.down = false;
          ped.health = 100;
          ped.state = 'walk';
          ped.group.rotation.x = 0;
          ped.group.position.y = 0;
          this.scene.add(ped.group);
          this._pickWalkTarget(ped);
        }
        continue;
      }
      let speed = ped.speed;
      let tx = ped.targetX;
      let tz = ped.targetZ;
      if (ped.state === 'wait') {
        // Standing still (a contact waiting to be met).
        speed = 0;
      } else if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        speed = 5.5;
        tx = ped.fleeX;
        tz = ped.fleeZ;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          this._pickWalkTarget(ped);
        }
      } else if (ped.state === 'follow' && ped.followTarget) {
        tx = ped.followTarget.x;
        tz = ped.followTarget.z;
        const d = Math.hypot(tx - ped.x, tz - ped.z);
        speed = d > 6 ? 6.5 : d > 2.5 ? 4 : 0;
        if (d < 2.5) speed = 0;
      }
      // A fast car bearing down makes peds scatter.
      if (playerInCar && playerSpeed > 8 && ped.state === 'walk') {
        const dx = ped.x - playerPos.x;
        const dz = ped.z - playerPos.z;
        if (dx * dx + dz * dz < 12 * 12) this.fleeFrom(ped, playerPos.x, playerPos.z, 3);
      }
      const dx = tx - ped.x;
      const dz = tz - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.5 && speed > 0) {
        const targetHeading = Math.atan2(dx, dz);
        ped.heading += angleDelta(ped.heading, targetHeading) * Math.min(1, dt * 6);
        const step = Math.min(speed * dt, dist);
        let nx = ped.x + Math.sin(ped.heading) * step;
        let nz = ped.z + Math.cos(ped.heading) * step;
        const fixed = this.city.collideCircle(nx, nz, 0.5);
        nx = fixed.x;
        nz = fixed.z;
        nx = clamp(nx, -CFG.GROUND_HALF + 5, CFG.GROUND_HALF - 5);
        nz = clamp(nz, -CFG.GROUND_HALF + 5, CFG.SEA_Z - 2);
        ped.x = nx;
        ped.z = nz;
        ped.walkPhase += dt * speed * 2.4;
      } else if (ped.state === 'walk') {
        this._pickWalkTarget(ped);
      }
      // Animate the walk cycle.
      const swing = Math.sin(ped.walkPhase) * (speed > 0 ? 0.55 : 0);
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.7;
      ped.armR.rotation.x = swing * 0.7;
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = ped.heading;
    }
  }
}
