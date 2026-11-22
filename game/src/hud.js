// hud.js: the heads-up display — the minimap canvas, wanted stars, health, money,
// speed, objective text and the big centre banners (mission passed, busted, wasted).

import { BLOCK_CENTRES, CITY_EDGE, ROAD_LINES } from './config.js';
import { money } from './utils.js';

const MAP_SIZE = 190;
const MAP_RANGE = CITY_EDGE + 40; // world units shown from the centre

export function createHUD(doc) {
  const el = (id) => doc.getElementById(id);
  const root = el('hud');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  const moneyEl = el('money');
  const starsEl = el('stars');
  const healthFill = el('health-fill');
  const objectiveEl = el('objective');
  const speedEl = el('speed');
  const promptEl = el('prompt');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const crosshair = el('crosshair');
  const damageEl = el('damage-flash');
  const evadeEl = el('evade');
  let bannerTimer = 0;
  let damageTimer = 0;

  function mapX(wx) {
    return MAP_SIZE / 2 + (wx / MAP_RANGE) * (MAP_SIZE / 2);
  }
  function mapY(wz) {
    return MAP_SIZE / 2 + (wz / MAP_RANGE) * (MAP_SIZE / 2);
  }

  function drawMinimap(world) {
    const g = mapCtx;
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea and sand at the bottom edge.
    g.fillStyle = '#12303f';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    g.fillStyle = '#e8d3a0';
    g.fillRect(0, mapY(182), MAP_SIZE, mapY(234) - mapY(182));
    g.fillStyle = '#2e7fb8';
    g.fillRect(0, mapY(234), MAP_SIZE, MAP_SIZE - mapY(234));
    // Blocks.
    g.fillStyle = '#3d454e';
    for (const bx of BLOCK_CENTRES) {
      for (const bz of BLOCK_CENTRES) {
        const s = (40 / MAP_RANGE) * (MAP_SIZE / 2);
        g.fillRect(mapX(bx) - s / 2, mapY(bz) - s / 2, s, s);
      }
    }
    // Park block, green.
    g.fillStyle = '#4c8a3a';
    {
      const s = (40 / MAP_RANGE) * (MAP_SIZE / 2);
      g.fillRect(mapX(-26) - s / 2, mapY(-26) - s / 2, s, s);
    }
    // Roads.
    g.strokeStyle = '#8b939c';
    g.lineWidth = 3;
    for (const line of ROAD_LINES) {
      g.beginPath();
      g.moveTo(mapX(line), mapY(-CITY_EDGE));
      g.lineTo(mapX(line), mapY(CITY_EDGE));
      g.stroke();
      g.beginPath();
      g.moveTo(mapX(-CITY_EDGE), mapY(line));
      g.lineTo(mapX(CITY_EDGE), mapY(line));
      g.stroke();
    }
    // Mission marker: a pulsing yellow diamond.
    const marker = world.missions.marker();
    if (marker) {
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(mapX(marker.x), mapY(marker.z) - pulse);
      g.lineTo(mapX(marker.x) + pulse, mapY(marker.z));
      g.lineTo(mapX(marker.x), mapY(marker.z) + pulse);
      g.lineTo(mapX(marker.x) - pulse, mapY(marker.z));
      g.closePath();
      g.fill();
    }
    // Police: flashing blue/red dots.
    const flashBlue = Math.floor(performance.now() / 250) % 2 === 0;
    g.fillStyle = flashBlue ? '#4da6ff' : '#ff4d4d';
    for (const cop of world.wanted.state.cars) {
      g.beginPath();
      g.arc(mapX(cop.x), mapY(cop.z), 3, 0, Math.PI * 2);
      g.fill();
    }
    for (const officer of world.wanted.state.officers) {
      g.beginPath();
      g.arc(mapX(officer.x), mapY(officer.z), 2, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a white arrow pointing where they face.
    const p = world.player;
    g.save();
    g.translate(mapX(p.x), mapY(p.z));
    g.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  return {
    show() {
      root.style.display = 'block';
    },
    hide() {
      root.style.display = 'none';
    },
    showBanner(title, sub = '', seconds = 3) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      bannerEl.classList.add('show');
      bannerTimer = seconds;
    },
    hideBanner() {
      bannerEl.classList.remove('show');
      bannerTimer = 0;
    },
    flashDamage() {
      damageTimer = 0.45;
    },
    setPrompt(text) {
      promptEl.textContent = text;
      promptEl.style.display = text ? 'block' : 'none';
    },
    setCrosshair(visible) {
      crosshair.style.display = visible ? 'block' : 'none';
    },
    /** Refreshes every HUD element from the world. Call once per frame. */
    update(dt, world) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) bannerEl.classList.remove('show');
      }
      if (damageTimer > 0) {
        damageTimer -= dt;
        damageEl.style.opacity = String(Math.max(0, damageTimer / 0.45) * 0.55);
      } else {
        damageEl.style.opacity = '0';
      }
      moneyEl.textContent = money(world.money);
      const stars = world.wanted.state.stars;
      starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      starsEl.className = stars > 0 ? 'hot' : '';
      evadeEl.style.display = world.wanted.state.evading ? 'block' : 'none';
      const hp = Math.max(0, Math.round(world.health));
      healthFill.style.width = `${hp}%`;
      healthFill.className = hp > 50 ? 'good' : hp > 25 ? 'ok' : 'bad';
      objectiveEl.textContent = world.missions.objectiveText(world);
      if (!world.onFoot && world.car) {
        speedEl.style.display = 'block';
        speedEl.textContent = `${Math.round(Math.abs(world.car.speed) * 3.6)} km/h`;
      } else {
        speedEl.style.display = 'none';
      }
      drawMinimap(world);
    },
  };
}
