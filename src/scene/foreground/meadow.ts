/**
 * Bãi hoa cỏ tiền cảnh (#17): gộp hoa và cỏ thành một vật thể để vẽ chung theo
 * độ sâu (thuật toán hoạ sĩ, painter's algorithm).
 *
 * Mọi bông hoa và khóm cỏ được sắp theo y của gốc: gốc càng cao (xa hơn) vẽ
 * trước, gốc càng thấp (gần hơn) vẽ sau. Nhờ vậy vật mọc phía trên trong hình
 * không bao giờ che vật mọc phía dưới nó.
 */
import type { Renderer } from '../../core/renderer-types.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import { Flowers } from './flowers.ts';
import { Grass } from './grass.ts';

/** Một mục trong thứ tự vẽ: hoa hoặc khóm cỏ, chỉ số và y gốc. */
export interface MeadowItem {
  readonly kind: 'flower' | 'tuft';
  readonly index: number;
  readonly y: number;
}

/** Thứ tự vẽ theo y gốc tăng dần; cùng y thì cỏ trước hoa. */
export function meadowOrder(flowers: Flowers, grass: Grass): MeadowItem[] {
  const items: MeadowItem[] = [
    ...grass.tufts.map((t, index) => ({ kind: 'tuft' as const, index, y: t.base.y })),
    ...flowers.specs.map((f, index) => ({ kind: 'flower' as const, index, y: f.base.y })),
  ];
  return items.sort((a, b) => a.y - b.y || (a.kind === b.kind ? 0 : a.kind === 'tuft' ? -1 : 1));
}

export class Meadow implements SceneObject {
  readonly id = 'meadow';
  readonly name = 'Hoa và cỏ';
  readonly description = 'Hoa nhiều màu và các khóm cỏ ở tiền cảnh, lay nhẹ theo gió.';
  readonly algorithms: readonly string[];
  readonly layer = Layer.FLOWER;
  readonly interactive = false;

  readonly flowers: Flowers;
  readonly grass: Grass;
  readonly order: readonly MeadowItem[];

  constructor(flowers = new Flowers(), grass = new Grass()) {
    this.flowers = flowers;
    this.grass = grass;
    this.order = meadowOrder(flowers, grass);
    this.algorithms = [...flowers.algorithms, ...grass.algorithms, 'Thuật toán hoạ sĩ (sắp theo y gốc)'];
  }

  update(env: Env): void {
    this.flowers.update(env);
    this.grass.update(env);
  }

  draw(r: Renderer, env: Env): void {
    this.update(env);
    for (const it of this.order) {
      if (it.kind === 'flower') this.flowers.drawFlower(r, env.palette, it.index, env.dayPhase);
      else this.grass.drawTuft(r, env.palette, it.index);
    }
  }
}
