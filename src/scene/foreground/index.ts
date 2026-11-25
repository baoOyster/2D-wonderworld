/** Tiền cảnh (#17): hoa nhiều màu và cỏ, vẽ chung theo độ sâu trong `Meadow`. */
import type { SceneObject } from '../types.ts';
import { Meadow } from './meadow.ts';

export { Flowers } from './flowers.ts';
export { Grass } from './grass.ts';
export { Meadow } from './meadow.ts';

/** Tạo các vật thể tiền cảnh. */
export function createForeground(): SceneObject[] {
  return [new Meadow()];
}
