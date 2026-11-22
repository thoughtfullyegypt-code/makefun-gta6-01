// The story: five missions in order, each with steps, a 3D beacon marking
// the target, briefings and payouts. Missions auto-start in sequence; the
// timed one restarts on failure.
import * as THREE from 'three';
import { CFG, GARAGE, MISSIONS } from './config.js';

const DOCKS = { x: -130, z: 168 };
const PLAZA = { x: 52, z: -52 };
const FOUNDRY = { x: -130, z: -52 };
const MALL = { x: -104, z: -130 };
const CITY_HALL = { x: 130, z: 52 };
const BEACH = { x: 60, z: 200 };

const ENEMY_SPOTS = [
  [-138, -60], [-122, -44], [-140, -42], [-118, -62],
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.missionsDone = 0;
    this.current = null; // {def, stepIdx, steps, timer}
    this.contact = null;
    this.onBanner = null; // (title, sub) => void
    this.onObjective = null; // (text) => void
    this.onComplete = null; // (mission) => void
    this.onFailed = null; // (mission) => void
    this.onNeedEnemies = null; // () => void — spawn the Vipers
    this.onNeedContact = null; // () => ped — spawn the pickup contact
    this.onSetStars = null; // (n) => void
    this._buildBeacon();
  }

  _buildBeacon() {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 35;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd94f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(pillar, ring);
    group.visible = false;
    this.scene.add(group);
    this.beacon = group;
    this.beaconRing = ring;
  }

  get active() {
    return this.current !== null;
  }
  get storyDone() {
    return this.missionsDone >= MISSIONS.length;
  }

  startFromSave(missionsDone) {
    this.missionsDone = missionsDone;
    if (!this.storyDone) this.startMission(this.missionsDone);
  }

  startMission(index) {
    const def = MISSIONS[index];
    const steps = this._stepsFor(def.id);
    this.current = { def, stepIdx: 0, steps, timer: def.id === 4 ? CFG.MISSION4_TIME : null };
    if (def.id === 2 && this.onNeedContact) {
      this.contact = this.onNeedContact();
    }
    if (def.id === 3 && this.onSetStars) this.onSetStars(2);
    if (def.id === 5 && this.onNeedEnemies) this.onNeedEnemies();
    if (this.onBanner) this.onBanner(def.name, this._briefing(def.id));
    this._showStep();
  }

  _briefing(id) {
    switch (id) {
      case 1: return 'Ray needs a car at the docks. Any car. Go get one.';
      case 2: return 'A friend of Ray is waiting at Fountain Plaza. Walk them home safe.';
      case 3: return 'The cops are on you. Shake them and stay gone.';
      case 4: return 'Three drops, two and a half minutes. Do not be late.';
      case 5: return 'The Vipers took the warehouse. Take it back, then disappear.';
      default: return '';
    }
  }

  _stepsFor(id) {
    switch (id) {
      case 1:
        return [
          { type: 'inCar', text: 'Get in a car', beacon: { x: 4, z: -24 } },
          { type: 'reach', target: DOCKS, radius: 13, text: 'Drive to the Marina Docks' },
        ];
      case 2:
        return [
          { type: 'reach', target: PLAZA, radius: 10, text: 'Meet the contact at Fountain Plaza' },
          { type: 'escort', target: GARAGE, radius: 9, text: 'Walk the contact back to the garage' },
        ];
      case 3:
        return [{ type: 'loseWanted', text: 'Lose the cops — get clear and stay clear' }];
      case 4:
        return [
          { type: 'reach', target: MALL, radius: 13, text: 'Stop 1 of 3: Northgate Mall' },
          { type: 'reach', target: CITY_HALL, radius: 13, text: 'Stop 2 of 3: City Hall' },
          { type: 'reach', target: BEACH, radius: 15, text: 'Stop 3 of 3: Vesper Beach' },
        ];
      case 5:
        return [
          { type: 'reach', target: FOUNDRY, radius: 17, text: 'Get to the warehouse at The Foundry' },
          { type: 'killEnemies', text: 'Clear out the Vipers' },
          { type: 'loseWanted', text: 'Lose the 3-star heat', setStars: 3 },
          { type: 'reach', target: GARAGE, radius: 10, text: 'Get back to the safehouse' },
        ];
      default:
        return [];
    }
  }

  _showStep() {
    const step = this.current.steps[this.current.stepIdx];
    if (!step) return;
    if (step.setStars && this.onSetStars) this.onSetStars(step.setStars);
    const target = step.target || step.beacon || null;
    if (target) {
      this.beacon.position.set(target.x, 0, target.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
    if (this.onObjective) this.onObjective(step.text);
  }

  // The current beacon target for the minimap, or null.
  beaconTarget() {
    if (!this.current) return null;
    const step = this.current.steps[this.current.stepIdx];
    if (!step) return null;
    return step.target || step.beacon || null;
  }

  update(dt, ctx) {
    if (!this.current) return;
    // Pulse the beacon ring.
    if (this.beacon.visible) {
      const s = 1 + Math.sin(performance.now() / 280) * 0.15;
      this.beaconRing.scale.set(s, s, 1);
    }
    // Mission 4's clock.
    if (this.current.timer !== null) {
      this.current.timer -= dt;
      if (this.current.timer <= 0) {
        const def = this.current.def;
        this.current = null;
        this.beacon.visible = false;
        if (this.onFailed) this.onFailed(def);
        // Restart the same mission after the banner.
        setTimeout(() => this.startMission(this.missionsDone), 2500);
        return;
      }
    }
    const step = this.current.steps[this.current.stepIdx];
    if (!step) return;
    const p = ctx.player;
    let done = false;
    if (step.type === 'inCar') {
      done = !!p.car;
    } else if (step.type === 'reach' || step.type === 'escort') {
      const d = Math.hypot(p.x - step.target.x, p.z - step.target.z);
      done = d < step.radius;
      if (step.type === 'escort') done = done && !p.car;
    } else if (step.type === 'loseWanted') {
      done = ctx.police.stars === 0;
    } else if (step.type === 'killEnemies') {
      const left = ctx.combat.aliveEnemies().length;
      if (this.onObjective) this.onObjective(`Clear out the Vipers — ${left} left`);
      done = left === 0;
    }
    if (!done) return;
    // Step complete: contact joins the player after the plaza meeting.
    if (this.current.def.id === 2 && this.current.stepIdx === 0 && this.contact) {
      this.contact.state = 'follow';
      this.contact.followTarget = p;
    }
    this.current.stepIdx++;
    if (this.current.stepIdx >= this.current.steps.length) {
      const def = this.current.def;
      this.missionsDone++;
      this.current = null;
      this.beacon.visible = false;
      if (this.contact) {
        this.contact.state = 'walk';
        this.contact.followTarget = null;
        this.contact = null;
      }
      if (this.onComplete) this.onComplete(def);
      if (!this.storyDone) {
        setTimeout(() => this.startMission(this.missionsDone), 3000);
      }
    } else {
      this._showStep();
    }
  }

  // Enemy spawn points for the final mission.
  static enemySpots() {
    return ENEMY_SPOTS;
  }
}
