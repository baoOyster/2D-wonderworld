/**
 * Lối đi đất (#16): từ chân bậc thềm nhà nấm uốn xuống tiền cảnh, rộng dần.
 *
 * Thuật toán dùng:
 * - Đường giữa lối đi là đường cong Bézier bậc 3 (uốn chữ S); hai mép lấy mẫu
 *   dọc đường cong theo pháp tuyến, độ rộng tăng dần và gợn nhẹ → một đa giác,
 *   tô scanline.
 * - Phiến đá: elip (Midpoint) trong lối đi, vị trí lệch theo RNG seed cố định.
 * - Hình học tạo một lần trong constructor.
 *
 * Toạ độ world 1280×720. Điểm đầu khớp bậc thềm cuối của nhà nấm sau khi nhà
 * được hạ và dời (`HOUSE_DROP`, `HOUSE_SHIFT`).
 */
import { lerpColor } from '../../core/color.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import { FENCE_SEGMENTS } from './fence.ts';
import {
  HOUSE_DROP, HOUSE_SHIFT, STEP_COUNT, STEP_DX, STEP_ORIGIN, STEP_W,
} from './mushroom-house.ts';

/**
 * Chỗ nối với gò đất (toạ độ world). Mép trên lối đi nằm đúng trên mép đáy gò
 * (`MOUND`, y = 496 theo layout + `HOUSE_DROP`). Mép trái nằm giữa đầu đoạn rào
 * trái và bậc thềm cuối; mép phải nằm giữa bậc thềm cuối và đoạn rào phải.
 */
const MOUND_BOTTOM_Y = 496 + HOUSE_DROP;
const LAST_STEP_LEFT = STEP_ORIGIN.x + (STEP_COUNT - 1) * STEP_DX + HOUSE_SHIFT;
const LAST_STEP_RIGHT = LAST_STEP_LEFT + STEP_W;
const LEFT_FENCE_END = FENCE_SEGMENTS[0].to.x + 6;
const RIGHT_FENCE_END = FENCE_SEGMENTS[1].to.x + 6;
export const PATH_LEFT = (LEFT_FENCE_END + LAST_STEP_LEFT) / 2;
export const PATH_RIGHT = (LAST_STEP_RIGHT + RIGHT_FENCE_END) / 2;
export const PATH_START: Vec2 = vec2((PATH_LEFT + PATH_RIGHT) / 2, MOUND_BOTTOM_Y);

/** Hai điểm điều khiển và điểm cuối của đường giữa (Bézier bậc 3). */
// Lối đi chéo xuống bên phải; điểm cuối nằm dưới mép khung hình để mép dưới
// lối đi bị khung cắt.
// Điểm cuối nằm hẳn dưới mép khung hình (y = 720): cả mép cuối lối đi bị khung
// cắt, không lộ một nửa trong màn hình.
export const PATH_C1: Vec2 = vec2(PATH_START.x + 40, 600);
export const PATH_C2: Vec2 = vec2(700, 650);
export const PATH_END: Vec2 = vec2(820, 860);

/** Độ rộng lối đi ở chỗ nối với gò đất (rộng hơn bậc thềm) và ở mép dưới khung hình. */
export const PATH_WIDTH_START = PATH_RIGHT - PATH_LEFT;
export const PATH_WIDTH_END = 290;

/** Số điểm lấy mẫu mỗi mép. */
const SAMPLES = 28;

/** Điểm trên đường giữa (Bézier bậc 3) tại t ∈ [0, 1]. */
export function pathCenter(t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return vec2(
    a * PATH_START.x + b * PATH_C1.x + c * PATH_C2.x + d * PATH_END.x,
    a * PATH_START.y + b * PATH_C1.y + c * PATH_C2.y + d * PATH_END.y,
  );
}

/** Tiếp tuyến của Bézier bậc 3 tại t (đạo hàm). */
function pathTangent(t: number): Vec2 {
  const u = 1 - t;
  const f = (p0: number, p1: number, p2: number, p3: number): number =>
    3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
  return vec2(
    f(PATH_START.x, PATH_C1.x, PATH_C2.x, PATH_END.x),
    f(PATH_START.y, PATH_C1.y, PATH_C2.y, PATH_END.y),
  );
}

/** Độ rộng lối đi tại t: tăng dần về tiền cảnh. */
export function pathWidth(t: number): number {
  return PATH_WIDTH_START + (PATH_WIDTH_END - PATH_WIDTH_START) * t;
}

