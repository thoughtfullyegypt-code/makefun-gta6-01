// missions.js: the story of Solmar — five jobs for Ray, from a first stolen car to
// the last job at the warehouse. Each mission is a list of steps; a step is a small
// objective (drive somewhere, grab something, lose the heat, beat the clock, clear
// the rivals). A yellow beacon marks the current objective in the world.

import * as THREE from 'three';
import { MISSION_COUNT } from './config.js';
import { clock, dist2 } from './utils.js';

export const MISSIONS = [
  {
    name: 'Wheels Up',
    giver: 'Ray',
    reward: 500,
    briefing: 'Mars, I need wheels. Borrow any car on the street and bring it down to the South Docks. Try not to scratch it.',
    steps: [
      { type: 'get-in-car', text: 'Steal a car — any car will do' },
      { type: 'drive-to', at: 'docks', radius: 10, text: 'Drive to the South Docks' },
    ],
  },
  {
    name: 'The Pickup',
    giver: 'Ray',
    reward: 800,
    briefing: 'A package is waiting at Fountain Plaza. Park up, grab it on foot, and bring it back to the garage. No heroes.',
    steps: [
      { type: 'drive-to', at: 'plaza', radius: 12, text: 'Drive to Fountain Plaza' },
      { type: 'get-out', text: 'Get out of the car' },
      { type: 'pickup', at: 'plaza', radius: 4, text: 'Grab the package' },
      { type: 'drive-to', at: 'garage', radius: 10, text: 'Bring the package back to the garage' },
    ],
  },
  {
    name: 'Heat Wave',
    giver: 'Ray',
    reward: 1000,
    briefing: 'The cops are all over us after that last run. Shake them. Lose the heat and stay clean.',
    steps: [{ type: 'lose-wanted', stars: 2, text: 'Lose the cops — hide until the heat dies down' }],
  },
  {
    name: 'The Deadline',
    giver: 'Ray',
    reward: 1500,
    briefing: 'Three drops, two and a half minutes. Beach, North Gate, Plaza — in that order. Late is the same as never.',
    steps: [
      {
        type: 'timed',
        time: 150,
        checkpoints: ['beach', 'northGate', 'plaza'],
        radius: 10,
        text: 'Hit the drops in order',
      },
    ],
  },
  {
    name: 'The Last Job',
    giver: 'Ray',
    reward: 3000,
    briefing: 'The Vipers took our warehouse and they are not giving it back nicely. Clear them out, lose the heat, and get home.',
    steps: [
      { type: 'drive-to', at: 'warehouse', radius: 14, text: 'Drive to the Harbor Warehouse' },
      { type: 'eliminate', at: 'warehouse', text: 'Clear out the Vipers' },
      { type: 'lose-wanted', stars: 3, text: 'Lose the cops' },
      { type: 'drive-to', at: 'safehouse', radius: 10, text: 'Get to the Safehouse' },
    ],
  },
];

