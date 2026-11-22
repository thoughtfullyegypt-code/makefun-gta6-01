// vehicles.js: cars — the mesh builder, the player's arcade driving, the traffic
// that follows the road grid, and the police that hunt the player down it. Heading
// convention (whole game): forward = (sin h, cos h), so a mesh facing +Z turns with
// rotation.y = heading.

import * as THREE from 'three';
import {
  CAR_ACCEL,
  CAR_BRAKE,
  CAR_RADIUS,
  CAR_REVERSE_SPEED,
  CAR_TOP_SPEED,
  CAR_TURN,
  POLICE_SPEED,
  ROAD_LINES,
  TRAFFIC_SPEED,
} from './config.js';
import { angleTo, clamp, dist2 } from './utils.js';

const CAR_COLOURS = [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x2c3e50, 0x27ae60, 0xe67e22, 0x95a5a6, 0x8e44ad, 0x16a085];
const WHEEL_R = 0.36;

/** Builds a low-poly car. Police get a black-and-white body and a light bar. */
export function buildCarMesh(color, kind = 'civilian') {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: kind === 'police' ? 0x14181f : color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2e3d });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const hub = new THREE.MeshLambertMaterial({ color: 0xb9bec4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.3), paint);
  body.position.y = 0.58;
  body.castShadow = true;
  group.add(body);

  const cabinColor = kind === 'police' ? 0xe8e8e8 : color;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.52, 2.1), new THREE.MeshLambertMaterial({ color: cabinColor }));
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.08), glass);
  windshield.position.set(0, 1.06, 0.82);
  windshield.rotation.x = -0.35;
  group.add(windshield);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.08), glass);
  rearGlass.position.set(0, 1.06, -1.32);
  rearGlass.rotation.x = 0.35;
  group.add(rearGlass);

  // Headlights and taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0x555533 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0x440000 });
  for (const side of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), headMat);
    head.position.set(side, 0.62, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), tailMat);
    tail.position.set(side, 0.62, -2.16);
    group.add(tail);
  }

  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x2266ff, emissive: 0x0022aa }));
    blue.position.x = 0.3;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.42, -0.25);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    group.add(lightBar);
  }

  // Wheels: cylinders turned to roll around the X axis; front ones steer.
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  hubGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz, front] of [[-0.85, 1.4, true], [0.85, 1.4, true], [-0.85, -1.4, false], [0.85, -1.4, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, WHEEL_R, wz);
    const tyreMesh = new THREE.Mesh(wheelGeo, tyre);
    const hubMesh = new THREE.Mesh(hubGeo, hub);
    pivot.add(tyreMesh);
    pivot.add(hubMesh);
    group.add(pivot);
    wheels.push({ pivot, spin: tyreMesh, hubSpin: hubMesh, front });
  }
  return { group, wheels, lightBar };
}

/** One car in the world. kind: 'player' | 'traffic' | 'police' | 'parked'. */
export function createCar(scene, x, z, heading, opts = {}) {
  const kind = opts.kind ?? 'traffic';
  const color = opts.color ?? CAR_COLOURS[Math.floor(Math.random() * CAR_COLOURS.length)];
  const built = buildCarMesh(color, kind === 'police' ? 'police' : 'civilian');
  built.group.position.set(x, 0, z);
  built.group.rotation.y = heading;
  scene.add(built.group);
  const car = {
    kind,
    color,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    damage: 0,
    mesh: built.group,
    wheels: built.wheels,
    lightBar: built.lightBar,
    flashTimer: 0,
    // Traffic lane state (axis 'x'|'z', the road line it follows, direction).
    axis: opts.axis ?? 'x',
    line: opts.line ?? 0,
    dir: opts.dir ?? 1,
    targetHeading: heading,
    stuckTimer: 0,
    removeMe: false,
  };
  return car;
}

/** Writes a car's state into its mesh: position, heading, wheel spin and steer. */
export function syncCarMesh(car, dt) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Body lean: roll into turns, pitch under acceleration.
  car.mesh.rotation.z = clamp(-car.steer * car.speed * 0.0016, -0.06, 0.06);
  const spin = (car.speed * dt) / WHEEL_R;
  for (const wheel of car.wheels) {
    wheel.spin.rotation.x += spin;
    wheel.hubSpin.rotation.x += spin;
    if (wheel.front) wheel.pivot.rotation.y = -car.steer * 0.42;
  }
  if (car.lightBar) {
    car.flashTimer += dt;
    const phase = Math.floor(car.flashTimer / 0.25) % 2 === 0;
    car.lightBar.userData.red.material.emissiveIntensity = phase ? 2.2 : 0.2;
    car.lightBar.userData.blue.material.emissiveIntensity = phase ? 0.2 : 2.2;
  }
}

