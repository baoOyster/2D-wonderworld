/**
 * Lau sậy ven hồ (#20) và phản ứng theo con trỏ.
 *
 * Thuật toán dùng:
 * - **Nét dày / DDA**: thân sậy là một cung bậc 2 lấy mẫu thành 4 đoạn; mỗi đoạn
 *   vẽ bằng nét dày (lớp `ink` mảnh bên ngoài, lõi `stem` bên trong).
 * - **Midpoint ellipse**: bông sậy là elip nghiêng theo phương tiếp tuyến của
 *   ngọn.
 * - **Biến đổi gộp (Node)**: mỗi thân là một `Node` đặt tại gốc, lay bằng
 *   `R(θ)` quanh gốc — gốc sậy đứng yên, chỉ ngọn đung đưa.
 * - **Lò xo tắt dần (spring–damper)**: `θ` tiến về góc mục tiêu bằng
 *   `ω' = k·(θ* − θ) − c·ω`, tích phân 2 bước nhỏ mỗi khung. Góc mục tiêu là lay
 *   theo gió, cộng thêm độ ngả về phía con trỏ khi con trỏ ở trong bán kính ảnh
 *   hưởng (`env.pointer`). Khi con trỏ đi chỗ khác, mục tiêu trở lại lay theo
 *   gió nên sậy **lay tắt dần rồi về trạng thái cũ**, không lệch vĩnh viễn.
 *
 * Toạ độ world 1280×720. Hai cụm đặt ở bờ trái và bờ phải hồ theo
 * `docs/reference/layout.md`; hình học sinh một lần bằng RNG có seed.
 */
import { lerpColor } from '../../core/color.ts';
import { ellipsePolygon, mat3Multiply, mat3Rotate, mat3Translate, transformPoints } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Renderer, WorldMask } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';

/** Tần số góc của lay theo gió (rad/s). */
export const REED_SWAY_SPEED = 1.15;

/** Bán kính ảnh hưởng của con trỏ (world px). */
export const HOVER_RADIUS = 170;

/** Góc ngả tối đa khi con trỏ nằm sát gốc sậy (rad ≈ 29°). */
export const HOVER_MAX_LEAN = 0.5;

/** Độ cứng lò xo (rad/s² trên rad) và hệ số cản (1/s); cản nhỏ hơn 2·√k nên có dao động tắt dần. */
export const REED_STIFFNESS = 42;
export const REED_DAMPING = 4.2;

/** Bông sậy: elip nghiêng ở ngọn. */
export interface ReedHead {
  readonly rx: number;
  readonly ry: number;
}

/** Một thân sậy. Toạ độ trong `curve` là cục bộ theo gốc thân. */
export interface ReedStem {
  /** Gốc thân, toạ độ world (điểm Node quay quanh). */
  readonly base: Vec2;
  readonly height: number;
  /** Lệch ngang của ngọn so với gốc. */
  readonly bend: number;
  /** Bề rộng thân (world px). */
  readonly width: number;
  readonly phase: number;
  /** Biên độ lay (rad). */
  readonly sway: number;
  readonly head?: ReedHead;
  /** Cung thân: các điểm từ gốc (0, 0) tới ngọn (bend, −height). */
  readonly curve: readonly Vec2[];
}

/** Một cụm sậy: gốc cụm và các thân (toạ độ world). */
export interface ReedCluster {
  readonly base: Vec2;
  readonly stems: readonly ReedStem[];
}

/** Vị trí và số thân của hai cụm: bờ trái và bờ phải hồ. */
export const REED_CLUSTERS: readonly { readonly base: Vec2; readonly count: number; readonly seed: number }[] = [
  { base: vec2(742, 612), count: 8, seed: 2101 },
  { base: vec2(1248, 556), count: 7, seed: 2102 },
];

/** Cung thân cục bộ: Bézier bậc 2 từ gốc lên ngọn, lấy 5 mẫu. */
export function stemCurve(height: number, bend: number, samples = 5): Vec2[] {
  const control = vec2(bend * 0.25, -height * 0.55);
  const tip = vec2(bend, -height);
  const points: Vec2[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const u = 1 - t;
    points.push(vec2(2 * u * t * control.x + t * t * tip.x, 2 * u * t * control.y + t * t * tip.y));
  }
  return points;
}

/** Sinh hai cụm sậy từ seed: cao 40–80 px, cong nhẹ, lay pha riêng, 2/3 thân có bông. */
export function generateClusters(
  specs: readonly { readonly base: Vec2; readonly count: number; readonly seed: number }[] = REED_CLUSTERS,
): ReedCluster[] {
  return specs.map((spec) => {
    const rnd = createRng(spec.seed);
    const range = (a: number, b: number): number => a + (b - a) * rnd();
    const stems: ReedStem[] = [];
    for (let i = 0; i < spec.count; i++) {
      const height = range(40, 80);
      const bend = range(4, 14) * (rnd() < 0.5 ? -1 : 1);
      const stem: ReedStem = {
        base: vec2(spec.base.x + range(-22, 22), spec.base.y + range(-18, 18)),
        height,
        bend,
        width: range(1.6, 2.4),
        phase: range(0, Math.PI * 2),
        sway: range(0.02, 0.055),
        head: rnd() < 0.66 ? { rx: range(2.4, 3.4), ry: range(6, 9) } : undefined,
        curve: stemCurve(height, bend),
      };
      stems.push(stem);
    }
    // Thân gần (gốc thấp hơn trong hình) vẽ sau, đè lên thân xa.
    stems.sort((a, b) => a.base.y - b.base.y);
    return { base: spec.base, stems };
  });
}

