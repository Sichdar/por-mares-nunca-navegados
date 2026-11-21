// Touch, mouse and pen in one code path (Phase 8, pointer events).
// tap = lifted within 0.3 s and moved under 10 points · long press = held 0.5 s ·
// drag = moved over 10 points (pans) · pinch = zoom · two-finger tap = pause.
export const GESTURE = { tapMs: 300, longMs: 500, slop: 10, twoTapMs: 350 };

// h: { tap(x, y), longPress(x, y), pressStart(x, y), pressEnd(), pan(dx, dy, first), pinch(scale, mx, my, first), twoTap(), wheel(dir, x, y) }
export function attachTouch(el, h) {
  const ptrs = new Map();
  let gest = null, timer = 0;
  const pos = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  const down = (e) => {
    el.setPointerCapture?.(e.pointerId);
    const [x, y] = pos(e);
    ptrs.set(e.pointerId, { x, y, sx: x, sy: y });
    if (ptrs.size === 1) {
      gest = { type: 'one', t: performance.now(), moved: false, done: false, x, y };
      clearTimeout(timer);
      h.pressStart?.(x, y);
      timer = setTimeout(() => {
        if (gest && gest.type === 'one' && !gest.moved) { gest.done = true; h.pressEnd?.(); h.longPress?.(x, y); }
      }, GESTURE.longMs);
    } else if (ptrs.size === 2) {
      clearTimeout(timer); h.pressEnd?.();
      const [a, b] = [...ptrs.values()];
      gest = { type: 'two', t: performance.now(), moved: false, d0: Math.hypot(a.x - b.x, a.y - b.y), m0: [(a.x + b.x) / 2, (a.y + b.y) / 2], first: true };
    }
  };
  const move = (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q || !gest) return;
    const [x, y] = pos(e);
    const px = q.x, py = q.y;
    q.x = x; q.y = y;
    if (gest.type === 'one' && ptrs.size === 1) {
      if (!gest.moved && Math.hypot(x - q.sx, y - q.sy) > GESTURE.slop) { gest.moved = true; clearTimeout(timer); h.pressEnd?.(); h.pan?.(x - q.sx, y - q.sy, true); return; }
      if (gest.moved && !gest.done) h.pan?.(x - px, y - py, false);
    } else if (gest.type === 'two' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (Math.abs(d - gest.d0) > 14 || Math.hypot(m[0] - gest.m0[0], m[1] - gest.m0[1]) > 14) gest.moved = true;
      if (gest.moved) {
        h.pinch?.(d / (gest.dl || gest.d0), m[0], m[1], gest.first);
        if (!gest.first) h.pan?.(m[0] - gest.ml[0], m[1] - gest.ml[1], false);
        gest.first = false; gest.dl = d; gest.ml = m;
      }
    }
  };
  const up = (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    ptrs.delete(e.pointerId);
    if (!gest) return;
    if (gest.type === 'one' && ptrs.size === 0) {
      clearTimeout(timer); h.pressEnd?.();
      if (!gest.moved && !gest.done && e.type === 'pointerup' && performance.now() - gest.t < GESTURE.longMs) h.tap?.(q.x, q.y);
      gest = null;
    } else if (gest.type === 'two') {
      if (!gest.moved && performance.now() - gest.t < GESTURE.twoTapMs && !gest.tapped) { gest.tapped = true; h.twoTap?.(); }
      if (ptrs.size === 0) gest = null; else gest.moved = true;
    }
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); h.wheel?.(e.deltaY > 0 ? -1 : 1, x, y); }, { passive: false });
  return () => { clearTimeout(timer); };
}
