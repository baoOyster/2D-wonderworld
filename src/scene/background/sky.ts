import { lerpColor } from '../../core/color.ts';
import { WORLD_H, WORLD_W } from '../../core/config.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';

const BANDS = Array.from({ length: 32 }, (_, i) => {
  const y0 = i * WORLD_H / 32;
  const y1 = (i + 1) * WORLD_H / 32 + 1;
  return { y: (y0 + y1) / 2, points: [{ x: 0, y: y0 }, { x: WORLD_W, y: y0 }, { x: WORLD_W, y: y1 }, { x: 0, y: y1 }] };
});

/** Sky gradient made from 32 scanline-friendly filled bands. */
export class Sky implements SceneObject {
  readonly id = 'sky'; readonly name = 'Bầu trời';
  readonly description = 'Bầu trời chuyển sắc theo chu kỳ ngày và đêm.';
  readonly algorithms = ['Scanline polygon fill', 'Nội suy màu'];
  readonly layer = Layer.SKY; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    for (const band of BANDS) {
      const t = band.y / WORLD_H;
      const color = t < 0.5
        ? lerpColor(env.palette.skyTop, env.palette.skyMid, t * 2)
        : lerpColor(env.palette.skyMid, env.palette.skyBottom, (t - 0.5) * 2);
      r.polygon(band.points, color);
    }
  }
}