export function createMissions(scene, city) {
  // The objective beacon: a tall yellow light pillar the player can see across town.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 12, 1, true), beaconMat);
  beacon.visible = false;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.15;
  beaconRing.visible = false;
  scene.add(beaconRing);

  // The package prop for mission 2.
  const packageMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x332200 }),
  );
  packageMesh.visible = false;
  scene.add(packageMesh);

  // The mission-start marker at the garage (a floating yellow "M" ring).
  const startRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }),
  );
  startRing.position.set(city.locations.garage.x, 2.2, city.locations.garage.z);
  scene.add(startRing);

  const state = {
    completed: 0,
    active: -1,
    stepIndex: 0,
    timer: 0,
    checkpointIndex: 0,
    startedAt: 0,
  };

  function loc(name) {
    return city.locations[name];
  }
  function currentMission() {
    return state.active >= 0 ? MISSIONS[state.active] : null;
  }
  function currentStep() {
    const m = currentMission();
    return m ? m.steps[state.stepIndex] : null;
  }

  function placeBeacon(point) {
    beacon.position.set(point.x, 30, point.z);
    beacon.visible = true;
    beaconRing.position.set(point.x, 0.15, point.z);
    beaconRing.visible = true;
  }
  function hideBeacon() {
    beacon.visible = false;
    beaconRing.visible = false;
  }

  function beginStep(world, events) {
    const step = currentStep();
    if (!step) return;
    packageMesh.visible = false;
    if (step.type === 'drive-to' || step.type === 'pickup') {
      placeBeacon(loc(step.at));
      if (step.type === 'pickup') {
        packageMesh.position.set(loc(step.at).x, 0.6, loc(step.at).z);
        packageMesh.visible = true;
      }
    } else if (step.type === 'timed') {
      state.timer = step.time;
      state.checkpointIndex = 0;
      placeBeacon(loc(step.checkpoints[0]));
    } else if (step.type === 'eliminate') {
      const base = loc(step.at);
      world.combat.spawnEnemies([
        { x: base.x - 8, z: base.z + 6 },
        { x: base.x + 6, z: base.z - 4 },
        { x: base.x + 10, z: base.z + 10 },
        { x: base.x - 4, z: base.z - 10 },
      ]);
      placeBeacon(base);
    } else if (step.type === 'lose-wanted') {
      world.wanted.addStars(step.stars);
      hideBeacon();
    } else {
      hideBeacon();
    }
    events.push({ type: 'objective', text: step.text });
  }

  return {
    state,
    /** The next mission the player has not finished, or null when the story is done. */
    nextIndex() {
      return state.completed < MISSION_COUNT ? state.completed : -1;
    },
    isActive() {
      return state.active >= 0;
    },
    currentMission,
    currentStep,
    /** The world point the HUD and minimap should point at, or null. */
    marker() {
      if (!this.isActive()) {
        const next = this.nextIndex();
        return next >= 0 ? { ...loc('garage'), start: true } : null;
      }
      const step = currentStep();
      if (!step) return null;
      if (step.type === 'drive-to' || step.type === 'pickup') return loc(step.at);
      if (step.type === 'timed') return loc(step.checkpoints[state.checkpointIndex]);
      if (step.type === 'eliminate') return loc(step.at);
      return null;
    },
    objectiveText(world) {
      const step = currentStep();
      if (!step) return this.nextIndex() >= 0 ? 'Go to the yellow marker at the garage to start the next job' : 'You rule Solmar. Free roam!';
      if (step.type === 'timed') return `${step.text} — ${clock(state.timer)} left`;
      if (step.type === 'eliminate') return `${step.text} — ${world.combat.aliveCount()} left`;
      return step.text;
    },
    start(index, world, events) {
      state.active = index;
      state.stepIndex = 0;
      state.timer = 0;
      state.checkpointIndex = 0;
      const mission = MISSIONS[index];
      events.push({ type: 'mission-start', name: mission.name, briefing: mission.briefing });
      beginStep(world, events);
    },
    fail(world, events, reason) {
      world.combat.clearEnemies();
      packageMesh.visible = false;
      hideBeacon();
      state.active = -1;
      events.push({ type: 'mission-failed', reason });
    },
    complete(world, events) {
      const mission = MISSIONS[state.active];
      state.completed = Math.max(state.completed, state.active + 1);
      state.active = -1;
      hideBeacon();
      world.combat.clearEnemies();
      events.push({ type: 'mission-complete', name: mission.name, reward: mission.reward });
    },
    /** Advances the active mission one step. Returns nothing; pushes events. */
    update(dt, world, events) {
      // The start ring spins slowly; the beacon pulses.
      startRing.rotation.y += dt * 0.8;
      startRing.visible = !this.isActive() && this.nextIndex() >= 0;
      beaconMat.opacity = 0.28 + Math.sin(performance.now() * 0.004) * 0.12;
      if (!this.isActive()) return;
      const step = currentStep();
      const player = world.player;
      const px = player.x;
      const pz = player.z;
      const atPoint = (name, radius) => dist2(px, pz, loc(name).x, loc(name).z) < radius * radius;

      let done = false;
      if (step.type === 'get-in-car') {
        done = !world.onFoot;
      } else if (step.type === 'get-out') {
        done = world.onFoot;
      } else if (step.type === 'drive-to') {
        done = atPoint(step.at, step.radius);
      } else if (step.type === 'pickup') {
        done = world.onFoot && atPoint(step.at, step.radius);
        if (done) packageMesh.visible = false;
      } else if (step.type === 'lose-wanted') {
        done = world.wanted.state.stars === 0;
      } else if (step.type === 'timed') {
        state.timer -= dt;
        if (state.timer <= 0) {
          this.fail(world, events, 'Out of time');
          return;
        }
        const cp = step.checkpoints[state.checkpointIndex];
        if (atPoint(cp, step.radius)) {
          events.push({ type: 'checkpoint', name: loc(cp).name });
          state.checkpointIndex += 1;
          if (state.checkpointIndex >= step.checkpoints.length) done = true;
          else placeBeacon(loc(step.checkpoints[state.checkpointIndex]));
        }
      } else if (step.type === 'eliminate') {
        done = world.combat.aliveCount() === 0;
      }
      if (!done) return;
      state.stepIndex += 1;
      if (state.stepIndex >= currentMission().steps.length) {
        this.complete(world, events);
      } else {
        beginStep(world, events);
      }
    },
  };
}
