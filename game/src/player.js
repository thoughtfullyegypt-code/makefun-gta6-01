// Marco "Mars" Delgado on foot: camera-relative WASD movement, sprint, a
// visible walk cycle, and getting in and out of cars.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, angleDelta } from './rng.js';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.x = 0;
    this.z = 0;
    this.heading = 0; // facing, radians; 0 = +z
    this.camYaw = 0; // camera yaw, updated by the game from the mouse
    this.health = CFG.PLAYER_HEALTH;
    this.lastHurtAt = -99;
    this.walkPhase = 0;
    this.moving = false;
    this.car = null; // the car Marco is driving, or null
    this._buildMesh();
  }

  _buildMesh() {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x2e6fc2, roughness: 0.85 });
    const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3a5e, roughness: 0.9 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), jacket);
    torso.position.y = 1.1;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
    head.position.y = 1.7;
    head.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, 1.1), hair);
    cap.position.y = 1.74;
    const legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.26);
    this.legL = new THREE.Mesh(legGeo, jeans);
    this.legL.position.set(-0.16, 0.38, 0);
    this.legR = new THREE.Mesh(legGeo, jeans);
    this.legR.position.set(0.16, 0.38, 0);
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.22);
    this.armL = new THREE.Mesh(armGeo, jacket);
    this.armL.position.set(-0.42, 1.1, 0);
    this.armR = new THREE.Mesh(armGeo, jacket);
    this.armR.position.set(0.42, 1.1, 0);
    // A simple pistol in the right hand.
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.6 }),
    );
    gun.position.set(0, -0.36, 0.14);
    this.armR.add(gun);
    group.add(torso, head, cap, this.legL, this.legR, this.armL, this.armR);
    this.mesh = group;
    this.scene.add(group);
  }

  setPosition(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.sync();
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = !this.car;
  }

  // On-foot movement, relative to the camera yaw. Returns true if moving.
  updateOnFoot(input, dt, city) {
    const ax = input.moveAxes();
    const speed = input.sprint ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
    this.moving = ax.x !== 0 || ax.y !== 0;
    if (this.moving) {
      // Camera-relative: forward is where the camera looks.
      const sin = Math.sin(this.camYaw);
      const cos = Math.cos(this.camYaw);
      let mx = sin * ax.y + cos * ax.x;
      let mz = cos * ax.y - sin * ax.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading += angleDelta(this.heading, targetHeading) * Math.min(1, dt * 10);
      const step = speed * dt;
      let nx = this.x + mx * step;
      let nz = this.z + mz * step;
      const fixed = city.collideCircle(nx, nz, CFG.PLAYER_RADIUS);
      nx = clamp(fixed.x, -CFG.GROUND_HALF + 5, CFG.GROUND_HALF - 5);
      nz = clamp(fixed.z, -CFG.GROUND_HALF + 5, CFG.SEA_Z - 2);
      this.x = nx;
      this.z = nz;
      this.walkPhase += dt * speed * 1.6;
    }
    const swing = Math.sin(this.walkPhase) * (this.moving ? 0.6 : 0);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.6;
    this.armR.rotation.x = swing * 0.6;
    this.sync();
  }

  // Where a shot starts (the gun) in world space.
  gunPosition() {
    return {
      x: this.x + Math.sin(this.heading) * 0.5,
      y: 1.25,
      z: this.z + Math.cos(this.heading) * 0.5,
    };
  }

  hurt(amount, now) {
    this.health = Math.max(0, this.health - amount);
    this.lastHurtAt = now;
  }

  // Health regenerates after a few quiet seconds.
  regen(dt, now) {
    if (now - this.lastHurtAt > CFG.HEALTH_REGEN_DELAY && this.health > 0 && this.health < CFG.PLAYER_HEALTH) {
      this.health = Math.min(CFG.PLAYER_HEALTH, this.health + CFG.HEALTH_REGEN_RATE * dt);
    }
  }
}
