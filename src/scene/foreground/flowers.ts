/**
 * Hoa nhiều màu tiền cảnh (#17): cụm trái, cụm phải và vài bông lẻ ven lối đi.
 *
 * Thuật toán dùng:
 * - Midpoint circle: mỗi cánh hoa là một hình tròn (tô + viền), xếp quanh nhụy.
 * - Nét dày / Bresenham: thân hoa là đường cong gấp khúc (polyline) có viền.
 * - Scanline polygon fill: lá là elip xoay (đa giác).
 * - Biến đổi quay quanh gốc: mỗi bông là một `Node`, góc lay
 *   `sin(time * 1.2 + phase)`; pha riêng từng bông để không "cả vườn gật đầu".
 *
 * Màu cánh: 8 màu suy ra từ palette (xem `petalColor`).
 *
 * Toạ độ world 1280×720. Hình học sinh bằng RNG seed cố định, lưu sẵn trong
 * constructor; `draw` chỉ đọc lại.
 */
import { lerpColor, pack, unpack, type RGBA } from '../../core/color.ts';
import { mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Palette } from '../../core/palette.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import { ROOT_ZONE, isFreeGround } from './ground.ts';
import type { Env, SceneObject } from '../types.ts';

/**
 * Màu cánh: 4 màu hoa của palette và 4 màu pha từ chúng (cam, hồng, hồng tím,
 * trắng kem); mọi màu đều suy ra từ palette rồi tăng độ bão hoà cho rực rỡ.
 */
export type PetalColor = 'red' | 'orange' | 'yellow' | 'pink' | 'magenta' | 'purple' | 'blue' | 'white';
export const PETAL_COLORS: readonly PetalColor[] = ['red', 'orange', 'yellow', 'pink', 'magenta', 'purple', 'blue', 'white'];

/** Tăng độ bão hoà: kéo từng kênh ra xa mức xám trung bình theo hệ số k. */
export function saturate(c: RGBA, k: number): RGBA {
  const { r, g, b, a } = unpack(c);
  const l = (r + g + b) / 3;
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(l + (v - l) * k)));
  return pack(f(r), f(g), f(b), a);
}

/** Màu cánh theo palette hiện tại; ban ngày bão hoà mạnh hơn ban đêm. */
export function petalColor(p: Palette, c: PetalColor, dayPhase = 0): RGBA {
  const base: Record<PetalColor, RGBA> = {
    red: p.flowerRed,
    orange: lerpColor(p.flowerRed, p.flowerYellow, 0.5),
    yellow: p.flowerYellow,
    pink: lerpColor(p.flowerRed, p.mushroomSpot, 0.35),
    magenta: lerpColor(p.flowerRed, p.flowerPurple, 0.5),
    purple: p.flowerPurple,
    blue: p.flowerBlue,
    white: p.mushroomSpot,
  };
  return c === 'white' ? base.white : saturate(base[c], 1.45 - 0.3 * dayPhase);
}

/** Một bông hoa: gốc thân, chiều cao thân, bán kính bông, số cánh, màu, pha lay. */
export interface FlowerSpec {
  readonly base: Vec2;
  readonly height: number;
  /** Bán kính cả bông (từ nhụy tới mép cánh), 8–18 world px. */
  readonly size: number;
  readonly petals: 5 | 6;
  readonly color: PetalColor;
  /** Độ nghiêng ngọn thân (lệch x của bông so với gốc). */
  readonly lean: number;
  /** Góc xoay vòng cánh. */
  readonly spin: number;
  /** Pha lay riêng. */
  readonly phase: number;
  /** Biên độ lay (rad), 0.02–0.04. */
  readonly sway: number;
  /** Lá: 1 hoặc 2; mỗi lá có độ cao trên thân (0..1) và hướng (−1 trái, 1 phải). */
  readonly leaves: readonly { readonly at: number; readonly side: -1 | 1 }[];
}

/**
 * Cụm hoa theo docs/reference/layout.md: [x0, x1, y0, y1, số bông]. Cụm phải
 * (x 815…870, y 645…675, ven hồ) tạm bỏ để chừa đất cho hồ/suối và cầu.
 */
export const FLOWER_CLUSTERS: readonly { x0: number; x1: number; y0: number; y1: number; count: number }[] = [
  { x0: 165, x1: 275, y0: 570, y1: 605, count: 9 },
];

/** Bông lẻ ven mép trái lối đi (gốc thân); bên phải lối đi chừa cho hồ/suối và cầu. */
export const PATH_SIDE_FLOWERS: readonly Vec2[] = [vec2(482, 612), vec2(470, 664), vec2(446, 566), vec2(528, 704)];

