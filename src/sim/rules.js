// The fixed numbers of the rules (GDD Phase 2), as tuned in the fight test (19/11/2026).
// Ship numbers live in data/ships.json; these are the rules every ship shares.
import { DEG } from './geom.js';

export const STEP = 0.05;            // one rule step = 1/20 of a game second (Phase 8)
export const VISION = 1100;          // how far a lookout sees by day (fight test)

export const SHOTS = {
  round: { hull: 0.7, sails: 0.1, crew: 0.2, range: 450 },
  chain: { hull: 0.1, sails: 0.8, crew: 0.1, range: 450 },
  grape: { hull: 0.05, sails: 0.1, crew: 0.85, range: 150 },
};
export const SHOT_KINDS = ['round', 'chain', 'grape'];
export const DMG = 3.4;              // damage of one ball that hits, before the shot's spread

export const ARC = 35 * DEG;         // a broadside fires within ±35° of straight out
export const RAKE = 30 * DEG;        // within ±30° of the target's bow or stern = raking
export const RAKE_MULT = 1.5;
export const BOW_ARC = 15 * DEG;     // bow guns: 2 guns, straight ahead
export const BOW_RANGE = 350;
export const BOW_GUNS = 2;
export const BOW_RELOAD = 0.7;       // bow guns reload in 70% of a broadside's time
export const RELOAD = 12;            // seconds, full gun crew
export const BALL_SPEED = 650;       // lengths per second, for the flight time only

// Chance to hit by range band: short 80%, medium 50%, long 25%.
export const hitChance = (d) => (d < 150 ? 0.8 : d < 300 ? 0.5 : 0.25);

// Point of sail: factor by the angle between the heading and where the wind comes from.
// Smoothed between the GDD bands (into the wind 0.1, close-hauled 0.55, beam 1.0, broad 0.9, running 0.75).
const POS = [[0, 0.05], [38, 0.1], [48, 0.5], [70, 0.6], [90, 1], [110, 1], [150, 0.9], [180, 0.75]];
export function posFactor(offDeg) {
  for (let i = 1; i < POS.length; i++) {
    if (offDeg <= POS[i][0]) {
      const [a, fa] = POS[i - 1], [b, fb] = POS[i];
      return fa + (fb - fa) * (offDeg - a) / (b - a);
    }
  }
  return 0.75;
}
export const pointOfSail = (offDeg) =>
  offDeg < 40 ? 'into' : offDeg < 70 ? 'close' : offDeg < 110 ? 'beam' : offDeg < 150 ? 'broad' : 'run';

export const NO_GO = 50 * DEG;       // closer than this to the wind, orders are turned into a tack
export const TACK = 52 * DEG;        // the course held while tacking

export const SAILS = {
  full: { speed: 1, turn: 0.8, damage: 1 },
  battle: { speed: 0.65, turn: 1.2, damage: 0.5 },
};

export const WIND_STRENGTH = { light: 0.7, fair: 1, strong: 1.2 };
export const WIND_SHIFT = 30 * DEG;  // shifts up to ±30° around its base

// Boarding (rule 3)
export const TACTICS = ['volley', 'charge', 'hold'];
export const BEATS = { volley: 'charge', charge: 'hold', hold: 'volley' };
export const TACTIC_BONUS = 1.3;
export const CLASH_ROUND = 5;        // seconds per round
export const GRAPPLE_RANGE = 75;     // fight test value (lengths between ship centres)
export const GRAPPLE_SLOW = 0.6;     // the target must be below 60% of its top speed
export const LOSS_RATE = 0.15;
export const SURRENDER_CREW = 0.25;
export const SURRENDER_MORALE = 20;
export const TELL_HONEST = 0.75;     // the officer's tell is true 3 times in 4 (fight test)

// Enemies break off at 25% hull or 30% crew (rule 8, after the fight test)
export const BREAK_HULL = 0.25;
export const BREAK_CREW = 0.3;
// A ship strikes its colours when morale or crew collapse
export const STRIKE_MORALE = 15;
export const STRIKE_CREW = 0.2;
