// SOLMAR — shared tuning constants, city layout and palette.
// Everything the other modules agree on lives here so a single number
// change retunes the whole game.

export const CFG = {
  // City grid: 7 roads per axis, pitch 52, road width 12, block size 40.
  ROAD_COUNT: 7,
  ROAD_PITCH: 52,
  ROAD_WIDTH: 12,
  BLOCK: 40,
  // Road centre lines run from -156 to +156.
  GRID_MIN: -156,
  GRID_MAX: 156,
  // Beach starts at this z, sea beyond it.
  BEACH_Z: 182,
  SEA_Z: 224,
  // Ground plane half-size.
  GROUND_HALF: 320,  // Player
  WALK_SPEED: 7,
  SPRINT_SPEED: 11,
  PLAYER_RADIUS: 0.9,
  PLAYER_HEALTH: 100,
  // Cars
  CAR_TOP_SPEED: 34,
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_REVERSE_SPEED: 10,
  CAR_TURN_RATE: 2.4,
  POLICE_TOP_SPEED: 36,
  TRAFFIC_SPEED: 11,
  TRAFFIC_COUNT: 14,
  PED_COUNT: 22,
  // Wanted
  MAX_STARS: 5,
  BUSTED_FOOT_TIME: 1.6,
  BUSTED_CAR_TIME: 3.0,
  EVADE_DISTANCE: 95,
  EVADE_WAIT: 4,
  STAR_FALL_EVERY: 3,
  // Combat
  SHOT_DAMAGE: 34,
  ENEMY_SHOT_DAMAGE: 8,
  ENEMY_RANGE: 42,
  HEALTH_REGEN_DELAY: 5,
  HEALTH_REGEN_RATE: 6,
  // Missions
  MISSION4_TIME: 150,
  // Save
  SAVE_KEY: 'solmar-save-v3',
  AUTOSAVE_EVERY: 20,
};

// Road centre lines (7 per axis, from -156 to +156).
export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];

// Warm Mediterranean palette for a sun-soaked coastal city.
export const PALETTE = {
  sky: 0x87c5e8,
  fog: 0xa8d0e6,
  ground: 0x9db98a,
  road: 0x3a3f46,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d9a8,
  sea: 0x2e7fa8,
  seaDeep: 0x1d5f86,
  parkGrass: 0x6fae5f,
  plaza: 0xd8cfb8,
  building: [0xf2e6d0, 0xe8d5b5, 0xdfc9a3, 0xf5efe2, 0xe5c9a8, 0xd9b48c, 0xefe3c8, 0xdcc7a0],
  roof: [0xb85c38, 0x9e4f2e, 0xc47a4a, 0x8a5a3b, 0xa86a42],
  car: [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xe8e8e8, 0x2b2b2b, 0x7a4fc2, 0xe87a2e, 0x2ec2b8, 0xb8c22e],
  pedSkin: [0xf2c89b, 0xd9a066, 0xa06a3b, 0x8a5a30, 0xe8b88a],
  pedShirt: [0xc23b2e, 0x2e6fc2, 0x3aa655, 0xe8c832, 0x7a4fc2, 0xe87a2e, 0xeeeeee, 0x444444],
};

// The ten named places of Solmar. Each has a centre, a radius (for the
// "entering" banner and the minimap label) and a short tag line.
export const LOCATIONS = [
  { name: 'Marina Docks', x: -130, z: 168, r: 34, tag: 'Boats, cranes and quiet deals' },
  { name: 'Fountain Plaza', x: 52, z: -52, r: 30, tag: 'The heart of the old city' },
  { name: 'Solmar Park', x: 0, z: 0, r: 42, tag: 'Green lawns in the middle of town' },
  { name: 'Grand Hotel', x: 104, z: -130, r: 30, tag: 'Five stars, one doorman' },
  { name: 'City Hall', x: 130, z: 52, r: 30, tag: 'Where the paperwork lives' },
  { name: 'Vesper Beach', x: 60, z: 200, r: 46, tag: 'Sand, surf and sunburn' },
  { name: 'Northgate Mall', x: -104, z: -130, r: 32, tag: 'Shops shut, arcade open' },
  { name: 'The Foundry', x: -130, z: -52, r: 34, tag: 'Warehouses the Vipers call home' },
  { name: 'Old Town', x: -104, z: -104, r: 32, tag: 'Narrow streets, old money' },
  { name: 'Harbor View', x: 130, z: 130, r: 32, tag: 'Sea air and steep prices' },
];

// The garage where Marco starts, and the safehouse (same place).
export const GARAGE = { x: -4, z: -24, heading: Math.PI / 2 };

// Mission payouts, in story order.
export const MISSIONS = [
  { id: 1, name: 'Hot Wheels', payout: 500 },
  { id: 2, name: 'The Pickup', payout: 1000 },
  { id: 3, name: 'Heat Off', payout: 1500 },
  { id: 4, name: 'Three Stops', payout: 2000 },
  { id: 5, name: 'The Last Job', payout: 3000 },
];
