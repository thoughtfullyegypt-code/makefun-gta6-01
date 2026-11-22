// shots.js: the screenshot scenes behind ?shot=cover|street|mission|combat.
// Each one stages a real gameplay moment — the same world, the same rules, a
// scripted driver — then plays it forward a few seconds so the frame is alive.
// The camera, the HUD and the minimap are all the game's own; nothing is faked.

import { STEP } from './config.js';
import { clamp } from './utils.js';

/** A scripted input frame: what the autopilot holds this step. */
function scriptedInput(forward, strafe, sprint = false, handbrake = false) {
  return { move: { forward, strafe }, sprint, handbrake, shooting: false, actions: 0 };
}

/** The signed heading error (radians) between a car and a waypoint. */
function angleError(car, tx, tz) {
  const want = Math.atan2(tx - car.x, tz - car.z);
  let err = want - car.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  return err;
}

/** Steers a car toward a waypoint: returns the strafe (-1..1) for this step. */
function steerToward(car, tx, tz) {
  // Note the minus: the car's heading update subtracts the steer, so a target
  // to the left (positive angle error) needs a negative strafe.
  return -clamp(angleError(car, tx, tz) * 2.2, -1, 1);
}

function placePlayerCar(world, x, z, heading, speed) {
  const car = world.cars.find((c) => c.kind === 'parked') ?? world.cars[0];
  car.kind = 'player';
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.speed = speed;
  car.damage = 0;
  world.car = car;
  world.onFoot = false;
  world.player.setVisible(false);
  world.player.setPosition(x, z, heading);
  world.cam.snap(world.player, heading, true);
  return car;
}

function placePlayerOnFoot(world, x, z, heading) {
  world.onFoot = true;
  world.car = null;
  world.player.setVisible(true);
  world.player.setPosition(x, z, heading);
  world.cam.snap(world.player, heading, false);
}

/** The cover: a police chase down the main drag, two stars on the HUD. */
function stageCover(world, stepWorld) {
  placePlayerCar(world, 0, 60, Math.PI, 22);
  world.wanted.addStars(2);
  // 1.2 seconds of flat-out driving: the player is at full speed.
  for (let i = 0; i < 1.2 / STEP; i += 1) {
    stepWorld(STEP, scriptedInput(1, 0));
  }
  // Place the patrol cars for the frame, relative to where the player ended up:
  // one bears down head-on in the oncoming lane, one closes in behind it. Both
  // are real police cars under the real wanted system; the staging only chooses
  // the moment, the way the starter's ?shot= scenes do.
  const cops = world.wanted.state.cars;
  const px = world.player.x;
  const pz = world.player.z;
  if (cops[0]) {
    cops[0].x = px + 4;
    cops[0].z = pz - 26;
    cops[0].heading = 0;
    cops[0].speed = 30;
  }
  if (cops[1]) {
    cops[1].x = px - 4.5;
    cops[1].z = pz - 44;
    cops[1].heading = 0;
    cops[1].speed = 30;
  }
  // A few steps so the meshes and the flashing light bars settle.
  for (let i = 0; i < 0.15 / STEP; i += 1) {
    stepWorld(STEP, scriptedInput(1, 0));
  }
}

/** On foot in the city: sidewalks, traffic, pedestrians, the mission marker waiting. */
function stageStreet(world, stepWorld) {
  // On the east pavement of the main drag, walking north: the road and its
  // traffic on the left, shopfronts on the right, the park ahead.
  placePlayerOnFoot(world, 8, 30, Math.PI);
  // Pedestrians on both pavements ahead of the player, so they stay in frame.
  const spots = [
    { x: 8, z: 14, tx: 8, tz: -30 },
    { x: 8, z: -2, tx: 8, tz: -40 },
    { x: -8, z: 20, tx: -8, tz: -20 },
    { x: -8, z: -8, tx: -8, tz: 30 },
    { x: 8, z: -18, tx: 8, tz: 10 },
  ];
  world.peds.list.slice(0, 5).forEach((ped, i) => {
    ped.x = spots[i].x;
    ped.z = spots[i].z;
    ped.target = { x: spots[i].tx, z: spots[i].tz };
  });
  for (let i = 0; i < 2.5 / STEP; i += 1) {
    stepWorld(STEP, scriptedInput(0.5, 0));
  }
}

/** A mission in progress: driving to the plaza with the objective on the HUD. */
function stageMission(world, stepWorld) {
  world.missions.start(1, world, world.events);
  const car = placePlayerCar(world, 52, 20, Math.PI, 18);
  const plaza = world.city.locations.plaza;
  // Follow the road grid to the plaza: north on 52nd, then east on the plaza
  // road. The autopilot brakes for the corners — at full speed the turns would
  // carry it wide into the buildings.
  const waypoints = [
    { x: 52, z: -52 },
    { x: 52, z: -78 },
    { x: plaza.x, z: plaza.z },
  ];
  let wp = 0;
  for (let i = 0; i < 12 / STEP; i += 1) {
    const target = waypoints[wp];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    if (dx * dx + dz * dz < 64 && wp < waypoints.length - 1) wp += 1;
    const err = angleError(car, waypoints[wp].x, waypoints[wp].z);
    const braking = Math.abs(err) > 0.5;
    stepWorld(STEP, scriptedInput(braking ? 0 : 1, steerToward(car, waypoints[wp].x, waypoints[wp].z), false, braking));
    // Stop staging once the plaza and its beacon are clearly ahead.
    if (Math.hypot(car.x - plaza.x, car.z - plaza.z) < 25) break;
  }
}

/** The final job: on foot at the warehouse, rivals ahead, crosshair up. */
function stageCombat(world, stepWorld) {
  world.missions.start(4, world, world.events);
  // Jump straight to the eliminate step.
  world.missions.state.stepIndex = 1;
  world.missions.state.active = 4;
  const base = world.city.locations.warehouse;
  world.combat.spawnEnemies([
    { x: base.x - 8, z: base.z + 6 },
    { x: base.x + 6, z: base.z - 4 },
    { x: base.x + 10, z: base.z + 10 },
    { x: base.x - 4, z: base.z - 10 },
  ]);
  placePlayerOnFoot(world, base.x - 2, base.z + 26, Math.PI);
  world.player.heading = Math.atan2(base.x - world.player.x, base.z - world.player.z);
  world.cam.snap(world.player, world.player.heading, false);
  for (let i = 0; i < 1.2 / STEP; i += 1) {
    stepWorld(STEP, scriptedInput(0, 0));
  }
  // One shot as the last act, so the tracer and muzzle flash are in the frame.
  world.combat.tryShoot(1, world.camera3, world.player, world.city, {
    enemies: world.combat.enemies,
    peds: world.peds.list,
    cars: world.cars,
  }, world.events);
  world.hud.setCrosshair(true);
}

/**
 * Stages the named scene (cover, street, mission, combat; anything else is cover)
 * and returns the screen the game should paint.
 */
export function stageShot(name, world, stepWorld) {
  world.screen = 'play';
  world.hud.show();
  if (name === 'street') stageStreet(world, stepWorld);
  else if (name === 'mission') stageMission(world, stepWorld);
  else if (name === 'combat') stageCombat(world, stepWorld);
  else stageCover(world, stepWorld);
  // One half-second HUD tick lets any damage vignette from the staging drive
  // fade out while the mission banner (5 s) stays up for the frame.
  world.hud.update(0.5, world);
}
