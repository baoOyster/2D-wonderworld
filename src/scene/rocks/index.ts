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
  LIGHT_DIR,
  PEBBLE_COUNT,
  Pebbles,
  boulderShape,
  generatePebbles,
  stoneTones,
} from './rocks.ts';
export type { BoulderShape, BoulderSpec, Pebble } from './rocks.ts';
export {
  HOVER_MAX_LEAN,
  HOVER_RADIUS,
  REED_CLUSTERS,
  REED_DAMPING,
  REED_STIFFNESS,
  REED_SWAY_SPEED,
  Reeds,
  generateClusters,
  stemCurve,
  tipAngle,
} from './reeds.ts';
export type { ReedCluster, ReedHead, ReedStem } from './reeds.ts';

/** Tạo các vật thể của vùng đá ven hồ (#20). */
export function createRocks(): SceneObject[] {
  return [new Pebbles(), new Boulders(), new Reeds()];
}
