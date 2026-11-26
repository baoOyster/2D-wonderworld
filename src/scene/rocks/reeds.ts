/**
 * Bụi lau sậy (lá dài xoè ra) ven hồ (#20) và phản ứng theo con trỏ.
 *
 * Góp ý 25/11: thân thẳng + bông tròn ở bản đầu đọc ra như tre hoặc nấm, không
 * giống ảnh mẫu — nên đổi thành **bụi lá thon nhọn xoè ra** như `B5_ho_da.jpg`.
 *
 * Thuật toán dùng:
 * - **Scanline polygon fill**: mỗi lá là một đa giác thon nhọn dọc Bézier bậc 2
 *   (`bladePolygon` của `grass.ts` — cùng một quy ước lá với lớp cỏ #17).
 * - **Bresenham**: viền lá.
 * - **Biến đổi gộp (Node)**: mỗi lá một `Node` đặt tại gốc lá, lay bằng `R(θ)`
 *   quanh gốc — gốc đứng yên, chỉ ngọn đung đưa.
 * - **Lò xo tắt dần (spring–damper)**: `θ` tiến về góc mục tiêu bằng
 *   `ω' = k·(θ* − θ) − c·ω`, tích phân 2 bước nhỏ mỗi khung. Góc mục tiêu là lay
 *   theo gió, cộng thêm độ ngả về phía con trỏ khi con trỏ ở trong bán kính ảnh
 *   hưởng (`env.pointer`). Khi con trỏ đi chỗ khác, mục tiêu trở lại lay theo
 *   gió nên bụi sậy **lay tắt dần rồi về trạng thái cũ**, không lệch vĩnh viễn.
 *
 * Toạ độ world 1280×720. Hai bụi ở bờ trái và bờ phải hồ; hình học sinh một lần
 * bằng RNG có seed.
 */