/**
 * The player's car: arcade throttle / brake / reverse / handbrake, steering that
 * tightens at low speed, building and car collisions. Pushes crash events.
 */
export function updatePlayerCar(car, dt, input, city, others, events) {
  const { forward, strafe } = input.move();
  const handbrake = input.handbrake();
  // Impacts count at most once per half second: while two cars overlap, every step
  // would otherwise be a new crash and the speed would collapse to zero.
  car.hitCooldown = Math.max(0, (car.hitCooldown ?? 0) - dt);
  if (forward > 0) car.speed += CAR_ACCEL * dt;
  else if (forward < 0) {
    if (car.speed > 0.5) car.speed -= CAR_BRAKE * dt;
    else car.speed -= CAR_ACCEL * 0.55 * dt;
  } else {
    car.speed -= car.speed * 0.6 * dt;
  }
  if (handbrake) car.speed -= car.speed * 2.4 * dt;
  car.speed -= car.speed * 0.12 * dt;
  const top = CAR_TOP_SPEED * (car.damage > 0.6 ? 0.55 : 1);
  car.speed = clamp(car.speed, -CAR_REVERSE_SPEED, top);

  car.steer += (strafe - car.steer) * Math.min(1, dt * 8);
  const speedFactor = clamp(car.speed / 5, -1, 1);
  const turnRate = CAR_TURN * (1 - 0.45 * Math.min(Math.abs(car.speed) / CAR_TOP_SPEED, 1)) * (handbrake ? 1.6 : 1);
  car.heading -= car.steer * turnRate * dt * speedFactor;

  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const [nx, nz] = city.resolveCollision(car.x, car.z, CAR_RADIUS);
  if (nx !== car.x || nz !== car.z) {
    const impact = Math.abs(car.speed);
    if (impact > 8 && car.hitCooldown <= 0) {
      car.hitCooldown = 0.5;
      events.push({ type: 'crash', strength: impact, x: car.x, z: car.z });
      car.damage = clamp(car.damage + impact * 0.004, 0, 1);
      car.speed *= 0.2;
    } else {
      // Grinding along a wall: bleed speed off gradually, not in one step.
      car.speed *= 0.9;
    }
    car.x = nx;
    car.z = nz;
  }
  // Car-to-car bumps.
  for (const other of others) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const d2 = dx * dx + dz * dz;
    const min = CAR_RADIUS * 2;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      if (other.kind !== 'parked') {
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
      }
      const impact = Math.abs(car.speed - other.speed);
      if (impact > 8 && car.hitCooldown <= 0) {
        car.hitCooldown = 0.5;
        events.push({ type: 'crash', strength: impact, x: car.x, z: car.z });
        car.damage = clamp(car.damage + impact * 0.004, 0, 1);
        if (other.kind === 'police') events.push({ type: 'crime', stars: 1, reason: 'rammed a cop car' });
      }
      car.speed *= 0.98;
      if (other.kind !== 'parked') other.speed *= 0.6;
    }
  }
}

/**
 * Traffic: follows its lane down the road grid, turns at intersections, brakes for
 * the car ahead. Heading eases toward the lane heading so turns look driven.
 */
export function updateTrafficCar(car, dt, city, others, rng) {
  const laneHeading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
  car.targetHeading = laneHeading;
  car.heading += angleTo(car.heading, car.targetHeading) * Math.min(1, dt * 2.2);
  // At an intersection, sometimes turn onto the crossing road.
  const s = car.axis === 'x' ? car.x : car.z;
  const nearestLine = ROAD_LINES.reduce((best, line) => (Math.abs(s - line) < Math.abs(s - best) ? line : best), ROAD_LINES[0]);
  const nearIntersection = Math.abs(s - nearestLine) < 1.2;
  if (nearIntersection && rng.chance(dt * 0.9)) {
    const crossLine = nearestLine;
    car.axis = car.axis === 'x' ? 'z' : 'x';
    car.line = crossLine;
    car.dir = rng.chance(0.5) ? 1 : -1;
  }
  // Brake for the car ahead.
  let blocked = false;
  for (const other of others) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 100 || d2 < 1e-6) continue;
    const ahead = (dx * Math.sin(car.heading) + dz * Math.cos(car.heading)) / Math.sqrt(d2);
    if (ahead > 0.75) {
      blocked = true;
      break;
    }
  }
  const targetSpeed = blocked ? 0 : TRAFFIC_SPEED * speedJitterFor(car);
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  // Stay in the lane: ease the cross-axis position toward the lane centre.
  const laneOffset = car.dir > 0 ? 3 : -3;
  if (car.axis === 'x') {
    const wantZ = car.line + laneOffset;
    car.z += (wantZ - car.z) * Math.min(1, dt * 1.5);
  } else {
    const wantX = car.line - laneOffset;
    car.x += (wantX - car.x) * Math.min(1, dt * 1.5);
  }
  [car.x, car.z] = city.resolveCollision(car.x, car.z, CAR_RADIUS);
}

