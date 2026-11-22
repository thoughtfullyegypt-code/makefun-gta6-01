// textures.js: every texture in Solmar is drawn on a canvas at load — no image files,
// no network. Facades get lit windows, roads get lane markings, the beach gets sand.

import * as THREE from 'three';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A building facade: warm plaster with a grid of windows, some lit, some dark. */
export function facadeTexture(base, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Subtle vertical shading so towers read as solid in the sun.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.08)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const cols = 5;
    const rows = 10;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng.chance(0.22);
        g.fillStyle = lit ? '#ffe9a8' : rng.chance(0.5) ? '#2e4a5e' : '#22384a';
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
        // A bright glint on some panes.
        if (!lit && rng.chance(0.3)) {
          g.fillStyle = 'rgba(255,255,255,0.25)';
          g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.16);
        }
      }
    }
    // Ground-floor shopfront band.
    g.fillStyle = 'rgba(20,24,32,0.85)';
    g.fillRect(0, h - ch * 0.9, w, ch * 0.9);
    g.fillStyle = '#ffd98a';
    g.fillRect(w * 0.08, h - ch * 0.62, w * 0.84, ch * 0.34);
  });
}

/** A flat roof: pale concrete with vents and an AC box or two. */
export function roofTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b9b3a4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 40; i += 1) g.fillRect(rng.range(0, w), rng.range(0, h), 2, 2);
    g.fillStyle = '#8f8a7c';
    g.fillRect(w * 0.15, h * 0.2, w * 0.3, h * 0.22);
    g.fillStyle = '#7c7668';
    g.fillRect(w * 0.6, h * 0.55, w * 0.22, h * 0.22);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  });
}

/** Asphalt with a dashed centre line, tiled along a road. */
export function roadTexture() {
  const tex = canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#33373d';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#e8d44d';
    g.fillRect(w / 2 - 2, 8, 4, 44);
    g.fillRect(w / 2 - 2, 72, 4, 44);
    g.fillStyle = '#d8d8d8';
    g.fillRect(3, 0, 2, h);
    g.fillRect(w - 5, 0, 2, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Pavement slabs for sidewalks and block tops. */
export function pavementTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#9a938a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
    for (let i = 0; i < 120; i += 1) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Warm sand for the beach strip. */
export function sandTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d3a0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i += 1) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(180,150,90,0.35)' : 'rgba(255,245,210,0.4)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 1);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Short green grass for the park block. */
export function grassTexture() {
  const tex = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#5da244';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i += 1) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,90,20,0.4)' : 'rgba(140,220,90,0.35)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
