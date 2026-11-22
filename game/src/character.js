// character.js: the person on foot — the player's body, its walk cycle and its
// movement — plus buildPersonMesh, the little low-poly figure the pedestrians and the
// police officers share. Heading convention (whole game): forward = (sin h, cos h).

import * as THREE from 'three';
import { PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './config.js';
import { angleTo, clamp } from './utils.js';

const SKIN_TONES = [0xc68e5e, 0x8d5524, 0xe0ac69, 0x6b4423, 0xf1c27d];
const SHIRTS = [0x2e86de, 0xe74c3c, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xd35400, 0x7f8c8d];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1a1a2e, 0x4a4a4a];

/**
 * A low-poly person: legs and arms pivot at hip and shoulder so a walk cycle is just
 * two sines. Returns { group, legL, legR, armL, armR, head }.
 */
export function buildPersonMesh(opts = {}) {
  const shirt = opts.shirt ?? 0x2e86de;
  const pants = opts.pants ?? 0x2c3e50;
  const skin = opts.skin ?? 0xc68e5e;
  const hat = opts.hat ?? null;
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color });

  function limb(width, height, depth, color, pivotY, x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color));
    mesh.position.y = -height / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }

  const legL = limb(0.17, 0.8, 0.22, pants, 0.82, -0.12);
  const legR = limb(0.17, 0.8, 0.22, pants, 0.82, 0.12);
  const armL = limb(0.13, 0.72, 0.17, shirt, 1.4, -0.33);
  const armR = limb(0.13, 0.72, 0.17, shirt, 1.4, 0.33);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), mat(shirt));
  torso.position.y = 1.13;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat(skin));
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  if (hat) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 12), mat(hat));
    cap.position.y = 1.76;
    group.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), mat(hat));
    brim.position.set(0, 1.73, 0.2);
    group.add(brim);
  }
  return { group, legL, legR, armL, armR, head };
}

/** Poses a person mesh for a walk cycle at the given phase and speed (0 = standing). */
export function poseWalk(parts, phase, speedNorm) {
  const swing = 0.65 * speedNorm;
  parts.legL.rotation.x = Math.sin(phase) * swing;
  parts.legR.rotation.x = -Math.sin(phase) * swing;
  parts.armL.rotation.x = -Math.sin(phase) * swing * 0.8;
  parts.armR.rotation.x = Math.sin(phase) * swing * 0.8;
  parts.group.position.y = Math.abs(Math.sin(phase)) * 0.04 * speedNorm;
}

/** Picks a random outfit for a background pedestrian. */
export function randomOutfit(rng) {
  return {
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skin: rng.pick(SKIN_TONES),
    hat: rng.chance(0.25) ? rng.pick(SHIRTS) : null,
  };
}

/** The player on foot. */
export function createCharacter(scene, x, z) {
  const parts = buildPersonMesh({ shirt: 0xe8e8e8, pants: 0x274060, skin: 0xc68e5e, hat: 0xc0392b });
  parts.group.position.set(x, 0, z);
  scene.add(parts.group);
  const self = {
    parts,
    x,
    z,
    heading: 0,
    speed: 0,
    walkPhase: 0,
    visible: true,
    setVisible(v) {
      self.visible = v;
      parts.group.visible = v;
    },
    setPosition(nx, nz, heading) {
      self.x = nx;
      self.z = nz;
      if (heading !== undefined) self.heading = heading;
      parts.group.position.set(nx, 0, nz);
      parts.group.rotation.y = self.heading;
    },
    /**
     * Moves the player along the desired world-space direction (mx, mz, already
     * camera-relative, length 0..1). Collides with buildings and cars.
     */
    update(dt, mx, mz, sprint, city, cars) {
      const moving = Math.hypot(mx, mz) > 0.05;
      const targetSpeed = moving ? (sprint ? SPRINT_SPEED : WALK_SPEED) : 0;
      self.speed += (targetSpeed - self.speed) * Math.min(1, dt * 10);
      if (moving) {
        const len = Math.hypot(mx, mz);
        const nx = mx / len;
        const nz = mz / len;
        const targetHeading = Math.atan2(nx, nz);
        self.heading += angleTo(self.heading, targetHeading) * Math.min(1, dt * 12);
        self.x += nx * self.speed * dt;
        self.z += nz * self.speed * dt;
      }
      // Collide with buildings, then with cars (as circles).
      [self.x, self.z] = city.resolveCollision(self.x, self.z, PLAYER_RADIUS);
      for (const car of cars) {
        const dx = self.x - car.x;
        const dz = self.z - car.z;
        const d2 = dx * dx + dz * dz;
        const min = PLAYER_RADIUS + 2.1;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          self.x = car.x + (dx / d) * min;
          self.z = car.z + (dz / d) * min;
        }
      }
      self.walkPhase += self.speed * dt * 1.7;
      poseWalk(parts, self.walkPhase, clamp(self.speed / SPRINT_SPEED, 0, 1));
      parts.group.position.set(self.x, parts.group.position.y, self.z);
      parts.group.rotation.y = self.heading;
    },
  };
  return self;
}
