import { Layer } from '../layers.ts';
import { mat3Apply, ellipsePolygon } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer, WorldMask } from '../../core/renderer-types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface Bush { x: number; y: number; rx: number; ry: number; }
const PUFFS: Bush[] = [
  { x: 286, y: 468, rx: 21, ry: 16 }, { x: 306, y: 463, rx: 23, ry: 19 }, { x: 326, y: 470, rx: 18, ry: 14 },
  { x: 555, y: 469, rx: 22, ry: 17 }, { x: 578, y: 464, rx: 25, ry: 20 }, { x: 601, y: 470, rx: 18, ry: 15 },
  { x: 145, y: 474, rx: 25, ry: 20 }, { x: 170, y: 469, rx: 28, ry: 22 }, { x: 194, y: 476, rx: 20, ry: 16 },
  { x: 690, y: 483, rx: 27, ry: 18 }, { x: 715, y: 479, rx: 25, ry: 20 }, { x: 739, y: 485, rx: 21, ry: 15 },
];
const GROUPS = [PUFFS.slice(0, 3), PUFFS.slice(3, 6), PUFFS.slice(6, 9), PUFFS.slice(9)];
const ANCHORS = GROUPS.map((group) => ({ x: group[1].x, y: group[1].y }));
const ROOTS = ANCHORS.map(() => new Node());
const HOVERED = [false, false, false, false];
const TRIGGERED_AT = [-Infinity, -Infinity, -Infinity, -Infinity];

function makeBushMask(r: Renderer, cluster: Bush[], root: Node, anchor: Vec2): WorldMask {
  const mask = r.mask();
  const matrix = root.worldMatrix();
  for (const puff of cluster) {
    const points = ellipsePolygon(puff.x - anchor.x, puff.y - anchor.y, puff.rx, puff.ry, 20).map((point) => mat3Apply(matrix, point));
    mask.polygon(points);
  }
  return mask;
}

function pointerOver(pointer: Vec2 | null | undefined, cluster: Bush[]): boolean {
  return !!pointer && cluster.some((puff) => ((pointer.x - puff.x) / puff.rx) ** 2 + ((pointer.y - puff.y) / puff.ry) ** 2 <= 1);
}

export class Bushes implements SceneObject {
  readonly id = 'foreground-bushes'; readonly name = 'Bụi cây';
  readonly description = 'Các bụi lá thấp che chân cây và mép tiếp giáp với mặt đất.';
  readonly algorithms = ['Midpoint ellipse', 'Mask union', 'Node damped rotation', 'Three-tone shading'];
  readonly layer = Layer.SMALL_DECOR; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    const pointer = (env as Env & { pointer?: Vec2 | null }).pointer;
    // Preserve the joined shape and draw the group before small mushrooms.
    for (let i = 0; i < GROUPS.length; i++) {
      const cluster = GROUPS[i], anchor = ANCHORS[i], root = ROOTS[i];
      const over = pointerOver(pointer, cluster);
      if (over && !HOVERED[i]) TRIGGERED_AT[i] = env.time;
      HOVERED[i] = over;
      const age = env.time - TRIGGERED_AT[i];
      const sway = age >= 0 && age < 1.35 ? Math.sin(age * 25) * Math.exp(-3.2 * age) * 0.16 : 0;
      root.transform = { x: anchor.x, y: anchor.y, rotation: sway, scaleX: 1, scaleY: 1 };
      const mask = makeBushMask(r, cluster, root, anchor);
      r.shape(mask, { fill: env.palette.canopy, shade: env.palette.canopyDark, highlight: env.palette.canopyLight, outline: env.palette.inkSoft, outlineWidth: 1 });
      const center = cluster[Math.floor(cluster.length / 2)];
      const transformed = mat3Apply(root.worldMatrix(), { x: center.x - anchor.x - 5, y: center.y - anchor.y - center.ry * 0.45 });
      r.ellipse(transformed.x, transformed.y, 4, 2, env.palette.canopyLight, true);
    }
  }
}
