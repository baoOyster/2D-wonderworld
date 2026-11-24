/**
 * Thứ tự vẽ (z-order) của cảnh — SPEC #1, mục "Layer (z-order)".
 *
 * `World` sort vật thể tăng dần theo `layer`; cùng layer giữ nguyên thứ tự
 * đăng ký. Số càng lớn càng vẽ sau (nằm trên).
 */
export const Layer = {
  SKY: 0,
  STARS: 1,
  CELESTIAL: 2,
  CLOUD: 3,
  MOUNTAIN_FAR: 4,
  MOUNTAIN_NEAR: 5,
  FOREST_FAR: 6,
  FOREST_NEAR: 7,
  GROUND: 8,
  LAKE: 9,
  FISH: 10,
  ROCK: 12,
  BRIDGE: 13,
  TREE: 20,
  HOUSE: 21,
  FENCE: 22,
  PATH: 23,
  FLOWER: 30,
  GRASS: 31,
  SMALL_DECOR: 32,
  RABBIT: 33,
  LEAF_FG: 34,
  BUTTERFLY: 40,
  FIREFLY: 41,
  BIRD: 42,
  OVERLAY: 100,
} as const;

/** Tên một layer hợp lệ. */
export type LayerName = keyof typeof Layer;

/** Giá trị số của layer (dùng cho `SceneObject.layer: number`). */
export type LayerValue = (typeof Layer)[LayerName];
