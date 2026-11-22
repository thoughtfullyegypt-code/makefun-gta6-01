// Third-person follow camera. The mouse turns it; it trails the player (or
// the car) on a stiff spring so it never lags far behind, and it pulls in
// when a wall would block the view.
import * as THREE from 'three';
import { clamp, dampFactor, angleDelta } from './rng.js';
import { rayVsBox } from './combat.js';

export class FollowCamera {
  constructor(camera, city) {
    this.camera = camera;
    this.city = city;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = 9;
    this.target = new THREE.Vector3();
    this.position = new THREE.Vector3(0, 6, -12);
  }

  addMouse(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch = clamp(this.pitch + dy * 0.0022, -0.15, 0.85);
  }

  // Follow a moving focus (player or car). inCar widens the shot.
  update(dt, focus, heading, inCar, speed) {
    const dist = inCar ? 10.5 + Math.min(2.5, Math.abs(speed) * 0.06) : 9;
    // Behind a car, the camera swings toward the car's heading.
    if (inCar && Math.abs(speed) > 3) {
      const want = heading + Math.PI;
      this.yaw += angleDelta(this.yaw, want) * dampFactor(2.2, dt);
    }
    const cx = focus.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const cz = focus.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const cy = focus.y + 2.2 + Math.sin(this.pitch) * dist;
    // Pull in when a building blocks the line from the focus to the camera.
    let d = dist;
    const dir = { x: cx - focus.x, y: cy - focus.y, z: cz - focus.z };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len;
    dir.y /= len;
    dir.z /= len;
    for (const box of this.city.solids) {
      const hit = rayVsBox(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z, box);
      if (hit < d) d = Math.max(2.5, hit - 0.6);
    }
    const px = focus.x + dir.x * d;
    const py = Math.max(1.4, focus.y + dir.y * d);
    const pz = focus.z + dir.z * d;
    const k = dampFactor(11, dt);
    this.position.x += (px - this.position.x) * k;
    this.position.y += (py - this.position.y) * k;
    this.position.z += (pz - this.position.z) * k;
    this.camera.position.copy(this.position);
    this.target.set(focus.x, focus.y + 1.6, focus.z);
    this.camera.lookAt(this.target);
  }

  // Slow orbit for the title screen's attract mode.
  orbit(dt, time) {
    const a = time * 0.05;
    const r = 130;
    this.camera.position.set(Math.sin(a) * r, 62, Math.cos(a) * r);
    this.camera.lookAt(0, 0, 20);
  }
}
