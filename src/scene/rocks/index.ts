/**
 * Vùng đá ven hồ (#20): đá lớn, sỏi và lau sậy — cả ba cùng layer `ROCK`, vẽ
 * theo thứ tự sỏi (dưới) → đá (giữa) → sậy (trên, vì sậy mọc sau bờ đá).
 */
import type { SceneObject } from '../types.ts';
import { Boulders, Pebbles } from './rocks.ts';
import { Reeds } from './reeds.ts';

export {
  BOULDERS,
  Boulders,
  LAKE,
  PEBBLE_COUNT,
  REFLECT_ALPHA,
  REFLECT_FADE,
  REFLECT_NEAR_ALPHA,
  REFLECT_SQUASH,
  ROCK_ASPECT,
  ROCK_SUBMERGE,
  ROCK_VERTICES,
  ROCK_WOBBLE,
  Pebbles,
  boulderShape,
  clipHorizontal,
  desaturate,
  generatePebbles,
  lakeEdgeY,
  lakePoint,
  stoneStyle,
  stoneTones,
} from './rocks.ts';
export type { BoulderShape, BoulderSpec, Pebble, StoneTones } from './rocks.ts';
export {
  HOVER_MAX_LEAN,
  HOVER_RADIUS,
  REED_CLUSTERS,
  REED_DAMPING,
  REED_STIFFNESS,
  REED_SWAY_SPEED,
  Reeds,
  generateClusters,
} from './reeds.ts';
export type { ReedBlade, ReedCluster } from './reeds.ts';

/** Tạo các vật thể của vùng đá ven hồ (#20). */
export function createRocks(): SceneObject[] {
  return [new Pebbles(), new Boulders(), new Reeds()];
}
