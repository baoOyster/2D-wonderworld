import type { SceneObject } from '../types.ts';
import { Bushes } from './bushes.ts';
import { ForegroundLeaves } from './leaves.ts';
import { Mushrooms } from './mushrooms.ts';

export { Bushes } from './bushes.ts';
export { Mushrooms } from './mushrooms.ts';
export { ForegroundLeaves } from './leaves.ts';

/** Register bushes first so the mushrooms at the same layer stay in front. */
export function createDecor(): SceneObject[] {
  return [new Bushes(), new Mushrooms(), new ForegroundLeaves()];
}
