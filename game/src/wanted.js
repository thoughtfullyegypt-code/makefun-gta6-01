// wanted.js: the wanted level — stars, the police cars and foot officers who chase
// them, getting BUSTED, and shaking the heat by hiding.

import {
  BUSTED_TIME,
  EVADE_RANGE,
  EVADE_TIME,
  MAX_STARS,
  STAR_FALL_TIME,
} from './config.js';
import { createCar, syncCarMesh, updatePoliceCar } from './vehicles.js';
import { buildPersonMesh, poseWalk } from './character.js';
import { clamp, dist2 } from './utils.js';

function copsWantedFor(stars) {
  return stars <= 0 ? 0 : Math.min(stars + (stars >= 3 ? 1 : 0), 5);
}

export function createWanted(scene, city, rng) {
  const state = {
    stars: 0,
    bustedTimer: 0,
    evadeTimer: 0,
    starFallTimer: 0,
    evading: false,
    cars: [],
    officers: [],
  };

  function spawnCopNear(px, pz) {
    // On a road 50-90 m from the player, so the sirens arrive rather than appear.
    for (let tries = 0; tries < 12; tries += 1) {
      const p = city.randomRoadPoint(rng);
      const d2 = dist2(p.x, p.z, px, pz);
      if (d2 > 50 * 50 && d2 < 95 * 95) {
        const axis = Math.abs(p.x - px) < Math.abs(p.z - pz) ? 'z' : 'x';
        const car = createCar(scene, p.x, p.z, 0, { kind: 'police', axis, line: axis === 'x' ? p.z : p.x, dir: rng.chance(0.5) ? 1 : -1 });
        car.heading = axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
        state.cars.push(car);
        return;
      }
    }
    const p = city.nearestRoadPoint(px + 60, pz);
    const car = createCar(scene, p.x, p.z, 0, { kind: 'police', axis: 'x', line: p.z, dir: 1 });
    state.cars.push(car);
  }

  function spawnOfficerNear(px, pz) {
    const p = city.nearestRoadPoint(px + rng.range(-25, 25), pz + rng.range(-25, 25));
    const parts = buildPersonMesh({ shirt: 0x1f3a93, pants: 0x14181f, skin: 0xc68e5e, hat: 0x14181f });
    parts.group.position.set(p.x, 0, p.z);
    scene.add(parts.group);
    state.officers.push({ parts, x: p.x, z: p.z, heading: 0, walkPhase: 0, speed: 6.4 });
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = state.cars.indexOf(car);
    if (i !== -1) state.cars.splice(i, 1);
  }

  function removeOfficer(officer) {
    scene.remove(officer.parts.group);
    const i = state.officers.indexOf(officer);
    if (i !== -1) state.officers.splice(i, 1);
  }

  return {
    state,
    addStars(n) {
      state.stars = clamp(state.stars + n, 0, MAX_STARS);
      state.evadeTimer = 0;
      state.starFallTimer = 0;
      state.evading = false;
    },
    clear() {
      state.stars = 0;
      state.bustedTimer = 0;
      state.evadeTimer = 0;
      state.evading = false;
      for (const car of [...state.cars]) removeCar(car);
      for (const officer of [...state.officers]) removeOfficer(officer);
    },
    sirenOn() {
      return state.cars.length > 0;
    },
    nearestCopDistance(px, pz) {
      let best = Infinity;
      for (const car of state.cars) best = Math.min(best, Math.sqrt(dist2(car.x, car.z, px, pz)));
      for (const officer of state.officers) best = Math.min(best, Math.sqrt(dist2(officer.x, officer.z, px, pz)));
      return best;
    },
    /**
     * Runs the whole heat: spawns the right number of units, chases the player,
     * busts a pinned player, and lets stars fall when the player hides.
     * player: {x, z, speed, onFoot}. Pushes 'busted' / 'evaded' events.
     */
    update(dt, player, city2, events) {
      // Keep the force at the right size.
      const wantCars = copsWantedFor(state.stars);
      while (state.cars.length < wantCars) spawnCopNear(player.x, player.z);
      while (state.cars.length > wantCars) removeCar(state.cars[state.cars.length - 1]);
      const wantOfficers = state.stars > 0 && player.onFoot ? Math.min(2, state.stars) : 0;
      while (state.officers.length < wantOfficers) spawnOfficerNear(player.x, player.z);
      while (state.officers.length > wantOfficers) removeOfficer(state.officers[state.officers.length - 1]);

      // Chase.
      for (const car of [...state.cars]) {
        updatePoliceCar(car, dt, player, city2, rng);
        syncCarMesh(car, dt);
        if (car.removeMe) {
          removeCar(car);
          if (state.stars > 0) spawnCopNear(player.x, player.z);
        }
      }
      for (const officer of state.officers) {
        const dx = player.x - officer.x;
        const dz = player.z - officer.z;
        const d = Math.hypot(dx, dz) || 1;
        const wantHeading = Math.atan2(dx, dz);
        let turn = wantHeading - officer.heading;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        officer.heading += clamp(turn, -dt * 5, dt * 5);
        officer.x += Math.sin(officer.heading) * officer.speed * dt;
        officer.z += Math.cos(officer.heading) * officer.speed * dt;
        [officer.x, officer.z] = city2.resolveCollision(officer.x, officer.z, 0.5);
        officer.walkPhase += officer.speed * dt * 2.2;
        poseWalk(officer.parts, officer.walkPhase, 0.9);
        officer.parts.group.position.set(officer.x, officer.parts.group.position.y, officer.z);
        officer.parts.group.rotation.y = officer.heading;
      }

      if (state.stars === 0) return;

      // BUSTED: pinned — a unit close by while the player is barely moving.
      const pinned =
        player.speed < 2 &&
        (state.cars.some((c) => dist2(c.x, c.z, player.x, player.z) < 6.5 * 6.5) ||
          state.officers.some((o) => dist2(o.x, o.z, player.x, player.z) < 2.6 * 2.6));
      if (pinned) {
        state.bustedTimer += dt;
        if (state.bustedTimer >= BUSTED_TIME) {
          state.bustedTimer = 0;
          events.push({ type: 'busted' });
          return;
        }
      } else {
        state.bustedTimer = Math.max(0, state.bustedTimer - dt * 2);
      }

      // Evading: no unit in range for a while, then the stars fall one by one.
      const nearest = this.nearestCopDistance(player.x, player.z);
      if (nearest > EVADE_RANGE) {
        state.evadeTimer += dt;
        if (state.evadeTimer >= EVADE_TIME) {
          state.evading = true;
          state.starFallTimer += dt;
          if (state.starFallTimer >= STAR_FALL_TIME) {
            state.starFallTimer = 0;
            state.stars -= 1;
            if (state.stars <= 0) {
              state.stars = 0;
              state.evading = false;
              events.push({ type: 'evaded' });
            }
          }
        }
      } else {
        state.evadeTimer = 0;
        state.starFallTimer = 0;
        state.evading = false;
      }
    },
  };
}
