import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface TreeShape { trunk: Vec2[]; crown: Vec2[]; }
function makeTree(x: number, base: number, height: number, width: number, conifer: boolean, rng: () => number): TreeShape {
  const trunkWidth = Math.max(3, width * 0.12);
  const trunk = [
    { x: x - trunkWidth / 2, y: base }, { x: x - trunkWidth / 2, y: base - height * 0.55 },
    { x: x + trunkWidth / 2, y: base - height * 0.55 }, { x: x + trunkWidth / 2, y: base },
  ];
  const crown: Vec2[] = [{ x, y: base - height }];
  if (conifer) {
    crown.push({ x: x + width * 0.25, y: base - height * 0.62 }, { x: x + width * 0.12, y: base - height * 0.64 },
      { x: x + width * 0.4, y: base - height * 0.34 }, { x: x + width * 0.17, y: base - height * 0.39 },
      { x: x + width * 0.5, y: base }, { x: x - width * 0.5, y: base },
      { x: x - width * 0.17, y: base - height * 0.39 }, { x: x - width * 0.4, y: base - height * 0.34 },
      { x: x - width * 0.12, y: base - height * 0.64 }, { x: x - width * 0.25, y: base - height * 0.62 });
  } else {
    const lobes = 9;
    for (let i = 0; i < lobes; i++) {
      const angle = Math.PI + i * Math.PI / (lobes - 1);
      const radius = width * (0.43 + rng() * 0.09);
      crown.push({ x: x + Math.cos(angle) * radius, y: base - height * 0.66 + Math.sin(angle) * height * 0.34 });
    }
  }
  return { trunk, crown };
}

const FAR_TREES: TreeShape[] = (() => {
  const rng = createRng(0xfaf012);
  const trees: TreeShape[] = [];
  // Tall left pines are placed behind the ancient tree; shorter trees fill the far ridge.
  for (let i = 0; i < 30; i++) {
    const left = i < 9;
    const x = left ? i * 28 - 12 : 540 + (i - 9) * 33;
    // Ground begins around y=460; extend the trunks into it so the silhouette
    // has no visible strip of sky/terrain between the tree bases and the soil.
    const base = 468;
    const height = (left ? 230 - rng() * 120 : 90 + rng() * 54) + 30;
    trees.push(makeTree(x, base, height, (left ? 34 : 27) + rng() * 15, i % 3 !== 0, rng));
  }
  return trees;
})();
const NEAR_TREES: TreeShape[] = (() => {
  const rng = createRng(0x18f012);
  return Array.from({ length: 18 }, (_, i) => {
    const x = 700 + i * 34 + rng() * 16;
    const height = 77 + rng() * 38;
    return makeTree(x, 470, height, 32 + rng() * 22, i % 4 !== 0, rng);
  });
})();

export class Forest implements SceneObject {
  readonly id = 'forest'; readonly name = 'Rừng silhouette';
  readonly description = 'Hai lớp cây xa gần làm nền cho khu rừng cổ tích.';
  readonly algorithms = ['Polygon fill', 'Silhouette', 'Seeded RNG'];
  readonly layer = Layer.FOREST_FAR; readonly interactive = false;
  draw(r: Renderer, env: Env): void {
    for (const tree of FAR_TREES) {
      r.polygon(tree.trunk, env.palette.forestFar);
      r.polygon(tree.crown, env.palette.forestFar);
    }
    for (const tree of NEAR_TREES) {
      r.polygon(tree.trunk, env.palette.forestNear);
      r.polygon(tree.crown, env.palette.forestNear);
    }
  }
}
