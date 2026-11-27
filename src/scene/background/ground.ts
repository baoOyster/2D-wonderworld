import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Vec2 } from '../../core/vec2.ts';

const rng = createRng(0x6120);
const EDGE: Vec2[] = Array.from({ length: 17 }, (_, i) => ({
  x: i * 80,
  y: 460 + Math.sin(i * 0.9) * 7 + (rng() - 0.5) * 7,
}));
const GROUND: Vec2[] = [...EDGE, { x: 1280, y: 720 }, { x: 0, y: 720 }];
const RIDGE: Vec2[] = [
  ...Array.from({ length: 17 }, (_, i) => ({ x: i * 80, y: 486 + Math.sin(i * 0.8 + 0.5) * 5 })),
  { x: 1280, y: 535 }, { x: 0, y: 535 },
];
const LOWER: Vec2[] = [
  ...Array.from({ length: 17 }, (_, i) => ({ x: i * 80, y: 570 + Math.sin(i * 0.7 + 1.2) * 8 })),
  { x: 1280, y: 635 }, { x: 0, y: 635 },
];

export class Ground implements SceneObject {
  readonly id = 'ground'; readonly name = 'Nền đất';
  readonly description = 'Mặt đất gợn nhẹ nối chân rừng với tiền cảnh.';
  readonly algorithms = ['Scanline polygon fill', 'Seeded geometry'];
  readonly layer = Layer.GROUND; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    r.polygon(GROUND, env.palette.ground);
    r.polygon(RIDGE, env.palette.groundDark);
    r.polygon(LOWER, env.palette.ground);
  }
}