/** Số bông mọc rải rác trên bãi cỏ (ngoài các cụm). */
export const SCATTERED_FLOWERS = 16;

/** Tần số góc của lay (rad/s). */
export const SWAY_SPEED = 1.2;

/** Sinh danh sách hoa từ seed; sắp theo y gốc để bông gần vẽ sau. */
export function generateFlowers(seed = 1701): FlowerSpec[] {
  const rnd = createRng(seed);
  const range = (a: number, b: number): number => a + (b - a) * rnd();
  const bases: Vec2[] = [];
  for (const c of FLOWER_CLUSTERS) {
    // Rải đều theo x (chia ô) rồi lệch ngẫu nhiên trong ô, tránh chồng bông
    for (let i = 0; i < c.count; i++) {
      const cell = (c.x1 - c.x0) / c.count;
      bases.push(vec2(c.x0 + cell * (i + 0.15 + 0.7 * rnd()), range(c.y0, c.y1)));
    }
  }
  bases.push(...PATH_SIDE_FLOWERS);
  // Rải thêm bông lẻ trên cỏ trống, cách các bông khác ít nhất 34px
  let placed = 0;
  for (let tries = 0; placed < SCATTERED_FLOWERS && tries < 2000; tries++) {
    const x = range(20, 700);
    const y = range(520, 690);
    if (!isFreeGround(x, y, 14)) continue;
    // Trước bộ rễ: bông phải đủ thấp để cả bông (cao ~60px) nằm dưới rễ và bụi
    // cỏ chân rễ, không bị che
    if (x < ROOT_ZONE.x1 + 10 && y - 60 < ROOT_ZONE.y1) continue;
    if (bases.some((b) => Math.hypot(b.x - x, b.y - y) < 34)) continue;
    bases.push(vec2(x, y));
    placed++;
  }
  const flowers: FlowerSpec[] = bases.map((base, i) => {
    const size = Math.round(range(8, 18));
    const leafCount = rnd() < 0.5 ? 1 : 2;
    const side: -1 | 1 = rnd() < 0.5 ? -1 : 1;
    const leaves = leafCount === 1
      ? [{ at: range(0.25, 0.45), side }]
      : [{ at: range(0.2, 0.35), side }, { at: range(0.4, 0.55), side: (-side) as -1 | 1 }];
    return {
      base,
      height: range(22, 42) + size * 0.6,
      size,
      petals: rnd() < 0.5 ? 5 : 6,
      // Xoay vòng màu để 4 màu đều có mặt, rồi trộn nhẹ
      color: PETAL_COLORS[(i * 3 + Math.floor(rnd() * 2)) % PETAL_COLORS.length],
      lean: range(-6, 6),
      spin: range(0, Math.PI),
      phase: range(0, Math.PI * 2),
      sway: range(0.02, 0.04),
      leaves,
    };
  });
  return flowers.sort((a, b) => a.base.y - b.base.y);
}

/** Thân hoa cục bộ (gốc tại 0,0, hướng lên): Bézier bậc 2 lấy mẫu thành polyline. */
export function stemLocal(f: FlowerSpec, samples = 6): Vec2[] {
  const pts: Vec2[] = [];
  const cx = f.lean * 0.2;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    // P0 = (0,0), P1 = (cx, -h/2), P2 = (lean, -h)
    pts.push(vec2(2 * u * t * cx + t * t * f.lean, -(2 * u * t * (f.height / 2) + t * t * f.height)));
  }
  return pts;
}

/** Tâm và bán kính từng cánh (cục bộ, quanh ngọn thân). */
export function petalCircles(f: FlowerSpec): { c: Vec2; r: number }[] {
  const head = vec2(f.lean, -f.height);
  const r = f.size * (f.petals === 5 ? 0.46 : 0.42);
  const d = f.size - r;
  const out: { c: Vec2; r: number }[] = [];
  for (let k = 0; k < f.petals; k++) {
    const a = f.spin + (k * Math.PI * 2) / f.petals;
    out.push({ c: vec2(head.x + Math.cos(a) * d, head.y + Math.sin(a) * d), r });
  }
  return out;
}

