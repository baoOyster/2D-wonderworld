import { withAlpha } from '../../core/color.ts';
import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { ClickContext, Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

const CX = 1010, CY = 590, RX = 300, RY = 66;
const HIT_POLYGON: Vec2[] = Array.from({ length: 40 }, (_, i) => {
  const angle = i * Math.PI * 2 / 40;
  return { x: CX + Math.cos(angle) * RX, y: CY + Math.sin(angle) * RY };
});
const rng = createRng(0x13a11);
const RIPPLES = Array.from({ length: 12 }, () => ({
  x: -0.78 + rng() * 1.56,
  y: -0.72 + rng() * 1.44,
  length: 12 + rng() * 28,
  phase: rng() * Math.PI * 2,
  speed: 0.45 + rng() * 0.8,
  alpha: 0.16 + rng() * 0.28,
}));
const REFLECTIONS = Array.from({ length: 5 }, (_, i) => ({
  x: 1188 + (i % 2 ? 4 : -3), y: 535 + i * 13, rx: 8 + (i % 3) * 4, ry: 2 + (i % 2),
  alpha: 0.34 - i * 0.045,
}));
const DAY_GLINTS = Array.from({ length: 5 }, (_, i) => ({
  x: 900 + i * 49, y: 566 + (i % 2) * 8, rx: 15 + (i % 3) * 5, ry: 2,
}));

function inLake(x: number, y: number): boolean {
  const dx = (x - CX) / RX, dy = (y - CY) / RY;
  return dx * dx + dy * dy <= 1;
}

export class Lake implements SceneObject {
  readonly id = 'lake';
  readonly name = 'Hồ nước';
  readonly description = 'Mặt hồ gợn sóng phản chiếu ánh trời và trăng.';
  readonly algorithms = ['Midpoint ellipse', 'DDA', 'Alpha blending', 'Ellipse hit polygon'];
  readonly layer = Layer.LAKE;
  readonly interactive = true;
  /** Last click in world space; fish can read this to scatter away. */
  lastClickPosition: Vec2 | null = null;
  /** Environment time of the most recent click. */
  lastClickTime = Number.NEGATIVE_INFINITY;

  hitPolygons(_env: Env): readonly Vec2[][] { return [HIT_POLYGON]; }
  onClick(ctx: ClickContext): void {
    ctx.ui.select(this);
    const pointer = (ctx.env as Env & { pointer?: Vec2 | null }).pointer;
    if (pointer && inLake(pointer.x, pointer.y)) {
      this.lastClickPosition = { x: pointer.x, y: pointer.y };
      this.lastClickTime = ctx.env.time;
    }
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    // Bank rim and water body, ordered from outside inward.
    r.ellipse(CX, CY, RX + 5, RY + 5, p.groundDark, true);
    r.ellipse(CX, CY, RX, RY, p.waterShallow, true);
    r.ellipse(CX - 9, CY + 4, RX - 25, RY - 12, p.waterDeep, true);

    for (const glint of DAY_GLINTS) {
      const x = glint.x, y = glint.y + Math.sin(env.time * 0.7 + x) * 1.5;
      if (inLake(x, y)) r.ellipse(x, y, glint.rx, glint.ry, withAlpha(p.waterHighlight, 0.28), true);
    }

    for (const ripple of RIPPLES) {
      const y = CY + ripple.y * RY + Math.sin(env.time * ripple.speed + ripple.phase) * 2.4;
      const normalizedY = (y - CY) / RY;
      const halfWidth = RX * Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
      const x = CX + ripple.x * halfWidth;
      const halfLength = ripple.length / 2;
      let x0 = Math.max(CX - halfWidth, x - halfLength);
      let x1 = Math.min(CX + halfWidth, x + halfLength);
      if (x1 <= x0) continue;
      // Clamp both endpoints to the ellipse boundary at this y.
      while (x0 < x1 && !inLake(x0, y)) x0++;
      while (x1 > x0 && !inLake(x1, y)) x1--;
      if (x1 > x0 && inLake((x0 + x1) / 2, y)) {
        const phaseAlpha = 0.65 + 0.35 * Math.sin(env.time * ripple.speed + ripple.phase);
        r.line(x0, y, x1, y, withAlpha(p.waterHighlight, ripple.alpha * phaseAlpha), 1, 'dda');
      }
    }

    const night = Math.max(0, Math.min(1, env.dayPhase));
    for (const reflection of REFLECTIONS) {
      const y = reflection.y + Math.sin(env.time * 0.8 + reflection.y) * 1.8;
      if (inLake(reflection.x, y)) {
        r.ellipse(reflection.x, y, reflection.rx, reflection.ry,
          withAlpha(p.moonGlow, reflection.alpha * night), true);
      }
    }

    // Three delayed ellipse rings expand and fade over 1.5 seconds.
    if (this.lastClickPosition) {
      const age = env.time - this.lastClickTime;
      if (age >= 0 && age < 1.5) {
        for (let i = 0; i < 3; i++) {
          const ringAge = age - i * 0.22;
          if (ringAge < 0) continue;
          const progress = Math.min(1, ringAge / 1.5);
          const rx = 5 + progress * 50;
          const ry = 2 + progress * 12;
          r.ellipse(this.lastClickPosition.x, this.lastClickPosition.y, rx, ry,
            withAlpha(p.waterHighlight, (1 - progress) * 0.75), false);
        }
      }
    }

    // A small cursor-following ripple appears only while the pointer is on water.
    const pointer = (env as Env & { pointer?: Vec2 | null }).pointer;
    if (pointer && inLake(pointer.x, pointer.y)) {
      const pulse = 0.5 + 0.5 * Math.sin(env.time * 5);
      r.ellipse(pointer.x, pointer.y, 8 + pulse * 3, 3 + pulse, withAlpha(p.waterHighlight, 0.72), false);
      r.ellipse(pointer.x, pointer.y, 2, 1, withAlpha(p.waterHighlight, 0.45), true);
    }
    r.ellipse(CX, CY, RX, RY, p.ink, false);
  }
}
