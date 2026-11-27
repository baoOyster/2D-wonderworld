import { ellipsePolygon, mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface Leaf { x: number; y: number; rx: number; ry: number; angle: number; }
const BIG_LEAVES: Leaf[] = [
  { x: 970, y: 680, rx: 125, ry: 30, angle: -0.45 },
  { x: 1085, y: 700, rx: 150, ry: 34, angle: -0.16 },
  { x: 1190, y: 665, rx: 118, ry: 29, angle: -0.82 },
  { x: 1260, y: 710, rx: 100, ry: 28, angle: -0.3 },
  { x: 1090, y: 610, rx: 92, ry: 23, angle: -0.95 },
  { x: 1230, y: 590, rx: 80, ry: 21, angle: -1.2 },
];
const FERN_LEAVES: Leaf[] = Array.from({ length: 7 }, (_, i) => ({
  x: 12 + i * 13, y: 682 - (i % 3) * 8, rx: 48 + (i % 2) * 12, ry: 6,
  angle: -0.35 + i * 0.1,
}));

const ALL_LEAVES = [...BIG_LEAVES, ...FERN_LEAVES];
const ROOTS = ALL_LEAVES.map(() => new Node());
const HOVERED = ALL_LEAVES.map(() => false);
const TRIGGERED_AT = ALL_LEAVES.map(() => -Infinity);

function isOver(pointer: Vec2 | null | undefined, leaf: Leaf): boolean {
  if (!pointer) return false;
  const dx = pointer.x - leaf.x, dy = pointer.y - leaf.y;
  const c = Math.cos(leaf.angle), s = Math.sin(leaf.angle);
  const x = dx * c + dy * s, y = -dx * s + dy * c;
  return (x / leaf.rx) ** 2 + (y / leaf.ry) ** 2 <= 1;
}

export class ForegroundLeaves implements SceneObject {
  readonly id = 'foreground-leaves'; readonly name = 'Lá tiền cảnh';
  readonly description = 'Các lá lớn tạo khung ở góc phải và dương xỉ ở mép trái.';
  readonly algorithms = ['Midpoint ellipse polygon', 'Node rotation', 'Damped oscillation', 'Polygon fill'];
  readonly layer = Layer.LEAF_FG; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    const pointer = (env as Env & { pointer?: Vec2 | null }).pointer;
    for (let i = 0; i < ALL_LEAVES.length; i++) {
      const leaf = ALL_LEAVES[i], root = ROOTS[i];
      const over = isOver(pointer, leaf);
      if (over && !HOVERED[i]) TRIGGERED_AT[i] = env.time;
      HOVERED[i] = over;
      const age = env.time - TRIGGERED_AT[i];
      const sway = age >= 0 && age < 1.5 ? Math.sin(age * 24 + i * 0.7) * Math.exp(-2.8 * age) * 0.22 : 0;
      root.transform = { x: leaf.x, y: leaf.y, rotation: leaf.angle + sway, scaleX: 1, scaleY: 1 };
      const points: Vec2[] = ellipsePolygon(0, 0, leaf.rx, leaf.ry, 24).map((point) => mat3Apply(root.worldMatrix(), point));
      const color = i < BIG_LEAVES.length ? env.palette.leafFg : env.palette.leaf;
      r.polygon(points, color);
      r.polygon(points, env.palette.inkSoft, false);
    }
  }
}
