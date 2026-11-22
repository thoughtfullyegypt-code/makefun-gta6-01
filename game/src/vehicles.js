// Cars: the mesh factory, traffic AI, parked cars, and the player's
// arcade driving model. Police cars reuse the factory from police.js.
import * as THREE from 'three';
import { CFG, PALETTE, ROAD_LINES } from './config.js';
import { Rng, clamp, angleDelta, dist2 } from './rng.js';
import { isOnRoad, nearestRoadCoord } from './city.js';

// A stylised car from boxes and cylinders. Returns {group, wheels, bodyMat}
// so the caller can spin the wheels and darken the body with damage.
export function buildCarMesh(color, police = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: police ? 0xf2f2f2 : color,
    roughness: 0.35,
    metalness: 0.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.2, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), darkMat);
  cabin.position.set(0, 1.28, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
    wheels.push(w);
  }
  // Headlights and tail lights.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xc22a1e, emissive: 0x881508, emissiveIntensity: 0.7 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.1), headMat);
    h.position.set(sx, 0.66, 2.22);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.1), tailMat);
    t.position.set(sx, 0.66, -2.22);
    group.add(t);
  }
  if (police) {
    // Black doors stripe + red/blue light bar.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
    stripe.position.y = 0.72;
    group.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.5), darkMat);
    barBase.position.set(0, 1.68, -0.2);
    group.add(barBase);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.5 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x0030ff, emissiveIntensity: 1.5 });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), redMat);
    red.position.set(-0.4, 1.82, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.4), blueMat);
    blue.position.set(0.4, 1.82, -0.2);
    group.add(blue);
    group.userData.lightBar = { redMat, blueMat };
  }
  return { group, wheels, bodyMat };
}

class Car {
  constructor(mesh, x, z, heading, opts = {}) {
    this.mesh = mesh.group;
    this.wheels = mesh.wheels;
    this.bodyMat = mesh.bodyMat;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.damage = 0;
    this.isPolice = !!opts.police;
    this.isTraffic = !!opts.traffic;
    this.isParked = !!opts.parked;
    this.hasDriver = !!opts.driver;
    this.driverMesh = opts.driverMesh || null;
    this.radius = 2.0;
    this.sync();
  }
  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.wheels) w.rotation.x += this.speed * 0.06;
  }
}

