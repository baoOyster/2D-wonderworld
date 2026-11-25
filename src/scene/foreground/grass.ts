/**
 * Cỏ tiền cảnh (#17): các khóm cỏ mọc rải rác khắp bãi cỏ và vài bụi quanh gốc cây.
 *
 * Thuật toán dùng:
 * - Scanline polygon fill: từng lá cỏ (đa giác thon nhọn dọc Bézier bậc 2).
 * - Bresenham: viền lá cỏ.
 * - Quay quanh gốc bằng Node/mat3: lá cỏ gom thành từng khóm, mỗi khóm một
 *   `Node` có pha lay riêng.
 *
 * Khóm ở xa (gần chân trời) nhỏ và tối, khóm ở gần to và sáng hơn để tạo
 * chiều sâu. Khóm vẽ theo y tăng dần nên khóm gần đè lên khóm xa.
 */
import { lerpColor } from '../../core/color.ts';
import { mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Palette } from '../../core/palette.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';
import { SWAY_SPEED, generateFlowers } from './flowers.ts';
import { RESERVED_RIGHT_X, isFreeGround } from './ground.ts';

/** Số khóm rải trên bãi cỏ và số lá mỗi khóm. */
export const SCATTERED_TUFTS = 52;
const BLADES_PER_TUFT = 6;

/** Một lá cỏ (toạ độ cục bộ theo gốc khóm). */
export interface Blade {
  /** Gốc lá, cục bộ theo khóm. */
  readonly root: Vec2;
  readonly height: number;
  /** Lệch ngang của ngọn. */
  readonly bend: number;
  /** Bề rộng chân lá. */
  readonly width: number;
  /** Tông màu (0 tối … 1 sáng). */
  readonly tone: number;
}

/** Một khóm cỏ: gốc world, pha lay, các lá. */
export interface Tuft {
  readonly base: Vec2;
  readonly phase: number;
  readonly sway: number;
  readonly blades: readonly Blade[];
}

/** Bụi cỏ quanh chân cây cổ thụ (gốc world). */
export const ROOT_TUFTS: readonly Vec2[] = [vec2(28, 503), vec2(96, 506), vec2(168, 504), vec2(246, 500)];

/** Hệ số kích thước theo độ sâu: 0.55 ở chân trời, 1.2 ở mép dưới khung hình. */
export function depthScale(y: number): number {
  return 0.55 + 0.65 * Math.max(0, Math.min(1, (y - 470) / 250));
}

/**
 * Sinh các khóm cỏ: rải trên lưới ô có lệch ngẫu nhiên (jittered grid) để khắp
 * bãi đều có cỏ mà không thẳng hàng, bỏ ô rơi vào lối đi/gò đất/rễ; cộng các bụi
 * quanh gốc cây. Sắp theo y. Tổng 250–350 lá.
 */