/** Lá cục bộ: elip xoay, gốc lá nằm trên thân. */
export function leafPolygon(f: FlowerSpec, leaf: { at: number; side: -1 | 1 }, n = 12): Vec2[] {
  const stem = stemLocal(f);
  const idx = Math.min(stem.length - 1, Math.round(leaf.at * (stem.length - 1)));
  const root = stem[idx];
  const len = 7 + f.size * 0.45;
  const w = len * 0.36;
  // Lá chĩa chéo lên, ra phía `side`
  const ang = leaf.side > 0 ? -0.55 : Math.PI + 0.55;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const cx = root.x + ca * len * 0.5;
  const cy = root.y + sa * len * 0.5;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * len * 0.5;
    const ey = Math.sin(t) * w * 0.5;
    pts.push(vec2(cx + ex * ca - ey * sa, cy + ex * sa + ey * ca));
  }
  return pts;
}

export class Flowers implements SceneObject {
  readonly id = 'flowers';
  readonly name = 'Hoa';
  readonly description = 'Các cụm hoa nhiều màu ở tiền cảnh, lay nhẹ theo gió.';
  readonly algorithms: readonly string[] = [
    'Midpoint circle (cánh hoa, nhụy)',
    'Nét dày / Bresenham (thân hoa)',
    'Scanline polygon fill (lá)',
    'Quay quanh gốc bằng Node/mat3 (lay)',
  ];
  readonly layer = Layer.FLOWER;
  readonly interactive = false;

  readonly specs: readonly FlowerSpec[];
  /** Mỗi bông một Node: translate tới gốc, rotation = góc lay. */
  readonly nodes: readonly Node[];
  /** Hình học cục bộ lưu sẵn. */
  private readonly geo: readonly {
    stem: Vec2[];
    petals: { c: Vec2; r: number }[];
    leaves: Vec2[][];
  }[];

  constructor(seed = 1701) {
    this.specs = generateFlowers(seed);
    this.nodes = this.specs.map((f) => {
      const n = new Node();
      n.transform.x = f.base.x;
      n.transform.y = f.base.y;
      return n;
    });
    this.geo = this.specs.map((f) => ({
      stem: stemLocal(f),
      petals: petalCircles(f),
      leaves: f.leaves.map((l) => leafPolygon(f, l)),
    }));
  }

  /** Góc lay của bông thứ i tại thời điểm `time`. */
  swayAngle(i: number, time: number): number {
    const f = this.specs[i];
    return f.sway * Math.sin(time * SWAY_SPEED + f.phase);
  }

  update(env: Env): void {
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i].transform.rotation = this.swayAngle(i, env.time);
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    for (let i = 0; i < this.specs.length; i++) {
      // Đảm bảo góc đúng cả khi chỉ gọi draw (demo, ảnh tĩnh)
      this.nodes[i].transform.rotation = this.swayAngle(i, env.time);
      this.drawFlower(r, p, i, env.dayPhase);
    }
  }

  /** Vẽ một bông (dùng cho vẽ xen kẽ với cỏ theo độ sâu). */
  drawFlower(r: Renderer, p: Palette, i: number, dayPhase: number): void {
    const f = this.specs[i];
    const g = this.geo[i];
    const m = this.nodes[i].worldMatrix();
    const tf = (v: Vec2): Vec2 => mat3Apply(m, v);

    // Bóng nhỏ dưới gốc
    r.ellipse(f.base.x, f.base.y + 1, 5 + f.size * 0.3, 2.2, p.shadow, true);

    // Lá: tô + viền
    for (const leaf of g.leaves) {
      const pts = leaf.map(tf);
      r.polygon(pts, p.leaf, true);
      r.polygon(pts, p.ink, false);
    }

    // Thân: viền ink dày rồi lõi màu stem
    const stem = g.stem.map(tf);
    r.polyline(stem, p.ink, 4);
    r.polyline(stem, p.stem, 2);

    // Cánh: midpoint circle tô + viền; điểm sáng nhỏ phía trên-phải
    const petal: RGBA = petalColor(p, f.color, dayPhase);
    const light = lerpColor(petal, p.mushroomSpot, 0.45);
    for (const c of g.petals) {
      const cc = tf(c.c);
      r.circle(cc.x, cc.y, c.r, petal, true);
      r.circle(cc.x, cc.y, c.r, p.ink, false);
    }
    for (const c of g.petals) {
      const cc = tf(c.c);
      r.circle(cc.x + c.r * 0.25, cc.y - c.r * 0.25, Math.max(1, c.r * 0.3), light, true);
    }

    // Nhụy
    const head = tf(vec2(f.lean, -f.height));
    const coreR = Math.max(2.5, f.size * 0.3);
    const core = f.color === 'yellow' || f.color === 'orange' ? lerpColor(p.flowerYellow, p.door, 0.6) : p.flowerYellow;
    r.circle(head.x, head.y, coreR, core, true);
    r.circle(head.x, head.y, coreR, p.ink, false);
  }
}
