// Procedural textures, painted once onto canvases at startup. No image
// files: every surface in Solmar is generated here.
import * as THREE from 'three';
import { Rng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A building face: warm plaster with a grid of lit and dark windows and a
// darker ground-floor band. The seed varies which windows glow.
export function facadeTexture(seed, base = '#efe3c8') {
  const rng = new Rng(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // Plaster noise.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
    g.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }
  // Window grid: 4 columns, 5 rows.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      const x = 18 + col * 58;
      const y = 16 + row * 46;
      const lit = rng.chance(0.35);
      g.fillStyle = '#5a4632';
      g.fillRect(x - 3, y - 3, 38, 32);
      g.fillStyle = lit ? '#ffd98a' : '#2e4a5e';
      g.fillRect(x, y, 32, 26);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 32, 6);
    }
  }
  // Ground floor: shop fronts and a door.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 232, 256, 24);
  g.fillStyle = '#7a5a38';
  g.fillRect(108, 222, 40, 34);
  return toTexture(c);
}

// Asphalt with a dashed centre line, tiled along the road.
export function roadTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3a3f46';
  g.fillRect(0, 0, 128, 128);
  const rng = new Rng(7);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)';
    g.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2);
  }
  g.fillStyle = '#e8d44f';
  g.fillRect(62, 8, 4, 44);
  g.fillRect(62, 72, 4, 44);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(4, 0, 3, 128);
  g.fillRect(121, 0, 3, 128);
  return toTexture(c);
}

// Pale pavement slabs for sidewalks and the plaza.
export function pavementTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#b9b3a4';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 32);
    g.lineTo(128, i * 32);
    g.stroke();
  }
  const rng = new Rng(11);
  for (let i = 0; i < 300; i++) {
    g.fillStyle = 'rgba(0,0,0,0.06)';
    g.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2);
  }
  return toTexture(c);
}

// Speckled grass for the park and verges.
export function grassTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#6fae5f';
  g.fillRect(0, 0, 128, 128);
  const rng = new Rng(13);
  const tones = ['#5d9c4e', '#7fbf6d', '#679f56', '#86c47a'];
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = rng.pick(tones);
    g.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 3);
  }
  return toTexture(c);
}

// Warm sand for the beach.
export function sandTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#e8d9a8';
  g.fillRect(0, 0, 128, 128);
  const rng = new Rng(17);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = rng.chance(0.5) ? 'rgba(180,150,90,0.35)' : 'rgba(255,245,210,0.4)';
    g.fillRect(rng.int(0, 127), rng.int(0, 127), 2, 2);
  }
  return toTexture(c);
}

// Gentle two-tone water with soft wave streaks.
export function waterTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#2e7fa8');
  grad.addColorStop(1, '#1d5f86');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const rng = new Rng(19);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const y = rng.int(0, 255);
    g.beginPath();
    g.moveTo(rng.int(0, 200), y);
    g.lineTo(rng.int(30, 255), y + rng.int(-6, 6));
    g.stroke();
  }
  return toTexture(c);
}

// A warehouse wall: corrugated metal with a big door.
export function warehouseTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8a8f96';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(x, 0, 4, 256);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x + 8, 0, 4, 256);
  }
  g.fillStyle = '#5a5e64';
  g.fillRect(78, 150, 100, 106);
  g.fillStyle = '#c23b2e';
  g.fillRect(78, 150, 100, 10);
  g.fillStyle = '#e8e8e8';
  g.font = 'bold 20px sans-serif';
  g.textAlign = 'center';
  g.fillText('FOUNDRY 7', 128, 60);
  return toTexture(c);
}
