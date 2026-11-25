/**
 * Trung cảnh: cây cổ thụ, nhà nấm, hàng rào, lối đi.
 */
import type { SceneObject } from '../types.ts';
import { MushroomHouse } from './mushroom-house.ts';
import { AncientTree } from './tree.ts';

export { AncientTree } from './tree.ts';
export { MushroomHouse } from './mushroom-house.ts';

export function createMidground(): SceneObject[] {
  return [new AncientTree(), new MushroomHouse()];
}
