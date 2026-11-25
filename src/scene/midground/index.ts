/**
 * Trung cảnh: cây cổ thụ, nhà nấm, hàng rào, lối đi.
 */
import type { SceneObject } from '../types.ts';
import { AncientTree } from './tree.ts';

export { AncientTree } from './tree.ts';

export function createMidground(): SceneObject[] {
  return [new AncientTree()];
}
