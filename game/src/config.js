// SOLMAR — a sun-soaked open-world crime game (original work, no Rockstar content).
// config.js: every tuning number in one place, so the rest of the game reads like prose.

export const GAME_NAME = 'SOLMAR';
export const SAVE_KEY = 'solmar-save-v1';

// Fixed simulation step (seconds) — the loop runs the world in 1/60 s slices.
export const STEP = 1 / 60;
// The longest frame the loop catches up on; a longer stall is dropped, not replayed.
export const MAX_FRAME = 0.25;

// ---- City layout (metres) ----
// Roads run on a grid: road centrelines every PITCH metres, ROAD_W wide; the squares
// between them are blocks of BLOCK metres holding buildings, a park or a car park.
export const PITCH = 52;
export const ROAD_W = 12;
export const BLOCK = 40;
export const ROAD_LINES = [-156, -104, -52, 0, 52, 104, 156];
export const BLOCK_CENTRES = [-130, -78, -26, 26, 78, 130];
// The world edge: beyond it the beach (south) and the sea.
export const CITY_EDGE = 182;
export const BEACH_Z = 196;
export const SEA_Z = 232;

// ---- Player on foot ----
export const WALK_SPEED = 5.2;
export const SPRINT_SPEED = 9.0;
export const PLAYER_RADIUS = 0.7;
export const PLAYER_HEIGHT = 1.8;

// ---- Cars ----
export const CAR_TOP_SPEED = 34; // m/s, about 122 km/h
export const CAR_ACCEL = 16;
export const CAR_BRAKE = 28;
export const CAR_REVERSE_SPEED = 10;
export const CAR_TURN = 2.4; // rad/s at full lock, scaled down with speed
export const TRAFFIC_SPEED = 9;
export const POLICE_SPEED = 36; // m/s — patrol cars are quicker than the player's car, so they can overtake
export const CAR_RADIUS = 2.2;

// ---- Wanted / police ----
export const MAX_STARS = 5;
export const BUSTED_TIME = 3; // seconds pinned by police before BUSTED
export const EVADE_RANGE = 55; // no cop inside this range counts as hiding
export const EVADE_TIME = 8; // seconds hidden before stars start falling
export const STAR_FALL_TIME = 4; // seconds per star once evading

// ---- Health / money ----
export const MAX_HEALTH = 100;
export const BUSTED_FINE = 200;
export const WASTED_FINE = 150;

// ---- Missions ----
export const MISSION_COUNT = 5;

// ---- Screenshots ----
// ?shot=cover|street|mission|combat stages a real gameplay scene for the camera.
export const SHOT_NAMES = ['cover', 'street', 'mission', 'combat'];
