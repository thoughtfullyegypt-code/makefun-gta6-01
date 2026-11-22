// Solmar itself: roads, blocks, buildings, park, plaza, beach and sea,
// plus the road graph the traffic and police drive on and the collision
// boxes everything bumps into.
import * as THREE from 'three';
import { CFG, PALETTE, LOCATIONS, ROAD_LINES } from './config.js';
import { Rng, clamp } from './rng.js';
import {
  facadeTexture,
  roadTexture,
  pavementTexture,
  grassTexture,
  sandTexture,
  waterTexture,
  warehouseTexture,
} from './textures.js';

export function isOnRoad(x, z) {
  const half = CFG.ROAD_WIDTH / 2 + 0.5;
  for (const r of ROAD_LINES) {
    if (Math.abs(x - r) < half || Math.abs(z - r) < half) return true;
  }
  return false;
}

export function nearestRoadCoord(v) {
  let best = ROAD_LINES[0];
  let bd = Math.abs(v - best);
  for (const r of ROAD_LINES) {
    const d = Math.abs(v - r);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

// Breadth-first route across the 7x7 intersection grid, from the
// intersection nearest (fx, fz) to the one nearest (tx, tz). Returns a list
// of [x, z] waypoints including the destination intersection.
export function routeOnGrid(fx, fz, tx, tz) {
  const idx = (v) => {
    let best = 0;
    let bd = Infinity;
    ROAD_LINES.forEach((r, i) => {
      const d = Math.abs(v - r);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const sx = idx(fx);
  const sz = idx(fz);
  const gx = idx(tx);
  const gz = idx(tz);
  const key = (x, z) => x * 10 + z;
  const prev = new Map();
  const queue = [[sx, sz]];
  prev.set(key(sx, sz), null);
  while (queue.length) {
    const [cx, cz] = queue.shift();
    if (cx === gx && cz === gz) break;
    for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
      if (nx < 0 || nx > 6 || nz < 0 || nz > 6) continue;
      if (prev.has(key(nx, nz))) continue;
      prev.set(key(nx, nz), [cx, cz]);
      queue.push([nx, nz]);
    }
  }
  const path = [];
  let cur = [gx, gz];
  while (cur) {
    path.unshift([ROAD_LINES[cur[0]], ROAD_LINES[cur[1]]]);
    cur = prev.get(key(cur[0], cur[1]));
  }
  return path;
}

export class City {
  constructor(scene, seed = 20261122) {
    this.scene = scene;
    this.rng = new Rng(seed);
    // Collision boxes: {minX, maxX, minZ, maxZ}
    this.solids = [];
    // Where parked cars may sit: {x, z, heading}
    this.parkingSpots = [];
    this._build();
  }

  _box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  _plane(w, d, mat, x, z, y = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  _build() {
    const rng = this.rng;
    // --- Ground, roads, beach, sea ---
    const groundMat = new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 });
    this._plane(CFG.GROUND_HALF * 2, CFG.GROUND_HALF * 2, groundMat, 0, 0);
    const roadTex = roadTexture();
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
    const span = CFG.GRID_MAX - CFG.GRID_MIN + CFG.ROAD_WIDTH;
    for (const r of ROAD_LINES) {
      const v = this._plane(CFG.ROAD_WIDTH, span, roadMat, r, 0, 0.03);
      v.material = roadMat;
      const h = this._plane(span, CFG.ROAD_WIDTH, roadMat, 0, r, 0.03);
      h.material = roadMat;
    }
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 1 });
    sandMat.map.repeat.set(8, 1);
    this._plane(420, CFG.SEA_Z - CFG.BEACH_Z, sandMat, 0, (CFG.BEACH_Z + CFG.SEA_Z) / 2, 0.02);
    const seaMat = new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.25, metalness: 0.1 });
    seaMat.map.repeat.set(6, 6);
    this._plane(900, 500, seaMat, 0, CFG.SEA_Z + 250, 0.01);

    // --- Blocks ---
    const paveMat = new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: 1 });
    paveMat.map.repeat.set(2, 2);
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
    grassMat.map.repeat.set(3, 3);
    const facades = PALETTE.building.slice(0, 4).map((c, i) => {
      const hex = '#' + c.toString(16).padStart(6, '0');
      return new THREE.MeshStandardMaterial({ map: facadeTexture(100 + i * 17, hex), roughness: 0.9 });
    });
    const roofMats = PALETTE.roof.map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
    );
    const warehouseMat = new THREE.MeshStandardMaterial({ map: warehouseTexture(), roughness: 0.8 });

    // Block centres: midpoints between road lines.
    const centres = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        centres.push([(ROAD_LINES[i] + ROAD_LINES[i + 1]) / 2, (ROAD_LINES[j] + ROAD_LINES[j + 1]) / 2]);
      }
    }
    // Special blocks: park (centre 2x2), plaza, car parks, warehouse.
    const parkBlocks = new Set(['-26,-26', '-26,26', '26,-26', '26,26']);
    const plazaBlock = '52,-52';
    const carParkBlocks = new Set(['-130,130', '130,-130']);
    const warehouseBlock = '-130,-52';

    for (const [bx, bz] of centres) {
      const key = `${bx},${bz}`;
      if (parkBlocks.has(key)) {
        this._plane(CFG.BLOCK + 8, CFG.BLOCK + 8, grassMat, bx, bz, 0.02);
        continue;
      }
      if (key === plazaBlock) {
        this._plane(CFG.BLOCK + 8, CFG.BLOCK + 8, paveMat, bx, bz, 0.02);
        this._fountain(bx, bz);
        continue;
      }
      if (carParkBlocks.has(key)) {
        this._plane(CFG.BLOCK + 8, CFG.BLOCK + 8, roadMat, bx, bz, 0.02);
        this._carPark(bx, bz);
        continue;
      }
      if (key === warehouseBlock) {
        this._plane(CFG.BLOCK + 8, CFG.BLOCK + 8, paveMat, bx, bz, 0.02);
        this._warehouse(bx, bz, warehouseMat);
        continue;
      }
      // Ordinary block: pavement slab + 1-2 buildings.
      this._plane(CFG.BLOCK + 8, CFG.BLOCK + 8, paveMat, bx, bz, 0.02);
      const n = rng.chance(0.6) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = rng.range(12, 18);
        const d = rng.range(12, 18);
        const h = rng.range(13, 30);
        const ox = n === 1 ? 0 : k === 0 ? -9 : 9;
        const oz = n === 1 ? 0 : k === 0 ? -9 : 9;
        const x = bx + ox;
        const z = bz + oz;
        const facade = rng.pick(facades);
        const roof = rng.pick(roofMats);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
          facade, facade, roof, roof, facade, facade,
        ]);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.solids.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }

    this._park();
    this._trees();
    this._streetlights();
    this._beachProps();
  }

  _fountain(x, z) {
    const basinMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.8 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.1, 24), basinMat);
    basin.position.set(x, 0.55, z);
    basin.castShadow = true;
    basin.receiveShadow = true;
    this.scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(6.4, 6.4, 0.3, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.15, metalness: 0.3 }),
    );
    water.position.set(x, 1.0, z);
    this.scene.add(water);
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 3.2, 10),
      basinMat,
    );
    spout.position.set(x, 2.4, z);
    spout.castShadow = true;
    this.scene.add(spout);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), basinMat);
    top.position.set(x, 4.3, z);
    this.scene.add(top);
    this.solids.push({ minX: x - 7.6, maxX: x + 7.6, minZ: z - 7.6, maxZ: z + 7.6 });
  }

  _carPark(bx, bz) {
    // Painted bays: thin white strips, plus parking spots for the vehicle module.
    const bayMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = -2; i <= 2; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 12), bayMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(bx + i * 6, 0.05, bz - 8);
      this.scene.add(strip);
      const strip2 = strip.clone();
      strip2.position.set(bx + i * 6, 0.05, bz + 8);
      this.scene.add(strip2);
      this.parkingSpots.push({ x: bx + i * 6, z: bz - 8, heading: 0 });
      this.parkingSpots.push({ x: bx + i * 6, z: bz + 8, heading: Math.PI });
    }
  }

  _warehouse(bx, bz, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(30, 11, 20), mat);
    mesh.position.set(bx, 5.5, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.solids.push({ minX: bx - 15, maxX: bx + 15, minZ: bz - 10, maxZ: bz + 10 });
    // Crates outside the warehouse door.
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 1 });
    const cratePositions = [[-18, -4], [-18, 2], [16, 6], [18, -6]];
    for (const [ox, oz] of cratePositions) {
      this._box(2.2, 2.2, 2.2, crateMat, bx + ox, 1.1, bz + oz);
    }
  }

  _park() {
    // A small pond and winding path in the park centre.
    const pond = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.3, 24),
      new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.15, metalness: 0.3 }),
    );
    pond.position.set(0, 0.15, 0);
    this.scene.add(pond);
  }

  _trees() {
    const rng = this.rng;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 1 });
    const topGeo = new THREE.SphereGeometry(2.2, 8, 6);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x4d8a3f, roughness: 1 });
    const spots = [];
    // Park trees.
    for (let i = 0; i < 26; i++) {
      const x = rng.range(-46, 46);
      const z = rng.range(-46, 46);
      if (Math.abs(x) < 12 && Math.abs(z) < 12) continue; // keep the pond clear
      spots.push([x, z, rng.range(0.8, 1.4)]);
    }
    // Street trees along two avenues.
    for (let i = 0; i < 10; i++) {
      spots.push([-148 + i * 32, -49, rng.range(0.8, 1.2)]);
      spots.push([-148 + i * 32, 49, rng.range(0.8, 1.2)]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const tops = new THREE.InstancedMesh(topGeo, topMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, s], i) => {
      m.makeScale(s, s, s);
      m.setPosition(x, 1.3 * s, z);
      trunks.setMatrixAt(i, m);
      m.makeScale(s, s, s);
      m.setPosition(x, (2.6 + 1.6) * s, z);
      tops.setMatrixAt(i, m);
    });
    trunks.castShadow = true;
    tops.castShadow = true;
    this.scene.add(trunks);
    this.scene.add(tops);
  }

  _streetlights() {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.4 });
    const headGeo = new THREE.BoxGeometry(1.6, 0.25, 0.4);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
    const spots = [];
    for (const r of ROAD_LINES) {
      for (let v = -140; v <= 140; v += 56) {
        spots.push([r + 7, v, 0]);
        spots.push([v, r + 7, 1]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach(([x, z, rot], i) => {
      m.makeRotationFromQuaternion(new THREE.Quaternion());
      m.setPosition(x, 3, z);
      poles.setMatrixAt(i, m);
      e.set(0, rot ? Math.PI / 2 : 0, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 6, z), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(i, m);
    });
    this.scene.add(poles);
    this.scene.add(heads);
  }

  _beachProps() {
    const rng = this.rng;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
    const colors = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xe87a2e, 0x7a4fc2];
    for (let i = 0; i < 8; i++) {
      const x = -160 + i * 44 + rng.range(-8, 8);
      const z = CFG.BEACH_Z + 12 + rng.range(0, 18);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), poleMat);
      pole.position.set(x, 1.3, z);
      this.scene.add(pole);
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(2.4, 1.0, 8),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9 }),
      );
      top.position.set(x, 2.9, z);
      top.castShadow = true;
      this.scene.add(top);
    }
  }

  // Push a circle (x, z, radius) out of every solid it overlaps. Returns the
  // corrected position. Cheap: only checks boxes near the point.
  collideCircle(x, z, r) {
    for (const b of this.solids) {
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pl = x - b.minX + r;
        const pr = b.maxX - x + r;
        const pt = z - b.minZ + r;
        const pb = b.maxZ - z + r;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = b.minX - r;
        else if (m === pr) x = b.maxX + r;
        else if (m === pt) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    return { x, z };
  }

  // A random point on a road, for spawning traffic.
  randomRoadPoint(rng) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(CFG.GRID_MIN, CFG.GRID_MAX);
    return vertical ? { x: line, z: along } : { x: along, z: line };
  }

  // The named place containing (x, z), or null.
  locationAt(x, z) {
    for (const loc of LOCATIONS) {
      const dx = x - loc.x;
      const dz = z - loc.z;
      if (dx * dx + dz * dz < loc.r * loc.r) return loc;
    }
    return null;
  }
}