/** Góc nghiêng của phương tiếp tuyến tại ngọn thân (rad). */
export function tipAngle(stem: ReedStem): number {
  const last = stem.curve[stem.curve.length - 1];
  const prev = stem.curve[stem.curve.length - 2];
  return Math.atan2(last.y - prev.y, last.x - prev.x);
}

/** Hai cụm lau sậy ở bờ hồ (layer `ROCK`, vẽ sau đá và sỏi trong cùng module). */
export class Reeds implements SceneObject {
  readonly id = 'reeds';
  readonly name = 'Lau sậy';
  readonly description = 'Hai cụm lau sậy bên bờ hồ, lay theo gió; rê chuột qua thì ngả theo con trỏ rồi lay tắt dần.';
  readonly algorithms: readonly string[] = [
    'Nét dày / DDA (thân sậy cong)',
    'Midpoint ellipse (bông sậy)',
    'Biến đổi gộp: mỗi thân một Node, quay quanh gốc',
    'Lò xo tắt dần: ngả theo `env.pointer` rồi trở về trạng thái cũ',
    'Alpha blending (bóng gốc sậy)',
  ];
  readonly layer = Layer.ROCK;
  readonly interactive = false;

  readonly clusters: readonly ReedCluster[];
  /** Mọi thân của cả hai cụm, đã sắp theo độ sâu. */
  readonly stems: readonly ReedStem[];
  /** Node của từng thân (quay quanh gốc thân). */
  readonly nodes: readonly Node[];
  /** Góc và vận tốc góc hiện tại của từng thân (rad, rad/s). */
  private readonly angles: number[];
  private readonly velocities: number[];

  constructor(specs = REED_CLUSTERS) {
    this.clusters = generateClusters(specs);
    this.stems = this.clusters.flatMap((c) => c.stems);
    this.nodes = this.stems.map((stem) => {
      const node = new Node();
      node.transform.x = stem.base.x;
      node.transform.y = stem.base.y;
      return node;
    });
    this.angles = this.stems.map(() => 0);
    this.velocities = this.stems.map(() => 0);
  }

  /** Góc nghiêng hiện tại của thân `i` (rad) — dùng cho test và debug. */
  angleOf(i: number): number {
    return this.angles[i];
  }

  update(env: Env): void {
    const dt = Math.min(Math.max(env.dt, 0), 1 / 30);
    const pointer = env.pointer ?? null;
    // Hai bước nhỏ mỗi khung cho lò xo ổn định ở mọi dt.
    const steps = 2;
    const h = dt / steps;
    for (let i = 0; i < this.stems.length; i++) {
      const stem = this.stems[i];
      let target = stem.sway * Math.sin(env.time * REED_SWAY_SPEED + stem.phase);
      if (pointer) {
        const dx = pointer.x - stem.base.x;
        const dy = pointer.y - stem.base.y;
        const distance = Math.hypot(dx, dy);
        if (distance < HOVER_RADIUS) {
          // Càng gần gốc càng ngả nhiều; hướng ngả = hướng từ gốc tới con trỏ.
          const falloff = 1 - distance / HOVER_RADIUS;
          const lean = Math.atan2(dx, Math.max(1, -dy));
          const scale = Math.max(-1, Math.min(1, lean));
          target += scale * HOVER_MAX_LEAN * falloff * falloff;
        }
      }
      let angle = this.angles[i];
      let velocity = this.velocities[i];
      for (let k = 0; k < steps; k++) {
        velocity += (REED_STIFFNESS * (target - angle) - REED_DAMPING * velocity) * h;
        angle += velocity * h;
      }
      this.angles[i] = angle;
      this.velocities[i] = velocity;
      this.nodes[i].transform.rotation = angle;
    }
  }

  draw(r: Renderer, env: Env): void {
    this.update(env);
    const p = env.palette;
    // Bóng gốc: elip alpha thấp dưới chân mỗi thân.
    for (const stem of this.stems) {
      r.ellipse(stem.base.x + 1, stem.base.y + 1, stem.width * 2.6, stem.width * 1.2, p.shadow, true);
    }
    const headMasks: WorldMask[] = [];
    for (let i = 0; i < this.stems.length; i++) {
      const stem = this.stems[i];
      const matrix = this.nodes[i].worldMatrix();
      const points = transformPoints(matrix, stem.curve);
      // Nét dày: viền `ink` mảnh rồi lõi `stem`; đoạn cuối dùng DDA.
      for (let k = 1; k < points.length; k++) {
        const a = points[k - 1];
        const b = points[k];
        r.line(a.x, a.y, b.x, b.y, p.ink, stem.width + 1.2, 'dda');
        r.line(a.x, a.y, b.x, b.y, lerpColor(p.stem, p.canopyLight, 0.25), stem.width, 'dda');
      }
      if (stem.head) {
        const local = mat3Multiply(mat3Translate(stem.bend, -stem.height), mat3Rotate(tipAngle(stem)));
        const mask = r.mask();
        mask.polygon(transformPoints(mat3Multiply(matrix, local), ellipsePolygon(0, 0, stem.head.rx, stem.head.ry, 12)));
        headMasks.push(mask);
      }
    }
    // Bông sậy vẽ sau thân: gộp mỗi bông một mask, tô 3 tông + viền `inkSoft`.
    for (const mask of headMasks) {
      r.shape(mask, {
        fill: lerpColor(p.pathStoneDark, p.mushroomStem, 0.3),
        shade: p.pathStoneDark,
        highlight: lerpColor(p.pathStoneDark, p.mushroomStem, 0.6),
        outline: p.inkSoft,
        outlineWidth: 1,
      });
    }
  }
}
