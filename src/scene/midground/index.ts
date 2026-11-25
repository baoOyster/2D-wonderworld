/**
 * Trung cảnh: cây cổ thụ, nhà nấm, hàng rào, lối đi.
 */
import type { SceneObject } from '../types.ts';
import { Fence } from './fence.ts';
import { GardenPath } from './path.ts';
import { MushroomHouse } from './mushroom-house.ts';
import { AncientTree } from './tree.ts';

export { AncientTree } from './tree.ts';
export { MushroomHouse } from './mushroom-house.ts';
export { Fence } from './fence.ts';
export { GardenPath } from './path.ts';

export function createMidground(): SceneObject[] {
  return [new AncientTree(), new MushroomHouse(), new Fence(), new GardenPath()];
}