export function generateGrass(seed = 1702): Tuft[] {
  const rnd = createRng(seed);
  const range = (a: number, b: number): number => a + (b - a) * rnd();
  const tufts: Tuft[] = [];
  const fan = (count: number, scale: number, tall: number): Blade[] => {
    const blades: Blade[] = [];
    for (let k = 0; k < count; k++) {
      const s = (k / (count - 1)) * 2 - 1;
      blades.push({
        root: vec2(s * 6 * scale + range(-1.5, 1.5), range(0, 1.5)),
        height: range(0.75, 1) * tall * scale * (1 - 0.3 * Math.abs(s)),
        bend: (s * range(5, 10) + range(-2, 2)) * scale,
        width: range(5.5, 7.5) * scale,
        tone: range(0, 1),
      });
    }
    return blades;
  };

  const flowers = generateFlowers();

  // Lưới 10 hàng × 14 cột trên phần đất trái (x 0…700, y 480…715); thử ô theo
  // thứ tự ngẫu nhiên
  const rows = 10, cols = 14;
  const cells: number[] = [];
  for (let i = 0; i < rows * cols; i++) cells.push(i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  for (const cell of cells) {
    if (tufts.length >= SCATTERED_TUFTS) break;
    const row = Math.floor(cell / cols), col = cell % cols;
    const x = ((col + range(0.15, 0.85)) * RESERVED_RIGHT_X) / cols;
    const y = 480 + ((row + range(0.15, 0.85)) * 235) / rows;
    if (!isFreeGround(x, y, 10)) continue;
    // Hoa và cỏ vẽ theo độ sâu (y gốc), nên khóm nằm sau bông không che được
    // bông. Chỉ cần tránh khóm mọc ngay trước bông mà cao tới đầu hoa; che
    // chân thân thì được, trông như hoa mọc trong cỏ
    const sc0 = depthScale(y);
    const tx0 = x - 22 * sc0, tx1 = x + 22 * sc0, ty0 = y - 34 * sc0, ty1 = y + 3;
    if (flowers.some((f) => {
      const fx0 = f.base.x + f.lean - f.size - 3;
      const fx1 = f.base.x + f.lean + f.size + 3;
      const fy0 = f.base.y - f.height - f.size - 3;
      const fy1 = f.base.y - f.height + f.size + 3;
      return y > f.base.y && tx0 < fx1 && tx1 > fx0 && ty0 < fy1 && ty1 > fy0;
    })) continue;
    const sc = depthScale(y);
    tufts.push({ base: vec2(x, y), phase: range(0, Math.PI * 2), sway: range(0.02, 0.04), blades: fan(BLADES_PER_TUFT, sc, 30) });
  }

  // Bụi quanh gốc cây: lá ngắn
  for (const b of ROOT_TUFTS) {
    tufts.push({ base: b, phase: range(0, Math.PI * 2), sway: range(0.02, 0.035), blades: fan(7, 0.75, 22) });
  }
  return tufts.sort((a, b) => a.base.y - b.base.y);
}

/** Đa giác lá cỏ cục bộ: thon dần từ chân tới ngọn dọc Bézier bậc 2. */
export function bladePolygon(b: Blade, samples = 4): Vec2[] {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const p0 = b.root;
  const p1 = vec2(b.root.x + b.bend * 0.2, b.root.y - b.height * 0.55);
  const p2 = vec2(b.root.x + b.bend, b.root.y - b.height);
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
    const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
    const half = (b.width / 2) * (1 - t);
    left.push(vec2(x - half, y));
    right.push(vec2(x + half, y));
  }
  return [...left, p2, ...right.reverse()];
}

export class Grass implements SceneObject {
  readonly id = 'grass';
  readonly name = 'Cỏ';
  readonly description = 'Các khóm cỏ mọc rải rác trên bãi cỏ, lay nhẹ theo gió.';
  readonly algorithms: readonly string[] = [
    'Scanline polygon fill (lá cỏ)',
    'Bresenham (viền lá)',
    'Quay quanh gốc bằng Node/mat3 (lay theo khóm)',
  ];
  readonly layer = Layer.GRASS;
  readonly interactive = false;

  readonly tufts: readonly Tuft[];
  readonly nodes: readonly Node[];
  private readonly polys: readonly Vec2[][][];

  constructor(seed = 1702) {
    this.tufts = generateGrass(seed);
    this.nodes = this.tufts.map((t) => {
      const n = new Node();
      n.transform.x = t.base.x;
      n.transform.y = t.base.y;
      return n;
    });
    this.polys = this.tufts.map((t) => t.blades.map((b) => bladePolygon(b)));
  }

  /** Tổng số lá cỏ. */
  get bladeCount(): number {
    return this.tufts.reduce((s, t) => s + t.blades.length, 0);
  }

  update(env: Env): void {
    for (let i = 0; i < this.tufts.length; i++) {
      const t = this.tufts[i];
      this.nodes[i].transform.rotation = t.sway * Math.sin(env.time * SWAY_SPEED + t.phase);
    }
  }

  draw(r: Renderer, env: Env): void {
    this.update(env);
    for (let i = 0; i < this.tufts.length; i++) this.drawTuft(r, env.palette, i);
  }

  /** Vẽ một khóm (đã cập nhật góc lay); dùng cho vẽ xen kẽ theo độ sâu. */
  drawTuft(r: Renderer, p: Palette, i: number): void {
    const tuft = this.tufts[i];
    const m = this.nodes[i].worldMatrix();
    // Bóng nhỏ dưới khóm giúp khóm "cắm" xuống đất
    const sc = depthScale(tuft.base.y);
    r.ellipse(tuft.base.x, tuft.base.y + 1, 11 * sc, 2.5 * sc, p.shadow, true);
    // Khóm xa tối, khóm gần sáng
    const near = (sc - 0.55) / 0.65;
    const dark = lerpColor(p.groundDark, p.leaf, 0.55);
    const lo = lerpColor(dark, p.leaf, near);
    const hi = lerpColor(p.leaf, p.canopyLight, near);
    for (let k = 0; k < tuft.blades.length; k++) {
      const pts = this.polys[i][k].map((v) => mat3Apply(m, v));
      r.polygon(pts, lerpColor(lo, hi, tuft.blades[k].tone), true);
      r.polygon(pts, p.ink, false);
    }
  }
}
