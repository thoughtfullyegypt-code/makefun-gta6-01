// utils.js: small math helpers shared by every system.

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent smoothing: moves `a` toward `b` with the given rate.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
// Wraps an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
// Shortest signed turn from angle `from` to angle `to`.
export function angleTo(from, to) {
  return wrapAngle(to - from);
}
// Squared distance on the ground plane (x, z).
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Pushes a circle (x, z, radius) out of an axis-aligned box {minX, maxX, minZ, maxZ}.
 * Returns the corrected [x, z]. The box is treated as solid: the circle slides along it.
 */
export function collideCircleBox(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return [x, z];
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * radius, cz + (dz / d) * radius];
  }
  // Centre inside the box: push out along the smallest penetration.
  const pushLeft = x - box.minX + radius;
  const pushRight = box.maxX - x + radius;
  const pushBack = z - box.minZ + radius;
  const pushFront = box.maxZ - z + radius;
  const m = Math.min(pushLeft, pushRight, pushBack, pushFront);
  if (m === pushLeft) return [box.minX - radius, z];
  if (m === pushRight) return [box.maxX + radius, z];
  if (m === pushBack) return [x, box.minZ - radius];
  return [x, box.maxZ + radius];
}

/** Formats a number as money: 1250 -> "$1,250". */
export function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Formats seconds as m:ss. */
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
