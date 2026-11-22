// combat.js: shooting on foot — a ray from the camera, tracers, muzzle flash, and
// the rival crew members who shoot back in the final mission. Hits are plain math
// (ray vs sphere, ray vs building box), not a raycaster, so it stays fast.

import * as THREE from 'three';
import { buildPersonMesh } from './character.js';
import { clamp, dist2 } from './utils.js';

const FIRE_INTERVAL = 0.14; // seconds between the player's shots
const PLAYER_DAMAGE = 25;
const ENEMY_DAMAGE = 9;
const MAX_RANGE = 120;

/** Ray vs axis-aligned box: the distance along the ray to the first hit, or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, box, top) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, 0, top],
    [oz, dz, box.minZ, box.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Ray vs sphere: the distance along the ray, or Infinity. */
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

export function createCombat(scene) {
  const enemies = [];
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95 }),
  );
  flash.visible = false;
  scene.add(flash);
  let flashLife = 0;
  let tracerIndex = 0;
  let cooldown = 0;

  function fireTracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % tracers.length;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.life = 0.09;
  }

  function shootRay(origin, dir, city, targets) {
    let best = { t: MAX_RANGE, kind: null, ref: null };
    // Buildings block shots (approximate height 60 — towers are shorter).
    for (const box of city.colliders) {
      const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box, 60);
      if (t < best.t) best = { t, kind: 'wall', ref: null };
    }
    const consider = (x, y, z, r, kind, ref) => {
      const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, x, y, z, r);
      if (t < best.t) best = { t, kind, ref };
    };
    for (const enemy of targets.enemies) {
      if (enemy.health > 0) consider(enemy.x, 1.1, enemy.z, 0.7, 'enemy', enemy);
    }
    for (const ped of targets.peds) {
      if (ped.state !== 'down') consider(ped.x, 1.1, ped.z, 0.6, 'ped', ped);
    }
    for (const car of targets.cars) {
      consider(car.x, 0.9, car.z, 2.2, 'car', car);
    }
    return best;
  }

  return {
    enemies,
    spawnEnemies(points) {
      for (const p of points) {
        const parts = buildPersonMesh({ shirt: 0x7b241c, pants: 0x1a1a1a, skin: 0x8d5524, hat: 0x111111 });
        parts.group.position.set(p.x, 0, p.z);
        scene.add(parts.group);
        enemies.push({
          parts,
          x: p.x,
          z: p.z,
          heading: p.heading ?? 0,
          health: 50,
          shootTimer: 1 + Math.random(),
          deadTimer: 0,
        });
      }
    },
    clearEnemies() {
      for (const enemy of enemies) scene.remove(enemy.parts.group);
      enemies.length = 0;
    },
    aliveCount() {
      return enemies.filter((e) => e.health > 0).length;
    },
    /**
     * The player fires from the camera toward the crosshair. Handles the fire rate,
     * the tracer, the flash and the damage. Returns true when a shot went out.
     */
    tryShoot(dt, camera, player, city, targets, events) {
      cooldown -= dt;
      if (cooldown > 0) return false;
      cooldown = FIRE_INTERVAL;
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const hit = shootRay(origin, dir, city, targets);
      const end = origin.clone().addScaledVector(dir, hit.t);
      const muzzle = { x: player.x + Math.sin(player.heading) * 0.5, y: 1.35, z: player.z + Math.cos(player.heading) * 0.5 };
      fireTracer(muzzle, { x: end.x, y: end.y, z: end.z });
      flash.position.set(muzzle.x, muzzle.y, muzzle.z);
      flash.visible = true;
      flashLife = 0.05;
      events.push({ type: 'gunshot', x: player.x, z: player.z });
      if (hit.kind === 'enemy') {
        hit.ref.health -= PLAYER_DAMAGE;
        if (hit.ref.health <= 0) {
          hit.ref.parts.group.rotation.x = -Math.PI / 2;
          hit.ref.parts.group.position.y = 0.25;
          hit.ref.deadTimer = 4;
          events.push({ type: 'enemy-down', x: hit.ref.x, z: hit.ref.z });
        }
      } else if (hit.kind === 'ped') {
        events.push({ type: 'ped-shot', ped: hit.ref, x: hit.ref.x, z: hit.ref.z });
      } else if (hit.kind === 'car') {
        hit.ref.damage = clamp(hit.ref.damage + 0.03, 0, 1);
        if (hit.ref.kind === 'police') events.push({ type: 'crime', stars: 1, reason: 'shot at a cop car' });
      }
      return true;
    },
    /** Enemies shoot back at the player when close enough. */
    update(dt, player, events) {
      if (flashLife > 0) {
        flashLife -= dt;
        if (flashLife <= 0) flash.visible = false;
      }
      for (const t of tracers) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
          if (t.life <= 0) t.line.visible = false;
        }
      }
      for (const enemy of enemies) {
        if (enemy.health <= 0) {
          enemy.deadTimer -= dt;
          continue;
        }
        const d2 = dist2(enemy.x, enemy.z, player.x, player.z);
        if (d2 > 35 * 35) continue;
        enemy.heading = Math.atan2(player.x - enemy.x, player.z - enemy.z);
        enemy.parts.group.rotation.y = enemy.heading;
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0) {
          enemy.shootTimer = 0.9 + Math.random() * 0.7;
          const dist = Math.sqrt(d2);
          const hitChance = clamp(0.5 - dist * 0.008, 0.12, 0.5);
          const muzzle = { x: enemy.x, y: 1.35, z: enemy.z };
          const target = { x: player.x, y: 1.1, z: player.z };
          fireTracer(muzzle, target);
          events.push({ type: 'gunshot', x: enemy.x, z: enemy.z, enemy: true });
          if (Math.random() < hitChance) {
            events.push({ type: 'damage', amount: ENEMY_DAMAGE, x: player.x, z: player.z });
          }
        }
      }
    },
  };
}