export class VehicleManager {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.traffic = [];
    this.onCrime = null; // (kind) => void, set by the game
    this.onCrash = null; // (strength) => void
  }

  addCar(color, x, z, heading, opts = {}) {
    const mesh = buildCarMesh(color, opts.police);
    let driverMesh = null;
    if (opts.driver) {
      driverMesh = new THREE.Group();
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.6, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }),
      );
      torso.position.y = 1.15;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 }),
      );
      head.position.y = 1.6;
      driverMesh.add(torso, head);
      mesh.group.add(driverMesh);
    }
    const car = new Car(mesh, x, z, heading, { ...opts, driverMesh });
    this.scene.add(car.mesh);
    this.cars.push(car);
    if (car.isTraffic) {
      car.axis = opts.axis || 'x';
      car.dir = opts.dir || 1;
      car.waitTime = 0;
      this.traffic.push(car);
    }
    return car;
  }

  // Fill the streets with moving traffic and the car parks with parked cars.
  populate(playerX, playerZ) {
    const rng = this.rng;
    for (let i = 0; i < CFG.TRAFFIC_COUNT; i++) {
      const p = this.city.randomRoadPoint(rng);
      const vertical = rng.chance(0.5);
      const dir = rng.chance(0.5) ? 1 : -1;
      const heading = vertical ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      // Right-hand lane offset.
      let x = p.x;
      let z = p.z;
      if (vertical) x += dir > 0 ? -3 : 3;
      else z += dir > 0 ? 3 : -3;
      const car = this.addCar(rng.pick(PALETTE.car), x, z, heading, {
        traffic: true,
        driver: true,
        axis: vertical ? 'z' : 'x',
        dir,
      });
      car.speed = rng.range(8, 12);
    }
    // Parked cars in the car parks and along one kerb.
    const spots = [...this.city.parkingSpots];
    rng.shuffle(spots);
    for (const spot of spots.slice(0, 8)) {
      this.addCar(rng.pick(PALETTE.car), spot.x, spot.z, spot.heading, { parked: true });
    }
    for (let i = 0; i < 4; i++) {
      this.addCar(rng.pick(PALETTE.car), 7 + ROAD_LINES[1], -100 + i * 40, Math.PI / 2, { parked: true });
    }
    // The starter car, waiting at the kerb by the garage, facing south
    // down the road so the first drive is a straight pull-away.
    const starter = this.addCar(0xc23b2e, 4, -24, 0, { parked: true });
    starter.isStarter = true;
    return starter;
  }

  nearestCar(x, z, maxDist = 4.5) {
    let best = null;
    let bd = maxDist * maxDist;
    for (const car of this.cars) {
      const d = dist2(x, z, car.x, car.z);
      if (d < bd) {
        bd = d;
        best = car;
      }
    }
    return best;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    this.cars = this.cars.filter((c) => c !== car);
    this.traffic = this.traffic.filter((c) => c !== car);
  }

  // --- Player driving ---
  drivePlayer(car, input, dt) {
    const ax = input.moveAxes();
    const top = CFG.CAR_TOP_SPEED * (1 - 0.45 * car.damage);
    if (ax.y > 0) car.speed += CFG.CAR_ACCEL * dt;
    else if (ax.y < 0) {
      if (car.speed > 0.5) car.speed -= CFG.CAR_BRAKE * dt;
      else car.speed -= CFG.CAR_ACCEL * 0.6 * dt;
    } else {
      // Rolling drag.
      car.speed -= car.speed * 0.6 * dt;
      if (Math.abs(car.speed) < 0.1) car.speed = 0;
    }
    if (input.handbrake) {
      car.speed -= car.speed * 2.2 * dt;
      if (Math.abs(car.speed) < 0.5) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CFG.CAR_REVERSE_SPEED, top);
    // Steering: less effective at speed, stronger with the handbrake.
    const speedFactor = clamp(1 - Math.abs(car.speed) / (top * 1.6), 0.35, 1);
    const steerBoost = input.handbrake ? 1.6 : 1;
    const dirSign = car.speed >= 0 ? 1 : -1;
    car.heading += ax.x * CFG.CAR_TURN_RATE * speedFactor * steerBoost * dirSign * dt * clamp(Math.abs(car.speed) / 6, 0, 1);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const hit = this._moveCar(car, nx, nz);
    if (hit && Math.abs(car.speed) > 6) {
      car.damage = clamp(car.damage + 0.08, 0, 1);
      if (this.onCrash) this.onCrash(clamp(Math.abs(car.speed) / 20, 0.3, 1));
      car.speed *= -0.25;
    }
    car.sync();
  }

  // Move a car, resolving building and car collisions. Returns true on a hit.
  _moveCar(car, nx, nz) {
    let hit = false;
    const fixed = this.city.collideCircle(nx, nz, car.radius);
    if (fixed.x !== nx || fixed.z !== nz) hit = true;
    nx = fixed.x;
    nz = fixed.z;
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = nx - other.x;
      const dz = nz - other.z;
      const rr = car.radius + other.radius - 0.6;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
        if (!other.isTraffic || Math.abs(car.speed) > 3) {
          other.x -= (dx / d) * push;
          other.z -= (dz / d) * push;
          other.sync();
        }
        hit = true;
      }
    }
    // Stay inside the world.
    nx = clamp(nx, -CFG.GROUND_HALF + 10, CFG.GROUND_HALF - 10);
    nz = clamp(nz, -CFG.GROUND_HALF + 10, CFG.SEA_Z - 4);
    car.x = nx;
    car.z = nz;
    return hit;
  }

  // --- Traffic AI ---
  updateTraffic(dt, playerPos, peds) {
    for (const car of this.traffic) {
      // Respawn far-away cars near the player.
      const pd = dist2(car.x, car.z, playerPos.x, playerPos.z);
      if (pd > 260 * 260) {
        const p = this.city.randomRoadPoint(this.rng);
        // Pull the respawn point toward the player so streets stay busy.
        car.x = p.x * 0.5 + playerPos.x * 0.5;
        car.z = p.z * 0.5 + playerPos.z * 0.5;
        car.x = nearestRoadCoord(car.x);
        car.speed = this.rng.range(8, 12);
      }
      // Obstacle ahead? Brake.
      const ahead = this._blockedAhead(car, playerPos, peds);
      const targetSpeed = ahead ? 0 : this.rng ? 11 : 11;
      if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + 6 * dt);
      else car.speed = Math.max(targetSpeed, car.speed - 14 * dt);
      // At an intersection, sometimes turn.
      if (this._atIntersection(car)) {
        const r = this.rng.f();
        if (r < 0.18) this._turn(car, -1);
        else if (r < 0.36) this._turn(car, 1);
      }
      const targetHeading = this._headingFor(car);
      car.heading += angleDelta(car.heading, targetHeading) * Math.min(1, dt * 3.5);
      const nx = car.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.z + Math.cos(car.heading) * car.speed * dt;
      // Traffic stays on its lane: pull gently back to the lane line.
      const lane = this._lanePos(car);
      car.x = nx + (lane.x - nx) * Math.min(1, dt * 1.2);
      car.z = nz + (lane.z - nz) * Math.min(1, dt * 1.2);
      const fixed = this.city.collideCircle(car.x, car.z, car.radius);
      car.x = fixed.x;
      car.z = fixed.z;
      car.sync();
    }
  }

  _headingFor(car) {
    if (car.axis === 'z') return car.dir > 0 ? 0 : Math.PI;
    return car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  _lanePos(car) {
    if (car.axis === 'z') {
      return { x: nearestRoadCoord(car.x) + (car.dir > 0 ? -3 : 3), z: car.z };
    }
    return { x: car.x, z: nearestRoadCoord(car.z) + (car.dir > 0 ? 3 : -3) };
  }

  _atIntersection(car) {
    const nearX = ROAD_LINES.some((r) => Math.abs(car.x - r) < 6);
    const nearZ = ROAD_LINES.some((r) => Math.abs(car.z - r) < 6);
    if (nearX && nearZ) {
      if (car._lastTurnAt && Math.abs(car.x - car._lastTurnAt.x) < 8 && Math.abs(car.z - car._lastTurnAt.z) < 8) return false;
      car._lastTurnAt = { x: car.x, z: car.z };
      return true;
    }
    return false;
  }

  _turn(car, side) {
    // side -1 = left, +1 = right, relative to travel direction.
    if (car.axis === 'z') {
      car.axis = 'x';
      car.dir = car.dir * side * -1;
    } else {
      car.axis = 'z';
      car.dir = car.dir * side;
    }
  }

  _blockedAhead(car, playerPos, peds) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const forward = dx * fx + dz * fz;
      if (forward < 0 || forward > 11) continue;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 2.2) return true;
    }
    // A person on foot ahead.
    const pdx = playerPos.x - car.x;
    const pdz = playerPos.z - car.z;
    const pf = pdx * fx + pdz * fz;
    if (pf > 0 && pf < 8 && Math.abs(pdx * fz - pdz * fx) < 2) return true;
    for (const ped of peds) {
      if (ped.down) continue;
      const dx = ped.x - car.x;
      const dz = ped.z - car.z;
      const f = dx * fx + dz * fz;
      if (f > 0 && f < 9 && Math.abs(dx * fz - dz * fx) < 2) return true;
    }
    return false;
  }

  // Steal a car: the driver (if any) gets out and flees. Returns the crime
  // kind ('traffic' | 'police' | null) for the wanted system.
  steal(car) {
    let crime = null;
    if (car.isTraffic) crime = 'traffic';
    else if (car.isPolice) crime = 'police';
    if (car.hasDriver && car.driverMesh) {
      car.mesh.remove(car.driverMesh);
      car.driverMesh = null;
      car.hasDriver = false;
    }
    car.isTraffic = false;
    car.isParked = false;
    this.traffic = this.traffic.filter((c) => c !== car);
    return crime;
  }
}
