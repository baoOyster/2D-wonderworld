import { withAlpha } from '../../core/color.ts';
import { mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import { createRng } from '../../core/rng.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface Puff { x: number; y: number; rx: number; ry: number; }
interface Cloud {
  x: number; y: number; scale: number; speed: number; phase: number;
  puffs: Puff[]; shadow: Puff[]; root: Node;
}

const rng = createRng(0xc10d);
const WORLD_WIDTH = 1280;
const WRAP_MARGIN = 150;
const CLOUDS: Cloud[] = (() => {
  const random = rng;
  return Array.from({ length: 5 }, (_, i) => {
    const scale = 0.7 + random() * 0.6;
    const count = 4 + Math.floor(random() * 4);
    const puffs = Array.from({ length: count }, (_, j) => ({
      x: (j - (count - 1) / 2) * (25 + random() * 8),
      y: -random() * 8,
      rx: 26 + random() * 20,
      ry: 15 + random() * 10,
    }));
    return {
      x: 170 + i * 265 + random() * 55,
      y: 100 + random() * 200,
      scale,
      speed: 4 + random() * 8,
      phase: random() * Math.PI * 2,
      puffs,
      shadow: puffs.map((puff) => ({ ...puff, y: puff.y + puff.ry * 0.28 })),
      root: new Node(),
    };
  });
})();

/** Five deterministic multi-ellipse clouds with gentle drift and wraparound. */
export class CloudLayer implements SceneObject {
  readonly id = 'cloud-layer';
  readonly name = 'Mây';
  readonly description = 'Những cụm mây nhiều lớp trôi chậm qua bầu trời.';
  readonly algorithms = ['Midpoint ellipse', 'Node / Mat3 scale', 'Seeded RNG', 'Wrap ngang'];
  readonly layer = Layer.CLOUD;
  readonly interactive = false;

  draw(r: Renderer, env: Env): void {
    const period = WORLD_WIDTH + WRAP_MARGIN * 2;
    for (const cloud of CLOUDS) {
      const traveled = cloud.x + env.time * cloud.speed;
      const x = ((traveled + WRAP_MARGIN) % period + period) % period - WRAP_MARGIN;
      const y = cloud.y + Math.sin(env.time * 0.55 + cloud.phase) * 2.5;
      cloud.root.transform = { x, y, rotation: 0, scaleX: cloud.scale, scaleY: cloud.scale };
      const matrix = cloud.root.worldMatrix();
      const shade = env.dayPhase > 0.35
        ? withAlpha(env.palette.moonGlow, 0.16)
        : env.palette.cloudShade;
      // Paint one soft lower shadow mass, then the overlapping cloud puffs.
      for (const puff of cloud.shadow) {
        const center: Vec2 = mat3Apply(matrix, puff);
        r.ellipse(center.x, center.y, puff.rx * cloud.scale, puff.ry * cloud.scale, shade, true);
      }
      for (const puff of cloud.puffs) {
        const center: Vec2 = mat3Apply(matrix, puff);
        r.ellipse(center.x, center.y, puff.rx * cloud.scale, puff.ry * cloud.scale, env.palette.cloud, true);
      }
    }
  }
}
