// The calendar and the monsoon (GDD Phase 2 rule 1, Phase 4 weather).
// A date is a plain day number (days since 1 Jan 1970, proleptic Gregorian, as
// Portugal and Holland used then), so saves hold one number and sums are exact.
// At 1×, one in-game day takes 20 real seconds (Phase 2).

export const DAY_SECONDS = 20;

// Days from a civil date (H. Hinnant's method; no time zones involved).
export function dayOf(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function ymd(day) {
  const z = day + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: era * 400 + yoe + (m <= 2 ? 1 : 0), m, d };
}

// Parse "1638-03-01".
export function parseDay(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return dayOf(y, m, d);
}

// Seasons: north-east monsoon Oct–Apr (fair, from the north-east), May unsettled,
// south-west monsoon Jun–Sep (strong; Malabar ports closed; 1% hull a day at sea).
export function season(day) {
  const { m } = ymd(day);
  if (m >= 6 && m <= 9) return 'sw';
  if (m === 5) return 'turning';
  return 'ne';
}

// The usual wind of the season: where it blows from (degrees, 0 = north) and its strength.
export function seasonWind(day) {
  const s = season(day);
  if (s === 'sw') return { from: 225, str: 1.2 };
  if (s === 'turning') return { from: 270, str: 0.85 };
  return { from: 45, str: 1 };
}

export const atSeaDamagePerDay = (day) => (season(day) === 'sw' ? 0.01 : 0);

export function portOpen(port, day) {
  return !(port.monsoonClosed && season(day) === 'sw');
}

// The day the ports next close (1 June) — 0 days if they are closed now.
export function daysToMonsoon(day) {
  if (season(day) === 'sw') return 0;
  const { y, m } = ymd(day);
  return dayOf(m >= 10 ? y + 1 : y, 6, 1) - day;
}

// The month the closed ports reopen (October).
export function reopenDay(day) {
  const { y, m } = ymd(day);
  return dayOf(m >= 10 ? y + 1 : y, 10, 1);
}

// For the screen: a JS Date at noon UTC, formatted with timeZone UTC.
export function toDate(day) {
  return new Date(day * 86400000 + 43200000);
}
