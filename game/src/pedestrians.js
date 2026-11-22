// pedestrians.js: the people of Solmar — they stroll the sidewalks, scatter when a
// gun goes off, and go down (with consequences) if a car hits them.

import { BLOCK, BLOCK_CENTRES } from './config.js';
import { buildPersonMesh, poseWalk, randomOutfit } from './character.js';
import { clamp, dist2 } from './utils.js';

/** A random point on a block's sidewalk edge. */
function sidewalkPoint(rng) {
  const bx = rng.pick(BLOCK_CENTRES);
  const bz = rng.pick(BLOCK_CENTRES);
  const edge = rng.int(0, 3);
  const along = rng.range(-BLOCK / 2 + 2, BLOCK / 2 - 2);
  if (edge === 0) return { x: bx + along, z: bz - BLOCK / 2 + 1.5 };
  if (edge === 1) return { x: bx + along, z: bz + BLOCK / 2 - 1.5 };
  if (edge === 2) return { x: bx - BLOCK / 2 + 1.5, z: bz + along };
  return { x: bx + BLOCK / 2 - 1.5, z: bz + along };
}

export function createPedestrians(scene, rng, city, count = 26) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const start = sidewalkPoint(rng);
    const parts = buildPersonMesh(randomOutfit(rng));
    parts.group.position.set(start.x, 0, start.z);
    scene.add(parts.group);
    peds.push({
      parts,
      x: start.x,
      z: start.z,
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.1, 1.9),
      walkPhase: rng.range(0, Math.PI * 2),
      target: sidewalkPoint(rng),
      state: 'walk',
      fleeTimer: 0,
      downTimer: 0,
      fleeFrom: null,
    });
  }

  return {
    list: peds,
    /** Scares every pedestrian near (x, z) into running away. */
    scare(x, z, radius) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (dist2(ped.x, ped.z, x, z) < radius * radius) {
          ped.state = 'flee';
          ped.fleeTimer = 4;
          ped.fleeFrom = { x, z };
        }
      }
    },
    update(dt, city2, playerCar, events) {
      for (const ped of peds) {
        if (ped.state === 'down') {
          ped.downTimer -= dt;
          if (ped.downTimer <= 0) {
            // Gets up elsewhere: the city never runs out of people.
            const spot = sidewalkPoint(rng);
            ped.x = spot.x;
            ped.z = spot.z;
            ped.state = 'walk';
            ped.parts.group.rotation.x = 0;
            ped.parts.group.visible = true;
            ped.target = sidewalkPoint(rng);
          }
          continue;
        }
        let speed = ped.speed;
        let tx = ped.target.x;
        let tz = ped.target.z;
        if (ped.state === 'flee') {
          ped.fleeTimer -= dt;
          speed = 5.2;
          const dx = ped.x - ped.fleeFrom.x;
          const dz = ped.z - ped.fleeFrom.z;
          const d = Math.hypot(dx, dz) || 1;
          tx = ped.x + (dx / d) * 20;
          tz = ped.z + (dz / d) * 20;
          if (ped.fleeTimer <= 0) {
            ped.state = 'walk';
            ped.target = sidewalkPoint(rng);
          }
        }
        const dx = tx - ped.x;
        const dz = tz - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) {
          ped.target = sidewalkPoint(rng);
        } else {
          const wantHeading = Math.atan2(dx, dz);
          let turn = wantHeading - ped.heading;
          while (turn > Math.PI) turn -= Math.PI * 2;
          while (turn < -Math.PI) turn += Math.PI * 2;
          ped.heading += clamp(turn, -dt * 4, dt * 4);
          ped.x += Math.sin(ped.heading) * speed * dt;
          ped.z += Math.cos(ped.heading) * speed * dt;
        }
        [ped.x, ped.z] = city2.resolveCollision(ped.x, ped.z, 0.5);
        ped.walkPhase += speed * dt * 2.4;
        poseWalk(ped.parts, ped.walkPhase, clamp(speed / 5.2, 0.2, 1));
        ped.parts.group.position.set(ped.x, ped.parts.group.position.y, ped.z);
        ped.parts.group.rotation.y = ped.heading;

        // Run over by the player's car?
        if (playerCar && Math.abs(playerCar.speed) > 3) {
          if (dist2(ped.x, ped.z, playerCar.x, playerCar.z) < 2.4 * 2.4) {
            ped.state = 'down';
            ped.downTimer = 6;
            ped.parts.group.rotation.x = -Math.PI / 2;
            ped.parts.group.position.y = 0.2;
            events.push({ type: 'crime', stars: 1, reason: 'hit a pedestrian' });
            events.push({ type: 'ped-down', x: ped.x, z: ped.z });
          }
        }
      }
    },
  };
}
