import { withAlpha } from '../../core/color.ts';
import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Vec2 } from '../../core/vec2.ts';

const FAR: Vec2[] = [
  { x: 895, y: 430 }, { x: 1018, y: 340 }, { x: 1090, y: 365 },
  { x: 1188, y: 282 }, { x: 1280, y: 338 }, { x: 1280, y: 440 },
];
const FAR_LIGHT: Vec2[] = [
  { x: 1090, y: 365 }, { x: 1188, y: 282 }, { x: 1216, y: 305 },
  { x: 1168, y: 345 }, { x: 1138, y: 340 },
];
const FAR_SHADE: Vec2[] = [
  { x: 1188, y: 282 }, { x: 1280, y: 338 }, { x: 1280, y: 440 },
  { x: 1190, y: 420 }, { x: 1230, y: 355 },
];
const NEAR: Vec2[] = [
  { x: 800, y: 438 }, { x: 912, y: 390 }, { x: 980, y: 405 },
  { x: 1080, y: 370 }, { x: 1142, y: 400 }, { x: 1200, y: 380 },
  { x: 1280, y: 390 }, { x: 1280, y: 470 }, { x: 800, y: 470 },
];
const rng = createRng(0x12a11);
const MIST: Vec2[][] = Array.from({ length: 2 }, (_, band) => {
  const y = 394 + band * 28;
  const points: Vec2[] = [{ x: 820, y }];
  for (let i = 0; i <= 12; i++) points.push({ x: 820 + i * 40, y: y + Math.sin(i * 0.8 + band) * (3 + rng() * 3) });
  points.push({ x: 1280, y: y + 23 }, { x: 820, y: y + 23 });
  return points;
});

export class Mountains implements SceneObject {
  readonly id = 'mountains'; readonly name = 'Núi nhiều lớp';
  readonly description = 'Các sườn núi xa gần tạo chiều sâu phía sau khu rừng.';
  readonly algorithms = ['Scanline polygon fill', 'Polygon shading', 'Alpha blending'];
  readonly layer = Layer.MOUNTAIN_FAR; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    r.polygon(FAR, env.palette.mountainFar);
    r.polygon(FAR_LIGHT, env.palette.mountainNear);
    r.polygon(FAR_SHADE, env.palette.forestFar);
    r.polygon(NEAR, env.palette.mountainNear);
    for (const band of MIST) r.polygon(band, withAlpha(env.palette.cloud, 0.12));
  }
}
