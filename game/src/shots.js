// Deterministic screenshot scenes, staged from the URL (?shot=cover etc).
// Each scene sets the player, cars, wanted level and mission up exactly the
// same way every time, then lets the game run so the shot is a real render
// of live play — never a still or a mock-up.
import { GARAGE } from './config.js';

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    name: params.get('shot') || null,
    seed: Number(params.get('seed') || 20261122),
  };
}

// Stage one of the four screenshot scenes. `game` is the object main.js
// builds (player, vehicles, police, missions, peds, combat, hud, sound).
export function stageShot(game, name) {
  const g = game;
  g.startNewGame({ skipIntro: true });
  if (name === 'cover') {
    // A police chase: Marco in the starter car, 2 stars, two patrol cars
    // closing in behind, mission 1's beacon on the HUD.
    const car = g.vehicles.cars.find((c) => c.isStarter) || g.vehicles.cars[0];
    g.enterCar(car, { quiet: true });
    car.x = -52;
    car.z = 40;
    car.heading = Math.PI;
    car.speed = 18;
    car.sync();
    g.player.x = car.x;
    g.player.z = car.z;
    g.player.heading = car.heading;
    g.police.setStars(2);
    // Pull the patrol cars right behind the player.
    g.police.cars.forEach((c, i) => {
      c.car.x = -52 + (i === 0 ? 4 : -4);
      c.car.z = 40 + 16 + i * 8;
      c.car.heading = Math.PI;
      c.car.speed = 20;
      c.car.sync();
    });
    g.followCam.yaw = 0;
    g.followCam.pitch = 0.3;
  } else if (name === 'street') {
    // On foot in the city: pedestrians, traffic and a mission ring.
    g.player.setPosition(30, -30, Math.PI * 0.75);
    g.missions.startMission(1); // The Pickup: beacon at Fountain Plaza
    g.followCam.yaw = Math.PI * 0.25;
    g.followCam.pitch = 0.3;
  } else if (name === 'mission') {
    // A mission in progress: briefing banner up, driving to the plaza.
    const car = g.vehicles.cars.find((c) => c.isStarter) || g.vehicles.cars[0];
    g.enterCar(car, { quiet: true });
    car.x = 0;
    car.z = -100;
    car.heading = Math.PI / 2;
    car.speed = 14;
    car.sync();
    g.player.x = car.x;
    g.player.z = car.z;
    g.player.heading = car.heading;
    g.missions.startMission(1);
    g.hud.showBanner('The Pickup', 'A friend of Ray is waiting at Fountain Plaza.', 9000);
    g.followCam.yaw = -Math.PI / 2;
    g.followCam.pitch = 0.3;
  } else if (name === 'combat') {
    // The final mission: Vipers at the warehouse, crosshair up, beacon lit.
    g.missions.missionsDone = 4;
    g.missions.startMission(4);
    // Skip to the shootout step.
    g.missions.current.stepIdx = 1;
    g.missions._showStep();
    g.player.setPosition(-118, -38, Math.PI * 0.9);
    g.followCam.yaw = Math.PI * 0.9 + Math.PI;
    g.followCam.pitch = 0.28;
  }
}
