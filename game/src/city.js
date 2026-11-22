// city.js: builds Solmar — a 7x7 road grid of sun-bleached blocks, a park, car parks,
// a beach and the sea — and owns the collision boxes, the road network and the named
// places the missions drive to. Everything is procedural and seeded, so the same seed
// always builds the same city.

import * as THREE from 'three';
import { BLOCK, BLOCK_CENTRES, CITY_EDGE, PITCH, ROAD_LINES, ROAD_W } from './config.js';
import { collideCircleBox } from './utils.js';
import { facadeTexture, grassTexture, pavementTexture, roadTexture, roofTexture, sandTexture } from './textures.js';

const FACADE_COLOURS = ['#e8dcc4', '#d9c8a8', '#c9b18c', '#e0d0b0', '#cbb59a', '#d8cbb2'];
const WORLD_MIN = -208;
const WORLD_MAX = 208;
const SEA_MAX_Z = 230;

export function createCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // ---- Materials (shared, so the city is a few dozen draw calls of buildings) ----
  const facades = FACADE_COLOURS.map((c) => new THREE.MeshLambertMaterial({ map: facadeTexture(c, rng) }));
  const roofs = [new THREE.MeshLambertMaterial({ map: roofTexture(rng) }), new THREE.MeshLambertMaterial({ map: roofTexture(rng) })];
  const pavement = new THREE.MeshLambertMaterial({ map: pavementTexture() });
  pavement.map.repeat.set(5, 5);
  const grass = new THREE.MeshLambertMaterial({ map: grassTexture() });
  grass.map.repeat.set(6, 6);
  const sand = new THREE.MeshLambertMaterial({ map: sandTexture() });
  sand.map.repeat.set(28, 3);
  // Two road materials: one with dashes along the north-south roads, one rotated
  // for the east-west roads (a plane's texture V axis runs across an EW road).
  const roadTexNS = roadTexture();
  roadTexNS.repeat.set(1, 24);
  const roadMatNS = new THREE.MeshLambertMaterial({ map: roadTexNS });
  const roadTexEW = roadTexture();
  roadTexEW.center.set(0.5, 0.5);
  roadTexEW.rotation = Math.PI / 2;
  roadTexEW.repeat.set(1, 24);
  const roadMatEW = new THREE.MeshLambertMaterial({ map: roadTexEW });

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const buildingMeshes = [];

  function addBuilding(cx, cz, w, d, h) {
    const facade = facades[rng.int(0, facades.length - 1)];
    const roof = roofs[rng.int(0, roofs.length - 1)];
    const mesh = new THREE.Mesh(unitBox, [facade, facade, roof, roof, facade, facade]);
    mesh.position.set(cx, h / 2, cz);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    buildingMeshes.push(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  }

  // ---- Ground, roads, beach, sea ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x8a8578 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  for (const line of ROAD_LINES) {
    const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, CITY_EDGE * 2 + 24), roadMatNS);
    roadNS.rotation.x = -Math.PI / 2;
    roadNS.position.set(line, 0.02, 0);
    roadNS.receiveShadow = true;
    group.add(roadNS);
    const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(CITY_EDGE * 2 + 24, ROAD_W), roadMatEW);
    roadEW.rotation.x = -Math.PI / 2;
    roadEW.position.set(0, 0.02, line);
    roadEW.receiveShadow = true;
    group.add(roadEW);
  }

  const beach = new THREE.Mesh(new THREE.PlaneGeometry(560, 52), sand);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.03, 208);
  beach.receiveShadow = true;
  group.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 500),
    new THREE.MeshLambertMaterial({ color: 0x2e7fb8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.15, 480);
  group.add(sea);
  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 6),
    new THREE.MeshLambertMaterial({ color: 0xbfe3ef }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, 0.05, 233);
  group.add(shore);

  // ---- Blocks: buildings, park, car parks, plaza ----
  const parkBlock = { x: -26, z: -26 };
  const carParks = [
    { x: 26, z: 130 },
    { x: -130, z: 26 },
  ];
  const plazaBlock = { x: 78, z: -78 };
  const parkingSlots = [];

  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const isPark = bx === parkBlock.x && bz === parkBlock.z;
      const isCarPark = carParks.some((p) => p.x === bx && p.z === bz);
      const isPlaza = bx === plazaBlock.x && bz === plazaBlock.z;
      // The block's sidewalk slab.
      const slab = new THREE.Mesh(unitBox, isPark ? grass : pavement);
      slab.position.set(bx, 0.15, bz);
      slab.scale.set(BLOCK, 0.3, BLOCK);
      slab.receiveShadow = true;
      group.add(slab);

      if (isPark) continue; // trees go in below
      if (isPlaza) {
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(5, 5.5, 0.8, 20),
          new THREE.MeshLambertMaterial({ color: 0x9fb4c0 }),
        );
        fountain.position.set(bx, 0.7, bz);
        fountain.castShadow = true;
        group.add(fountain);
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(4.4, 4.4, 0.2, 20),
          new THREE.MeshLambertMaterial({ color: 0x4da6d8 }),
        );
        water.position.set(bx, 1.1, bz);
        group.add(water);
        colliders.push({ minX: bx - 5, maxX: bx + 5, minZ: bz - 5, maxZ: bz + 5 });
        continue;
      }
      if (isCarPark) {
        for (let row = 0; row < 2; row += 1) {
          for (let i = 0; i < 5; i += 1) {
            parkingSlots.push({ x: bx - 14 + i * 7, z: bz - 8 + row * 16, heading: 0 });
          }
        }
        continue;
      }
      // Downtown towers near the centre, low blocks at the edges.
      const downtown = Math.abs(bx) < 80 && Math.abs(bz) < 80;
      if (downtown && rng.chance(0.55)) {
        addBuilding(bx, bz, rng.range(26, 32), rng.range(26, 32), rng.range(26, 48));
      } else if (rng.chance(0.5)) {
        addBuilding(bx - 9, bz, rng.range(15, 19), rng.range(24, 30), rng.range(9, 18));
        addBuilding(bx + 10, bz, rng.range(15, 19), rng.range(24, 30), rng.range(9, 22));
      } else {
        addBuilding(bx, bz - 9, rng.range(26, 32), rng.range(15, 18), rng.range(8, 16));
        addBuilding(bx, bz + 10, rng.range(26, 32), rng.range(15, 18), rng.range(8, 16));
      }
    }
  }

  // ---- Streetlights (instanced: one draw call for every pole, one for every head) ----
  // Lamps sit 7 m off a road's centre line — on the pavement, never in the road.
  // A lamp is dropped if it would stand on any road (within 6 m of a centre line
  // on either axis), and duplicates are removed.
  const lampPositions = [];
  const lampSeen = new Set();
  const onRoad = (x, z) => ROAD_LINES.some((line) => Math.abs(x - line) < 6 || Math.abs(z - line) < 6);
  for (const line of ROAD_LINES) {
    for (let s = -156; s <= 156; s += 26) {
      for (const [x, z] of [[line + 7, s], [s, line + 7]]) {
        const key = `${x},${z}`;
        if (!onRoad(x, z) && !lampSeen.has(key)) {
          lampSeen.add(key);
          lampPositions.push([x, z]);
        }
      }
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const headGeo = new THREE.BoxGeometry(1.6, 0.25, 0.5);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x554411 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampPositions.length);
  const m4 = new THREE.Matrix4();
  lampPositions.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3.5, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 7.1, z);
    heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(heads);

  // ---- Palm trees along the beach and in the park (instanced trunks and fronds) ----
  const palmSpots = [];
  for (let x = -190; x <= 190; x += 18) {
    if (rng.chance(0.75)) palmSpots.push([x + rng.range(-3, 3), 190 + rng.range(0, 6)]);
  }
  for (let i = 0; i < 14; i += 1) {
    palmSpots.push([parkBlock.x + rng.range(-16, 16), parkBlock.z + rng.range(-16, 16)]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const frondGeo = new THREE.BoxGeometry(4.6, 0.12, 0.9);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 5);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s1 = new THREE.Vector3(1, 1, 1);
  palmSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 3, z);
    trunks.setMatrixAt(i, m4);
    for (let f = 0; f < 5; f += 1) {
      e.set(0.5, (f / 5) * Math.PI * 2, 0);
      q.setFromEuler(e);
      v.set(x, 6.1, z);
      m4.compose(v, q, s1);
      fronds.setMatrixAt(i * 5 + f, m4);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  group.add(trunks);
  group.add(fronds);

  // ---- Beach umbrellas ----
  const umbrellaSpots = [];
  for (let x = -170; x <= 170; x += 34) {
    if (rng.chance(0.6)) umbrellaSpots.push([x, 205 + rng.range(0, 14)]);
  }
  const umbPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5);
  const umbPoles = new THREE.InstancedMesh(umbPoleGeo, poleMat, umbrellaSpots.length);
  const umbTopGeo = new THREE.ConeGeometry(2.4, 0.9, 8);
  const umbTopMat = new THREE.MeshLambertMaterial({ color: 0xe85d3d });
  const umbTops = new THREE.InstancedMesh(umbTopGeo, umbTopMat, umbrellaSpots.length);
  umbrellaSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 1.3, z);
    umbPoles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 2.9, z);
    umbTops.setMatrixAt(i, m4);
  });
  umbPoles.instanceMatrix.needsUpdate = true;
  umbTops.instanceMatrix.needsUpdate = true;
  group.add(umbPoles);
  group.add(umbTops);

  // ---- Named places (missions and spawns drive to these road points) ----
  const locations = {
    garage: { x: 8, z: -18, name: "Ray's Garage" },
    docks: { x: -104, z: 156, name: 'South Docks' },
    warehouse: { x: 104, z: -130, name: 'Harbor Warehouse' },
    safehouse: { x: -78, z: 78, name: 'Safehouse' },
    hospital: { x: 78, z: -26, name: 'Solmar General' },
    policeStation: { x: -26, z: 104, name: 'Solmar PD' },
    park: { x: -26, z: -26, name: 'Palma Park' },
    beach: { x: 0, z: 205, name: 'Solmar Beach' },
    plaza: { x: 78, z: -78, name: 'Fountain Plaza' },
    northGate: { x: 0, z: -156, name: 'North Gate' },
  };

  function nearestRoadLine(value) {
    let best = ROAD_LINES[0];
    for (const line of ROAD_LINES) {
      if (Math.abs(value - line) < Math.abs(value - best)) best = line;
    }
    return best;
  }

  return {
    group,
    colliders,
    locations,
    parkingSlots,
    buildingCount: buildingMeshes.length,
    /** The nearest point on a road centreline to (x, z). */
    nearestRoadPoint(x, z) {
      const nx = nearestRoadLine(x);
      const nz = nearestRoadLine(z);
      return Math.abs(x - nx) < Math.abs(z - nz) ? { x: nx, z } : { x, z: nz };
    },
    /** A random point on a random road. */
    randomRoadPoint(rng2) {
      const line = rng2.pick(ROAD_LINES);
      const along = rng2.range(-150, 150);
      return rng2.chance(0.5) ? { x: line, z: along } : { x: along, z: line };
    },
    isOnRoad(x, z) {
      return Math.abs(x - nearestRoadLine(x)) < ROAD_W / 2 + 1 || Math.abs(z - nearestRoadLine(z)) < ROAD_W / 2 + 1;
    },
    /** Pushes a circle out of every building and clamps it inside the world. */
    resolveCollision(x, z, radius) {
      let px = x;
      let pz = z;
      for (const box of colliders) {
        [px, pz] = collideCircleBox(px, pz, radius, box);
      }
      px = Math.max(WORLD_MIN, Math.min(WORLD_MAX, px));
      pz = Math.max(WORLD_MIN, Math.min(SEA_MAX_Z, pz));
      return [px, pz];
    },
  };
}

// PITCH is the grid spacing the road lines and block centres are built on; it is
// exported from config for the layout's documentation and kept imported here so the
// module's dependency on the layout constants stays explicit.
void PITCH;
