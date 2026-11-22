// Combat: the player's pistol (ray-cast shots with tracers and a muzzle
// flash) and the Viper gunmen of the final mission, who shoot back.
import * as THREE from 'three';
import { CFG } from './config.js';

// Slab-method ray vs axis-aligned box. Returns the distance along the ray
// to the first hit, or Infinity when the ray misses.
export function rayVsBox(ox, oy, oz, dx, dy, dz, box, height = 30) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, 0, height],
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

export class Combat {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.tracerPool = [];
    this.enemies = [];
    // Muzzle flash: a short-lived point light at the gun.
    this.flash = new THREE.PointLight(0xffc860, 0, 12, 2);
    this.scene.add(this.flash);
    this.flashTimer = 0;
  }

  _tracer(from, to, color = 0xffe9a0) {
    let line = this.tracerPool.pop();
    if (!line) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }),
      );
      this.scene.add(line);
    }
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    line.material.opacity = 0.9;
    line.visible = true;
    this.tracers.push({ line, life: 0.08 });
  }

  // The player's shot. origin/direction in world space; targets is an array
  // of {group, ref} (peds, enemies). Returns the ref hit, or null.
  playerShot(origin, direction, targets, maxDist = 120) {
    // Nearest wall first.
    let wallDist = maxDist;
    for (const box of this.city.solids) {
      const d = rayVsBox(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, box);
      if (d < wallDist) wallDist = d;
    }
    // Then the nearest person.
    this.raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(direction.x, direction.y, direction.z),
    );
    this.raycaster.far = Math.min(wallDist, maxDist);
    const groups = targets.filter((t) => !t.ref.down).map((t) => t.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    let hitRef = null;
    let endDist = wallDist;
    if (hits.length > 0) {
      const hit = hits[0];
      endDist = hit.distance;
      let obj = hit.object;
      while (obj && obj.parent !== this.scene) obj = obj.parent;
      const found = targets.find((t) => t.group === obj);
      if (found) hitRef = found.ref;
    }
    const end = {
      x: origin.x + direction.x * endDist,
      y: origin.y + direction.y * endDist,
      z: origin.z + direction.z * endDist,
    };
    this._tracer(origin, end);
    this.flash.position.set(origin.x, origin.y, origin.z);
    this.flash.intensity = 60;
    this.flashTimer = 0.05;
    return { hit: hitRef, point: end };
  }

  // --- Viper gunmen ---
  spawnEnemies(spots) {
    for (const [x, z] of spots) {
      const group = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
      const black = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 });
      const red = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.8 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), black);
      torso.position.y = 1.1;
      torso.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
      head.position.y = 1.7;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), red);
      band.position.y = 1.82;
      const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.26);
      const legL = new THREE.Mesh(legGeo, black);
      legL.position.set(-0.16, 0.38, 0);
      const legR = new THREE.Mesh(legGeo, black);
      legR.position.set(0.16, 0.38, 0);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.16, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 }),
      );
      gun.position.set(0.3, 1.25, 0.4);
      group.add(torso, head, band, legL, legR, gun);
      group.position.set(x, 0, z);
      this.scene.add(group);
      this.enemies.push({
        group, x, z, health: 100, down: false,
        shootTimer: 1 + Math.random() * 1.5,
        strafe: (Math.random() - 0.5) * 2,
      });
    }
  }

  aliveEnemies() {
    return this.enemies.filter((e) => !e.down);
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }

  // Enemies strafe, face the player and fire. onHit is called with the
  // damage when a shot lands on the player.
  updateEnemies(dt, playerPos, onHit) {
    for (const e of this.enemies) {
      if (e.down) continue;
      const dx = playerPos.x - e.x;
      const dz = playerPos.z - e.z;
      const dist = Math.hypot(dx, dz);
      e.group.rotation.y = Math.atan2(dx, dz);
      // Strafe sideways to stay lively.
      e.strafe += dt * 0.7;
      const strafe = Math.sin(e.strafe) * 0.6;
      e.x += -Math.cos(e.group.rotation.y) * strafe * dt;
      e.z += Math.sin(e.group.rotation.y) * strafe * dt;
      const fixed = this.city.collideCircle(e.x, e.z, 0.6);
      e.x = fixed.x;
      e.z = fixed.z;
      e.group.position.set(e.x, 0, e.z);
      if (dist > CFG.ENEMY_RANGE) continue;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.2 + Math.random() * 1.2;
        const from = { x: e.x, y: 1.4, z: e.z };
        const to = { x: playerPos.x, y: 1.1, z: playerPos.z };
        this._tracer(from, to, 0xff9090);
        if (Math.random() < 0.45) onHit(CFG.ENEMY_SHOT_DAMAGE);
      }
    }
  }

  update(dt) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.line.visible = false;
        this.tracerPool.push(t.line);
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.life / 0.08;
      }
    }
  }
}