import { lerpColor } from '../../core/color.ts';
import { mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { bladePolygon, type Blade } from '../foreground/grass.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';

/** Tần số góc của lay theo gió (rad/s). */
export const REED_SWAY_SPEED = 1.15;

/** Bán kính ảnh hưởng của con trỏ (world px). */
export const HOVER_RADIUS = 170;

/** Góc ngả tối đa khi con trỏ nằm sát gốc lá (rad ≈ 29°). */
export const HOVER_MAX_LEAN = 0.5;

/** Độ cứng lò xo (rad/s2 trên rad) và hệ số cản (1/s); cản nhỏ hơn 2·√k nên có dao động tắt dần. */
export const REED_STIFFNESS = 42;
export const REED_DAMPING = 4.2;

/** Số mẫu dọc mỗi lá (đa giác thon nhọn). */
const BLADE_SAMPLES = 5;

/** Một lá sậy: hình lá cục bộ + gốc world + pha lay riêng. */
export interface ReedBlade extends Blade {
  /** Gốc lá, toạ độ world (điểm Node quay quanh). */
  readonly base: Vec2;
  readonly phase: number;
  /** Biên độ lay (rad). */
  readonly sway: number;
}

/** Một bụi sậy: gốc bụi và các lá (toạ độ world). */
export interface ReedCluster {
  readonly base: Vec2;
  readonly blades: readonly ReedBlade[];
}

/** Vị trí và số lá của hai bụi: bờ trái và bờ phải hồ. */
export const REED_CLUSTERS: readonly { readonly base: Vec2; readonly count: number; readonly seed: number }[] = [
  { base: vec2(742, 612), count: 10, seed: 2101 },
  { base: vec2(1248, 556), count: 9, seed: 2102 },
];

/**
 * Sinh hai bụi sậy từ seed: lá cao 45–85 px xoè thành quạt (lá ngoài nghiêng và
 * ngắn hơn lá giữa), chân lá rộng 6–9 px thon dần tới ngọn nhọn, màu lệch nhau
 * để bụi không thành một khối phẳng.
 */
export function generateClusters(
  specs: readonly { readonly base: Vec2; readonly count: number; readonly seed: number }[] = REED_CLUSTERS,
): ReedCluster[] {
  return specs.map((spec) => {
    const rnd = createRng(spec.seed);
    const range = (a: number, b: number): number => a + (b - a) * rnd();
    const blades: ReedBlade[] = [];
    for (let i = 0; i < spec.count; i++) {
      // s ∈ [−1, 1]: lá ngoài cùng của quạt
      const s = spec.count === 1 ? 0 : (i / (spec.count - 1)) * 2 - 1;
      const height = range(0.85, 1) * 100 * (1 - 0.3 * Math.abs(s));
      const blade: ReedBlade = {
        root: vec2(0, 0),
        base: vec2(spec.base.x + range(-11, 11), spec.base.y + range(-7, 7)),
        height,
        bend: s * range(18, 28) + range(-5, 5),
        width: range(7, 10),
        tone: range(0, 1),
        phase: range(0, Math.PI * 2),
        sway: range(0.02, 0.055),
      };
      blades.push(blade);
    }
    // Lá gần (gốc thấp hơn trong hình) vẽ sau, đè lên lá xa.
    blades.sort((a, b) => a.base.y - b.base.y);
    return { base: spec.base, blades };
  });
}

/** Hai bụi lau sậy ở bờ hồ (layer `ROCK`, vẽ sau đá và sỏi trong cùng module). */
export class Reeds implements SceneObject {
  readonly id = 'reeds';
  readonly name = 'Lau sậy';
  readonly description = 'Hai bụi lá dài xoè ra ở bờ hồ, lay theo gió; rê chuột qua thì ngả theo con trỏ rồi lay tắt dần.';
  readonly algorithms: readonly string[] = [
    'Scanline polygon fill (lá thon nhọn dọc Bézier bậc 2)',
    'Bresenham (viền lá)',
    'Biến đổi gộp: mỗi lá một Node, quay quanh gốc',
    'Lò xo tắt dần: ngả theo `env.pointer` rồi trở về trạng thái cũ',
    'Alpha blending (bóng gốc bụi)',
  ];
  readonly layer = Layer.ROCK;
  readonly interactive = false;

  readonly clusters: readonly ReedCluster[];
  /** Mọi lá của cả hai bụi, đã sắp theo độ sâu. */
  readonly blades: readonly ReedBlade[];
  /** Node của từng lá (quay quanh gốc lá). */
  readonly nodes: readonly Node[];
  /** Đa giác lá cục bộ (cùng thứ tự với `blades`). */
  private readonly polys: readonly Vec2[][];
  /** Góc và vận tốc góc hiện tại của từng lá (rad, rad/s). */
  private readonly angles: number[];
  private readonly velocities: number[];

  constructor(specs = REED_CLUSTERS) {
    this.clusters = generateClusters(specs);
    this.blades = this.clusters.flatMap((c) => c.blades);
    this.nodes = this.blades.map((blade) => {
      const node = new Node();
      node.transform.x = blade.base.x;
      node.transform.y = blade.base.y;
      return node;
    });
    this.polys = this.blades.map((blade) => bladePolygon(blade, BLADE_SAMPLES));
    this.angles = this.blades.map(() => 0);
    this.velocities = this.blades.map(() => 0);
  }

  /** Góc nghiêng hiện tại của lá `i` (rad) — dùng cho test và debug. */
  angleOf(i: number): number {
    return this.angles[i];
  }

  update(env: Env): void {
    const dt = Math.min(Math.max(env.dt, 0), 1 / 30);
    const pointer = env.pointer ?? null;
    // Hai bước nhỏ mỗi khung cho lò xo ổn định ở mọi dt.
    const steps = 2;
    const h = dt / steps;
    for (let i = 0; i < this.blades.length; i++) {
      const blade = this.blades[i];
      let target = blade.sway * Math.sin(env.time * REED_SWAY_SPEED + blade.phase);
      if (pointer) {
        const dx = pointer.x - blade.base.x;
        const dy = pointer.y - blade.base.y;
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
    // Bóng gốc bụi: elip alpha thấp, giúp bụi "cắm" xuống đất/nước.
    for (const cluster of this.clusters) {
      r.ellipse(cluster.base.x, cluster.base.y + 1, 17, 4, p.shadow, true);
    }
    const lo = lerpColor(p.stem, p.leaf, 0.35);
    const hi = lerpColor(p.leaf, p.canopyLight, 0.5);
    for (let i = 0; i < this.blades.length; i++) {
      const matrix = this.nodes[i].worldMatrix();
      const points = this.polys[i].map((v) => mat3Apply(matrix, v));
      r.polygon(points, lerpColor(lo, hi, this.blades[i].tone), true);
      r.polygon(points, p.ink, false);
    }
  }
}
