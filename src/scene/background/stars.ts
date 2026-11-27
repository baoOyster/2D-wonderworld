import { withAlpha } from '../../core/color.ts';
import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';

const rng = createRng(0x51a7);
const STARS = Array.from({ length: 70 }, () => ({
  x: 12 + rng() * 1256, y: 12 + rng() * 360,
  speed: 0.7 + rng() * 1.8, phase: rng() * Math.PI * 2, large: rng() < 0.12,
  points: undefined as { x: number; y: number }[] | undefined,
})).filter((s) => (s.x - 1188) ** 2 + (s.y - 150) ** 2 > 42 ** 2);
for (const star of STARS) {
  if (star.large) star.points = [
    { x: star.x, y: star.y }, { x: star.x + 2, y: star.y },
    { x: star.x + 2, y: star.y + 2 }, { x: star.x, y: star.y + 2 },
  ];
}

export class Stars implements SceneObject {
  readonly id = 'stars'; readonly name = 'Các vì sao';
  readonly description = 'Những vì sao lấp lánh khi trời về đêm.';
  readonly algorithms = ['Seeded RNG', 'Alpha blending', 'Sinusoidal twinkle'];
  readonly layer = Layer.STARS; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    const visibility = Math.max(0, Math.min(1, (env.dayPhase - 0.35) / 0.65));
    if (visibility <= 0) return;
    for (const star of STARS) {
      const twinkle = 0.55 + 0.45 * Math.sin(env.time * star.speed + star.phase);
      const color = withAlpha(env.palette.star, visibility * twinkle);
      if (star.points) r.polygon(star.points, color);
      else r.circle(star.x, star.y, 1, color, true);
    }
  }
}
