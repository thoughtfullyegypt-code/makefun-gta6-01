// The HUD: DOM readouts plus a live circular minimap drawn on a 2D canvas.
// All element ids match index.html.
import { CFG, ROAD_LINES } from './config.js';

const MAP_SIZE = 180;
const MAP_RANGE = 115; // world units shown from the centre to the edge

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'minimap', 'money', 'stars', 'evading', 'health-fill', 'health-wrap',
      'speedo', 'speed-num', 'objective', 'timer', 'banner', 'banner-title',
      'banner-sub', 'location', 'location-tag', 'crosshair', 'busted-wrap',
      'busted-fill', 'hint', 'toast', 'wanted-flash',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.bannerTimer = null;
    this.toastTimer = null;
    this.lastLocation = null;
    this.locationTimer = null;
  }

  showBanner(title, sub = '', ms = 3200) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub;
    this.el.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), ms);
  }

  toast(text, ms = 2600) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  showLocation(loc) {
    if (!loc || (this.lastLocation && this.lastLocation.name === loc.name)) return;
    this.lastLocation = loc;
    this.el.location.textContent = loc.name;
    this.el['location-tag'].textContent = loc.tag;
    this.el.location.parentElement.classList.add('show');
    clearTimeout(this.locationTimer);
    this.locationTimer = setTimeout(
      () => this.el.location.parentElement.classList.remove('show'),
      4000,
    );
  }

  update(s) {
    this.el.money.textContent = '$' + s.money.toLocaleString('en-US');
    // Stars.
    const stars = this.el.stars.children;
    for (let i = 0; i < stars.length; i++) {
      stars[i].classList.toggle('lit', i < s.stars);
    }
    this.el.evading.classList.toggle('show', s.evading);
    this.el['wanted-flash'].classList.toggle('show', s.stars > 0);
    // Health.
    this.el['health-fill'].style.width = Math.max(0, s.health) + '%';
    this.el['health-fill'].classList.toggle('low', s.health < 30);
    // Speedometer (car only).
    this.el.speedo.classList.toggle('show', s.inCar);
    if (s.inCar) this.el['speed-num'].textContent = Math.round(Math.abs(s.speed) * 3.6);
    // Objective + timer.
    this.el.objective.textContent = s.objective || '';
    if (s.timer !== null && s.timer !== undefined) {
      const t = Math.max(0, Math.ceil(s.timer));
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      this.el.timer.textContent = `${mm}:${ss}`;
      this.el.timer.classList.add('show');
      this.el.timer.classList.toggle('urgent', t < 30);
    } else {
      this.el.timer.classList.remove('show');
    }
    // Crosshair on foot, hidden in a car.
    this.el.crosshair.classList.toggle('show', !s.inCar);
    // Busted progress.
    this.el['busted-wrap'].classList.toggle('show', s.bustedProgress > 0.02);
    this.el['busted-fill'].style.width = Math.round(s.bustedProgress * 100) + '%';
    // Contextual hint.
    this.el.hint.textContent = s.hint || '';
    this._drawMinimap(s);
  }

  _drawMinimap(s) {
    const g = this.mapCtx;
    const c = MAP_SIZE / 2;
    const scale = c / MAP_RANGE;
    const px = (wx) => c + (wx - s.playerX) * scale;
    const pz = (wz) => c + (wz - s.playerZ) * scale;
    g.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Clip to the circle.
    g.save();
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.clip();
    // Base: ground green.
    g.fillStyle = '#8fae7d';
    g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea (south) and beach.
    const seaY = pz(CFG.SEA_Z);
    const beachY = pz(CFG.BEACH_Z);
    g.fillStyle = '#e8d9a8';
    g.fillRect(0, beachY, MAP_SIZE, Math.max(0, seaY - beachY));
    g.fillStyle = '#2e7fa8';
    g.fillRect(0, seaY, MAP_SIZE, MAP_SIZE - seaY);
    // Park.
    g.fillStyle = '#5d9c4e';
    g.fillRect(px(-52), pz(-52), 104 * scale, 104 * scale);
    // Plaza.
    g.fillStyle = '#d8cfb8';
    g.fillRect(px(32), pz(-72), 40 * scale, 40 * scale);
    // Roads.
    g.strokeStyle = '#3a3f46';
    g.lineWidth = Math.max(2, CFG.ROAD_WIDTH * scale);
    for (const r of ROAD_LINES) {
      g.beginPath();
      g.moveTo(px(r), 0);
      g.lineTo(px(r), MAP_SIZE);
      g.stroke();
      g.beginPath();
      g.moveTo(0, pz(r));
      g.lineTo(MAP_SIZE, pz(r));
      g.stroke();
    }
    // Mission diamond.
    if (s.beacon) {
      const bx = px(s.beacon.x);
      const bz = pz(s.beacon.z);
      const pulse = 1 + Math.sin(performance.now() / 220) * 0.25;
      g.save();
      g.translate(bx, bz);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ffd94f';
      const r = 7 * pulse;
      g.fillRect(-r / 2, -r / 2, r, r);
      g.restore();
    }
    // Police dots, flashing red/blue.
    const flashRed = Math.floor(performance.now() / 300) % 2 === 0;
    g.fillStyle = flashRed ? '#ff3030' : '#3060ff';
    for (const cop of s.cops || []) {
      g.beginPath();
      g.arc(px(cop.x), pz(cop.z), 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Player arrow.
    g.save();
    g.translate(c, c);
    g.rotate(s.heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222222';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // North marker.
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.fillText('N', c, 13);
    g.restore();
    // Rim.
    g.beginPath();
    g.arc(c, c, c - 1, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    g.stroke();
  }
}