// Each traffic car keeps its own small speed variation, derived from its colour.
const speedJitter = new Map();
function speedJitterFor(car) {
  if (!speedJitter.has(car)) speedJitter.set(car, 0.85 + ((car.color % 97) / 97) * 0.3);
  return speedJitter.get(car);
}

/**
 * Police: routes along the road grid toward the player's nearest road point, then
 * pursues directly once close. If it gets stuck it is flagged for respawn.
 */
export function updatePoliceCar(car, dt, target, city, rng) {
  const d2 = dist2(car.x, car.z, target.x, target.z);
  const direct = d2 < 14 * 14;
  if (direct) {
    const want = Math.atan2(target.x - car.x, target.z - car.z);
    car.heading += angleTo(car.heading, want) * Math.min(1, dt * 3.2);
    car.speed += (POLICE_SPEED - car.speed) * Math.min(1, dt * 1.5);
  } else {
    // Grid routing: at intersections, turn onto the road that gets closer.
    const roadPoint = city.nearestRoadPoint(target.x, target.z);
    const s = car.axis === 'x' ? car.x : car.z;
    const nearestLine = ROAD_LINES.reduce((best, line) => (Math.abs(s - line) < Math.abs(s - best) ? line : best), ROAD_LINES[0]);
    if (Math.abs(s - nearestLine) < 1.5) {
      // Options: keep going, or turn onto the crossing road either way.
      const options = [];
      const cx = car.axis === 'x' ? nearestLine : car.x;
      const cz = car.axis === 'x' ? car.z : nearestLine;
      // Straight on.
      options.push({ axis: car.axis, line: car.line, dir: car.dir, x: cx + Math.sin(car.heading) * 52, z: cz + Math.cos(car.heading) * 52 });
      // Turn left / right onto the crossing road.
      const crossAxis = car.axis === 'x' ? 'z' : 'x';
      options.push({ axis: crossAxis, line: nearestLine, dir: 1, x: crossAxis === 'x' ? cx + 52 : nearestLine, z: crossAxis === 'z' ? cz + 52 : nearestLine });
      options.push({ axis: crossAxis, line: nearestLine, dir: -1, x: crossAxis === 'x' ? cx - 52 : nearestLine, z: crossAxis === 'z' ? cz - 52 : nearestLine });
      let best = options[0];
      let bestD = Infinity;
      for (const opt of options) {
        const dd = Math.abs(opt.x - roadPoint.x) + Math.abs(opt.z - roadPoint.z);
        if (dd < bestD) {
          bestD = dd;
          best = opt;
        }
      }
      car.axis = best.axis;
      car.line = best.line;
      car.dir = best.dir;
    }
    const laneHeading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? 0 : Math.PI;
    car.heading += angleTo(car.heading, laneHeading) * Math.min(1, dt * 2.6);
    car.speed += (POLICE_SPEED * 0.92 - car.speed) * Math.min(1, dt * 1.2);
    const laneOffset = car.dir > 0 ? 3 : -3;
    if (car.axis === 'x') {
      car.z += (car.line + laneOffset - car.z) * Math.min(1, dt * 1.5);
    } else {
      car.x += (car.line - laneOffset - car.x) * Math.min(1, dt * 1.5);
    }
  }
  const prevX = car.x;
  const prevZ = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  [car.x, car.z] = city.resolveCollision(car.x, car.z, CAR_RADIUS);
  const moved = Math.hypot(car.x - prevX, car.z - prevZ);
  if (car.speed > 4 && moved < 0.01) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 2.5) car.removeMe = true;
  } else {
    car.stuckTimer = 0;
  }
  void rng;
}