/** Độ dốc mép phải ở đoạn đầu: đi chéo xuống từ đầu hàng rào phải. */
const EDGE_SLOPE = 0.55;

/**
 * Giữ điểm mép nằm dưới chân gò và không lấn ra ngoài hàng rào phải: bên phải
 * PATH_RIGHT, mép phải nằm dưới đường chéo xuất phát từ (PATH_RIGHT, chân gò).
 */
function edgeBelowMound(x: number, y: number): Vec2 {
  const minY = MOUND_BOTTOM_Y + Math.max(0, x - PATH_RIGHT) * EDGE_SLOPE;
  return vec2(x, Math.max(minY, y));
}

/** Đa giác lối đi: mép trái từ trên xuống, rồi mép phải từ dưới lên; mép gợn nhẹ. */
export function pathPolygon(): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const c = pathCenter(t);
    const tan = pathTangent(t);
    const len = Math.hypot(tan.x, tan.y) || 1;
    let nx = tan.y / len;
    let ny = -tan.x / len;
    // Mép trên (t = 0) nằm ngang dọc chân gò đất; từ đó hai mép đi xuôi theo
    // pháp tuyến thật của đường giữa, không bẻ ngang thành một mẩu
    if (i === 0) {
      nx = Math.sign(nx) || 1;
      ny = 0;
    }
    const half = pathWidth(t) / 2;
    // Gợn mép: đầu lối đi giữ thẳng để khớp bậc thềm
    const wobble = t < 0.05 ? 0 : 0.07;
    const hl = half * (1 + wobble * Math.sin(t * 17));
    const hr = half * (1 + wobble * Math.sin(t * 13 + 2));
    left.push(edgeBelowMound(c.x + nx * hl, c.y + ny * hl));
    right.push(edgeBelowMound(c.x - nx * hr, c.y - ny * hr));
  }
  // Mép phải (mảng left: phía pháp tuyến hướng lên-phải) là một đoạn thẳng từ
  // đầu hàng rào phải tới điểm mép cuối dưới khung hình, không cong gắt ở cuối
  const a = left[0];
  const b = left[SAMPLES];
  for (let i = 1; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    left[i] = vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  return [...left, ...right.reverse()];
}

/** Phiến đá phẳng: tâm, bán trục; đặt dọc đường giữa, lệch ngang theo seed. */
export function pathStones(seed = 1601): { x: number; y: number; rx: number; ry: number }[] {
  const rnd = createRng(seed);
  const stones: { x: number; y: number; rx: number; ry: number }[] = [];
  const count = 6;
  for (let k = 0; k < count; k++) {
    const t = 0.12 + (k / (count - 1)) * 0.8;
    const c = pathCenter(t);
    const width = pathWidth(t);
    const side = (k % 2 === 0 ? -1 : 1) * (0.12 + rnd() * 0.12) * width;
    // Càng gần tiền cảnh phiến đá càng to (phối cảnh)
    const rx = (10 + 16 * t) * (0.85 + rnd() * 0.3);
    stones.push({ x: c.x + side, y: c.y + (rnd() - 0.5) * 6, rx, ry: rx * 0.42 });
  }
  return stones;
}

export class GardenPath implements SceneObject {
  readonly id = 'path';
  readonly name = 'Lối đi';
  readonly description = 'Lối đi đất lát vài phiến đá, từ bậc thềm nhà nấm xuống tiền cảnh.';
  readonly algorithms: readonly string[] = [
    'Đường cong Bézier bậc 3 (đường giữa lối đi)',
    'Scanline polygon fill (thân lối đi)',
    'Midpoint ellipse (phiến đá)',
    'RNG seed cố định (vị trí phiến đá)',
  ];
  readonly layer = Layer.PATH;
  readonly interactive = false;

  private readonly polygon = pathPolygon();
  private readonly stones = pathStones();

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    r.shape(r.mask().polygon(this.polygon), {
      fill: p.pathStone,
      shade: p.pathStoneDark,
      highlight: lerpColor(p.pathStone, p.mushroomSpot, 0.4),
      outline: p.ink,
      outlineWidth: 2,
    });
    const stones = r.mask();
    for (const s of this.stones) stones.ellipse(s.x, s.y, s.rx, s.ry);
    r.shape(stones, {
      fill: lerpColor(p.pathStoneDark, p.stone, 0.35),
      shade: lerpColor(p.pathStoneDark, p.ink, 0.25),
      highlight: lerpColor(p.stone, p.mushroomSpot, 0.3),
      outline: p.inkSoft,
      outlineWidth: 1,
    });
  }
}
