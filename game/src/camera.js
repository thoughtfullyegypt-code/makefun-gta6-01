// camera.js: the third-person camera — it follows behind the player or the car,
// the mouse orbits it (pointer lock), and it swings back behind the car on its own
// a couple of seconds after the player stops steering it.

import * as THREE from 'three';
import { angleTo, clamp, damp } from './utils.js';

const FOOT_DISTANCE = 6.5;
const CAR_DISTANCE = 9.0;
const DEFAULT_PITCH = 0.32;

export function createCamera(camera) {
  const state = {
    yaw: Math.PI,
    pitch: DEFAULT_PITCH,
    distance: FOOT_DISTANCE,
    idleTimer: 0,
    pos: new THREE.Vector3(0, 5, -10),
    look: new THREE.Vector3(),
  };

  return {
    state,
    setYaw(yaw) {
      state.yaw = yaw;
    },
    /** Mouse orbit: dx turns, dy tilts. */
    orbit(dx, dy) {
      state.yaw -= dx * 0.0024;
      state.pitch = clamp(state.pitch - dy * 0.0022, 0.06, 1.05);
      state.idleTimer = 0;
    },
    /**
     * Follows `target` (a {x, z} plus eye height). When driving, the camera
     * auto-aligns behind the vehicle after a short idle; on foot it stays put.
     */
    update(dt, target, heading, inCar) {
      state.idleTimer += dt;
      if (inCar && state.idleTimer > 2.5) {
        state.yaw += angleTo(state.yaw, heading) * Math.min(1, dt * 1.4);
        state.pitch = damp(state.pitch, DEFAULT_PITCH, 2, dt);
      }
      const dist = inCar ? CAR_DISTANCE : FOOT_DISTANCE;
      state.distance = damp(state.distance, dist, 4, dt);
      const eyeY = inCar ? 1.6 : 1.5;
      const tx = target.x;
      const ty = eyeY;
      const tz = target.z;
      const back = state.distance * Math.cos(state.pitch);
      const wantX = tx - Math.sin(state.yaw) * back;
      const wantY = ty + state.distance * Math.sin(state.pitch);
      const wantZ = tz - Math.cos(state.yaw) * back;
      const rate = 9;
      state.pos.x = damp(state.pos.x, wantX, rate, dt);
      state.pos.y = damp(state.pos.y, Math.max(wantY, 1.2), rate, dt);
      state.pos.z = damp(state.pos.z, wantZ, rate, dt);
      state.look.set(tx, ty, tz);
      camera.position.copy(state.pos);
      camera.lookAt(state.look);
    },
    /** The direction the camera looks, as a heading (for camera-relative movement). */
    lookHeading() {
      return state.yaw;
    },
    /** Snaps the camera behind the target at once (respawns, shot staging). */
    snap(target, heading, inCar) {
      state.yaw = heading;
      state.pitch = DEFAULT_PITCH;
      const dist = inCar ? CAR_DISTANCE : FOOT_DISTANCE;
      const eyeY = inCar ? 1.6 : 1.5;
      state.pos.set(
        target.x - Math.sin(heading) * dist,
        eyeY + dist * Math.sin(DEFAULT_PITCH),
        target.z - Math.cos(heading) * dist,
      );
      state.distance = dist;
      camera.position.copy(state.pos);
      camera.lookAt(target.x, eyeY, target.z);
    },
  };
}
