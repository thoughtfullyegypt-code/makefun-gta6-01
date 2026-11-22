// rng.js: a tiny seeded random generator (mulberry32) so the city, the traffic and the
// screenshot scenes are the same every time the same seed is used.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    // Uniform float in [min, max).
    range(min, max) {
      return min + (max - min) * next();
    },
    // Uniform integer in [min, max].
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    // One element of an array.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
  };
}
