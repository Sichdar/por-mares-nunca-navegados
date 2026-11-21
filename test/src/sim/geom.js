// Small maths helpers shared by the rules. Angles: 0 = north, clockwise, in radians.
// World y grows to the south (as on a screen), so "north" is −y.
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const norm = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const bearing = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y));
export const ahead = (x, y, h, L) => [x + Math.sin(h) * L, y - Math.cos(h) * L];
