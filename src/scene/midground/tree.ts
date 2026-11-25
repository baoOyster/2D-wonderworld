/**
 * Cây cổ thụ (#14): vật thể trung tâm, lệch trái, có tán đung đưa nhẹ.
 *
 * Thuật toán dùng:
 * - Thân + rễ + cành lớn: đa giác, tô bằng scanline fill (gộp chung một mask
 *   rồi tô 3 tông và viền một lần).
 * - Cành nhỏ: nét dày (thickLine) và Bresenham.
 * - Vân gỗ: Bresenham, màu `trunkDark`.
 * - Tán: mỗi cụm là hợp của 6 hình tròn Midpoint (kiểu súp lơ), tô 3 tông + viền.
 * - Hốc cây: vẽ viền đa giác rồi flood fill bên trong; ban đêm thêm quầng sáng alpha.
 * - Biến đổi gộp: Node gốc → Node tán (xoay quanh điểm gắn cành) → Node từng cụm.
 *
 * Toạ độ trong file là toạ độ world 1280×720 (xem docs/reference/layout.md).
 */
import { lerpColor, withAlpha, type RGBA } from '../../core/color.ts';
import { ellipsePolygon, mat3Apply, transformPoints, type Mat3 } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Palette } from '../../core/palette.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';

// ---------------------------------------------------------------------------
// Hợp đồng vẽ (tạm thời)
// ---------------------------------------------------------------------------

/**
 * Mask theo toạ độ world, mỗi lệnh thêm (hợp) một hình vào vùng.
 * Đây là phần con của `WorldMask` trong SPEC (#1 §3.6); phần B đổi sang kiểu
 * thật của `interface Renderer` (#8) khi #8/#34 merge.
 */
export interface TreeMask {
  polygon(pts: readonly Vec2[]): TreeMask;
  circle(cx: number, cy: number, r: number): TreeMask;
}

/** Kiểu tô một khối: nền, tông tối, tông sáng, viền (style guide). */
export interface ShapeStyle {
  fill: RGBA;
  shade?: RGBA;
  highlight?: RGBA;
  outline?: RGBA;
  outlineWidth?: number;
}

/** Các hàm của `Renderer` (SPEC #1 §3.6) mà cây cổ thụ cần. */
export interface TreeRenderer {
  line(x0: number, y0: number, x1: number, y1: number, color: RGBA, width?: number, alg?: 'dda' | 'bresenham'): void;
  polygon(pts: readonly Vec2[], color: RGBA, filled?: boolean): void;
  circle(cx: number, cy: number, r: number, color: RGBA, filled?: boolean): void;
  floodFill(x: number, y: number, color: RGBA): void;
  mask(): TreeMask;
  shape(m: TreeMask, style: ShapeStyle): void;
}

/** Phần con của `Env` (SPEC #1 §3.5) mà cây dùng. */
export interface TreeEnv {
  time: number;
  /** 0 = ngày, 1 = đêm. */
  dayPhase: number;
  palette: Palette;
}

// ---------------------------------------------------------------------------
// Hình học (đo từ layout.md và ảnh phác)
// ---------------------------------------------------------------------------

/** Gốc cây (Node gốc đặt ở đây). */
export const TREE_BASE: Vec2 = vec2(275, 470);

/** Điểm gắn cành lớn, tán xoay quanh điểm này. */
export const CROWN_PIVOT: Vec2 = vec2(300, 110);

/** Biên độ xoay của tán (rad) và tần số (rad/giây). */
export const SWAY_AMPLITUDE = 0.01;
export const SWAY_SPEED = 0.6;
/** Bước làm tròn góc lay (rad). */
export const SWAY_STEP = 0.0005;

/**
 * Thân: một đa giác đi theo chiều kim đồng hồ từ trên bên trái.
 * Thân hơi nghiêng, loe dần xuống gốc (x ≈ 160…365); phía trên chẻ thành
 * nhánh trái (đứng yên) và cành lớn bên phải (đung đưa), nên không có ngọn cụt.
 */
export const TRUNK: readonly Vec2[] = [
  vec2(214, 118), vec2(204, 170), vec2(200, 222), vec2(196, 272), vec2(191, 322),
  vec2(185, 372), vec2(174, 420), vec2(162, 460), vec2(172, 488), vec2(352, 488),
  vec2(362, 460), vec2(350, 420), vec2(339, 372), vec2(334, 322), vec2(329, 272),
  vec2(321, 222), vec2(314, 170), vec2(320, 118),
];

/**
 * Rễ bạnh: bắt đầu cao trên thân, uốn xuống rồi bám phẳng xuống đất ở y ≈ 500
 * (x = 40…475). Đầu rễ còn rộng 20–24 nên trông như cắm vào đất, không lơ lửng.
 */
export const ROOTS: readonly { path: readonly Vec2[]; widthStart: number; widthEnd: number }[] = [
  // Trái: 3 rễ bò lan, uốn lượn chồng lên nhau
  { path: [vec2(236, 380), vec2(192, 426), vec2(136, 462), vec2(76, 484), vec2(14, 498)], widthStart: 70, widthEnd: 20 },
  { path: [vec2(230, 418), vec2(182, 462), vec2(120, 492), vec2(58, 506)], widthStart: 60, widthEnd: 18 },
  { path: [vec2(242, 440), vec2(212, 474), vec2(168, 500), vec2(126, 510)], widthStart: 50, widthEnd: 16 },
  // Giữa
  { path: [vec2(262, 446), vec2(256, 476), vec2(246, 504)], widthStart: 44, widthEnd: 18 },
  { path: [vec2(268, 446), vec2(280, 478), vec2(292, 506)], widthStart: 40, widthEnd: 16 },
  // Phải: đối xứng với bên trái qua trục thân x = 262
  { path: [vec2(288, 380), vec2(332, 426), vec2(388, 462), vec2(448, 484), vec2(510, 498)], widthStart: 70, widthEnd: 20 },
  { path: [vec2(294, 418), vec2(342, 462), vec2(404, 492), vec2(466, 506)], widthStart: 60, widthEnd: 18 },
  { path: [vec2(282, 440), vec2(312, 474), vec2(356, 500), vec2(398, 510)], widthStart: 50, widthEnd: 16 },
];

/** Bóng đổ dưới gốc cây, giúp rễ "chạm" đất. */
export const GROUND_SHADOW = { cx: 262, cy: 502, rx: 280, ry: 18 } as const;

/**
 * Bụi rêu tròn trên lưng rễ và mặt trái thân (phía không bị nhà nấm che):
 * vẽ giống một cụm tán nhỏ, màu `moss`.
 */
export const MOSS: readonly { x: number; y: number; r: number }[] = [
  { x: 140, y: 452, r: 28 },
  { x: 386, y: 452, r: 26 },
  { x: 186, y: 396, r: 20 },
  { x: 342, y: 404, r: 17 },
  { x: 196, y: 238, r: 18 },
  { x: 60, y: 488, r: 16 },
  { x: 470, y: 492, r: 15 },
];

/**
 * Vân xoắn trên thân và lưng rễ (như ảnh A2): dải đa giác thuôn, nằm hẳn
 * trong thân, tránh hốc cây.
 */
export const RIDGES: readonly { path: readonly Vec2[]; widthStart: number; widthEnd: number }[] = [
  { path: [vec2(178, 436), vec2(196, 380), vec2(206, 320), vec2(212, 268), vec2(236, 210), vec2(268, 160), vec2(300, 128)], widthStart: 14, widthEnd: 6 },
  { path: [vec2(300, 470), vec2(312, 400), vec2(318, 330), vec2(310, 250), vec2(292, 180)], widthStart: 16, widthEnd: 8 },
  { path: [vec2(214, 410), vec2(166, 448), vec2(106, 476)], widthStart: 10, widthEnd: 4 },
  { path: [vec2(204, 456), vec2(150, 488), vec2(98, 500)], widthStart: 8, widthEnd: 3 },
  { path: [vec2(310, 410), vec2(358, 448), vec2(418, 476)], widthStart: 10, widthEnd: 4 },
  { path: [vec2(320, 456), vec2(374, 488), vec2(426, 500)], widthStart: 8, widthEnd: 3 },
];

/** Một cành vẽ bằng đa giác thuôn dần dọc theo đường gấp khúc. */
export interface Branch {
  readonly path: readonly Vec2[];
  readonly widthStart: number;
  readonly widthEnd: number;
  /** `true` nếu cành thuộc tán (đung đưa), `false` nếu đứng yên cùng thân. */
  readonly sway: boolean;
}

/**
 * Cành lớn. Cành đầu là cành chính đi qua (300,110) → (560,70) → (900,148);
 * cành thứ hai là nhánh trái chẻ từ ngọn thân. Mọi đầu cành đều nằm trong một cụm tán.
 */
export const BRANCHES: readonly Branch[] = [
  { path: [vec2(278, 150), vec2(318, 110), vec2(430, 86), vec2(560, 70), vec2(700, 92), vec2(900, 148)], widthStart: 92, widthEnd: 14, sway: true },
  { path: [vec2(244, 150), vec2(212, 90), vec2(176, 36), vec2(150, -20)], widthStart: 96, widthEnd: 40, sway: false },
  { path: [vec2(186, 52), vec2(110, 34), vec2(34, 44)], widthStart: 34, widthEnd: 12, sway: false },
  { path: [vec2(520, 76), vec2(580, 32), vec2(612, -8)], widthStart: 22, widthEnd: 8, sway: true },
  { path: [vec2(720, 98), vec2(790, 62), vec2(822, 22)], widthStart: 18, widthEnd: 6, sway: true },
  { path: [vec2(860, 138), vec2(960, 160), vec2(1040, 142)], widthStart: 13, widthEnd: 5, sway: true },
];

/** Cành nhỏ: nét dày cho cành con, Bresenham 1px cho nhánh lá. */
export interface Twig {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly width: number;
  readonly sway: boolean;
}

/** Cành con (nét dày): mọc từ cành lớn, đầu kia luôn chui vào một cụm tán phía trước. */
export const TWIGS: readonly Twig[] = [
  { from: vec2(470, 80), to: vec2(440, 118), width: 5, sway: true },
  { from: vec2(640, 80), to: vec2(652, 120), width: 5, sway: true },
  { from: vec2(780, 116), to: vec2(830, 140), width: 4, sway: true },
  { from: vec2(990, 156), to: vec2(1030, 150), width: 3, sway: true },
  { from: vec2(130, 38), to: vec2(160, 92), width: 5, sway: false },
];

/** Vân gỗ: các đường gấp khúc nằm hẳn trong thân, tránh hốc cây. */
export const BARK_LINES: readonly (readonly Vec2[])[] = [
  [vec2(240, 160), vec2(228, 230), vec2(214, 300), vec2(204, 380)],
  [vec2(290, 160), vec2(300, 230), vec2(312, 300), vec2(326, 400)],
  [vec2(262, 190), vec2(270, 270)],
  [vec2(290, 370), vec2(300, 450)],
  [vec2(186, 400), vec2(150, 446), vec2(100, 478)],
  [vec2(338, 400), vec2(374, 446), vec2(424, 478)],
  [vec2(226, 120), vec2(196, 60)],
  [vec2(380, 98), vec2(470, 84)],
];

/** Một cụm tán: tâm, bán kính và lớp (0 = sau, nằm dưới thân; 1 = trước). */
export interface CanopyCluster {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly depth: 0 | 1;
}

/** 11 cụm tán dọc mép trên, x = 0…1120, y = 0…216, chồng lên nhau thành một tán dày. */
export const CANOPY: readonly CanopyCluster[] = [
  { cx: 30, cy: 76, r: 126, depth: 0 },
  { cx: 240, cy: 62, r: 122, depth: 0 },
  { cx: 462, cy: 72, r: 130, depth: 0 },
  { cx: 684, cy: 58, r: 120, depth: 0 },
  { cx: 894, cy: 78, r: 124, depth: 0 },
  { cx: 1078, cy: 106, r: 98, depth: 0 },
  { cx: 160, cy: 104, r: 114, depth: 1 },
  { cx: 390, cy: 98, r: 110, depth: 1 },
  { cx: 618, cy: 110, r: 118, depth: 1 },
  { cx: 846, cy: 116, r: 106, depth: 1 },
  { cx: 1040, cy: 128, r: 92, depth: 1 },
];

/** Thuỳ của một cụm: 1 tâm + 8 thuỳ quanh viền, bè ngang để các cụm chạm nhau, tạo mép lượn kiểu súp lơ (đơn vị: bán kính cụm). */
const LOBES: readonly { dx: number; dy: number; r: number }[] = [
  { dx: 0, dy: 0, r: 0.62 },
  ...Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + 0.3;
    return { dx: Math.cos(a) * 0.7, dy: Math.sin(a) * 0.48, r: 0.42 };
  }),
];

/** Chùm lá sáng bên trong cụm, lệch về phía trên-phải (hướng sáng). */
const LEAF_CLUMPS: readonly { dx: number; dy: number; r: number }[] = [
  { dx: 0.22, dy: -0.3, r: 0.3 },
  { dx: -0.2, dy: -0.18, r: 0.24 },
  { dx: 0.42, dy: 0.06, r: 0.22 },
  { dx: 0.02, dy: 0.18, r: 0.2 },
];

/**
 * Dây leo quấn quanh thân (theo ảnh mẫu B11): một dây mềm màu lá, lá hình
 * giọt nước mọc so le, đầu dây cuộn.
 *
 * - Đường trục là đường xoắn ốc (helix) chiếu lên mặt phẳng: góc quay φ tăng
 *   đều theo chiều cao, x = giữa + (nửa bề rộng + độ nổi)·sin φ, y cong nhẹ
 *   theo cos φ (phối cảnh). Dây ở mặt trước khi cos φ > −0.25, nên ở hai mép
 *   thân dây còn lộ ra một chút như đang vòng ra sau.
 * - Pha và bước xoắn chọn sao cho: φ(yBottom) = −π/2 (dây mọc từ đất ở mép
 *   trái thân) và φ(hollowY) = π (đoạn ngang hốc cây nằm ở mặt sau).
 * - Lá: gộp một mask, tô 3 tông + viền; cuống lá là nét dày.
 */
export const VINE = {
  /** Chân dây (chỗ thân gặp rễ, sát mặt đất) và đỉnh (bị tán che). */
  yBottom: 486,
  yTop: 120,
  /** Độ cao giữa hốc cây. */
  hollowY: 332,
  /**
   * 154px = ¾ vòng → bước xoắn ~205px. Bước dài để cả đoạn sau thân che kín
   * vùng hốc (332 ± 50) mà không phải bẻ cong dây, và dây đi chéo dốc như ảnh mẫu.
   */
  pitch: (2 * Math.PI * (486 - 332)) / (1.5 * Math.PI),
  /** Dây nổi ra ngoài mép thân bao nhiêu px khi vòng qua mép. */
  bulge: 4,
  /** Độ cong phối cảnh theo tỉ lệ nửa bề rộng thân. */
  tiltRatio: 0.28,
  /** Khoảng cách giữa hai lá dọc dây. */
  leafStep: 38,
} as const;

/** Mép trái/phải của thân tại độ cao y (nội suy trên đa giác TRUNK). */
export function trunkEdgesAt(y: number): { left: number; right: number } {
  const chain = (pts: readonly Vec2[]): number => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
    }
    return y < pts[0].y ? pts[0].x : pts[pts.length - 1].x;
  };
  // TRUNK[0..7]: mép trái từ trên xuống; TRUNK[10..17]: mép phải từ dưới lên
  return { left: chain(TRUNK.slice(0, 8)), right: chain(TRUNK.slice(10)) };
}

/** Góc xoắn tại độ cao y. */
function vinePhi(y: number): number {
  return Math.PI + (2 * Math.PI * (VINE.hollowY - y)) / VINE.pitch;
}

/** Các cung dây ở mặt trước thân (toạ độ world), mỗi cung là một polyline từ dưới lên. */
export function vineFrontArcs(step = 2): Vec2[][] {
  const arcs: Vec2[][] = [];
  let cur: Vec2[] = [];
  for (let y = VINE.yBottom; y >= VINE.yTop; y -= step) {
    const phi = vinePhi(y);
    const e = trunkEdgesAt(Math.min(y, 460));
    const mid = (e.left + e.right) / 2;
    const half = (e.right - e.left) / 2;
    if (Math.cos(phi) > -0.25) {
      cur.push(vec2(mid + (half + VINE.bulge) * Math.sin(phi), y + half * VINE.tiltRatio * Math.cos(phi)));
    } else if (cur.length) {
      if (cur.length > 1) arcs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) arcs.push(cur);
  // Chân dây: móc nhỏ từ mặt đất cong lên nối vào đầu cung dưới cùng
  if (arcs.length) {
    const s0 = arcs[0][0];
    const hook: Vec2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const u = 1 - t;
      // Bézier bậc 2: (s0.x − 16, s0.y + 18) → (s0.x − 14, s0.y + 2) → s0
      hook.push(vec2(u * u * (s0.x - 16) + 2 * u * t * (s0.x - 14) + t * t * s0.x, u * u * (s0.y + 18) + 2 * u * t * (s0.y + 2) + t * t * s0.y));
    }
    arcs[0] = [...hook.slice(0, -1), ...arcs[0]];
  }
  return arcs;
}

/** Hình lá giọt nước cục bộ: gốc tại (0,0), mũi nhọn ở (len, 0). */
export function vineLeafShape(len: number, n = 10): Vec2[] {
  const w = len * 0.42;
  const top: Vec2[] = [];
  const bottom: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const half = w * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.25 * u);
    top.push(vec2(u * len, -half));
    bottom.push(vec2(u * len, half));
  }
  return [...top, ...bottom.reverse().slice(1, -1)];
}

/** Một lá trên dây: điểm bám, góc (rad), chiều dài, chiều dài cuống. */
export interface VineLeaf {
  readonly at: Vec2;
  readonly angle: number;
  readonly len: number;
  readonly stalk: number;
}

/**
 * Lá dọc các cung: cách đều `leafStep`, so le hai bên, chĩa chéo lên; thêm một lá
 * ở đầu mỗi cung (chỗ dây vòng ra sau mép thân) chĩa ra ngoài.
 */
export function vineLeaves(arcs: readonly (readonly Vec2[])[]): VineLeaf[] {
  const leaves: VineLeaf[] = [];
  let side = 1;
  let k = 0;
  for (const arc of arcs) {
    let dist = VINE.leafStep * 0.6;
    for (let i = 1; i < arc.length; i++) {
      const a = arc[i - 1], b = arc[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      while (dist <= len) {
        const t = dist / len;
        const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
        const at = vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        // Lá chĩa ra một bên dây, hơi ngả theo chiều dây đi lên
        const nx = -uy * side, ny = ux * side;
        const angle = Math.atan2(ny * 0.8 + uy * 0.6, nx * 0.8 + ux * 0.6);
        // Bỏ lá chĩa vào hốc cây (hốc vẽ sau sẽ cắt mất lá)
        const tip = vec2(at.x + Math.cos(angle) * 26, at.y + Math.sin(angle) * 26);
        if (Math.hypot(tip.x - HOLLOW_SEED.x, (tip.y - HOLLOW_SEED.y) * 0.7) < 34) {
          side = -side;
          dist += VINE.leafStep;
          continue;
        }
        leaves.push({ at, angle, len: 18 + 3 * ((k * 7) % 3), stalk: 5 });
        side = -side;
        k++;
        dist += VINE.leafStep;
      }
      dist -= len;
    }
    // Lá ở đầu cung (mép thân), chĩa ra ngoài và hơi lên
    const end = arc[arc.length - 1];
    const prev = arc[arc.length - 4] ?? arc[0];
    const out = Math.sign(end.x - prev.x) || 1;
    leaves.push({ at: end, angle: out > 0 ? -0.5 : Math.PI + 0.5, len: 20, stalk: 6 });
  }
  return leaves;
}

/** Hốc cây: đa giác viền (cao 62) và điểm gieo flood fill. */
export const HOLLOW: readonly Vec2[] = [
  vec2(250, 299), vec2(265, 310), vec2(272, 332), vec2(267, 354),
  vec2(250, 361), vec2(234, 354), vec2(228, 332), vec2(235, 310),
];
export const HOLLOW_SEED: Vec2 = vec2(250, 332);

/** Số hạt sáng bay ra khỏi hốc và chu kỳ (giây) của mỗi hạt. */
const SPARKLE_COUNT = 10;
const SPARKLE_PERIOD = 4;

/** Quầng sáng quanh hốc (ban đêm): các vòng tròn đồng tâm, càng ra ngoài càng mờ. */
const GLOW_CENTER: Vec2 = vec2(250, 334);
const GLOW_RINGS: readonly { r: number; alpha: number }[] = [
  { r: 64, alpha: 0.06 },
  { r: 50, alpha: 0.08 },
  { r: 38, alpha: 0.1 },
  { r: 28, alpha: 0.14 },
];

// ---------------------------------------------------------------------------
// Hàm hình học
// ---------------------------------------------------------------------------

/**
 * Đa giác thuôn dọc theo đường gấp khúc: độ rộng giảm tuyến tính từ
 * `w0` ở đầu tới `w1` ở cuối; pháp tuyến tại đỉnh là trung bình hai đoạn kề.
 */
export function taperedPolygon(path: readonly Vec2[], w0: number, w1: number): Vec2[] {
  const n = path.length;
  if (n < 2) return [];
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(n - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const half = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push(vec2(path[i].x - dy * half, path[i].y + dx * half));
    right.push(vec2(path[i].x + dy * half, path[i].y - dx * half));
  }
  return [...left, ...right.reverse()];
}

/** Các thuỳ (hình tròn) của một cụm tán, có lệch nhẹ theo seed để không đều tăm tắp. */
export function clusterLobes(c: CanopyCluster, seed: number): { x: number; y: number; r: number }[] {
  const rnd = createRng(seed);
  // Lệch vị trí và bán kính từng thuỳ để mỗi bụi lá một dáng, không đều tăm tắp
  return LOBES.map((l, i) => {
    const jitter = i === 0 ? 1 : 0.78 + rnd() * 0.44;
    const dx = l.dx + (i === 0 ? 0 : (rnd() - 0.5) * 0.18);
    const dy = l.dy + (i === 0 ? 0 : (rnd() - 0.5) * 0.18);
    return { x: c.cx + dx * c.r, y: c.cy + dy * c.r, r: l.r * c.r * jitter };
  });
}

/** Kiểm tra điểm nằm trong đa giác (even-odd), dùng cho test và hit-test. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------------------
// Vật thể
// ---------------------------------------------------------------------------

/** Layer.TREE trong SPEC (#33 sẽ export hằng số này). */
export const TREE_LAYER = 20;

/**
 * Cây cổ thụ. Cây Node:
 *
 * ```
 * root (TREE_BASE)            thân, rễ, cành trái: đứng yên
 * └── crown (CROWN_PIVOT)     cành lớn + cành nhỏ: xoay ±SWAY_AMPLITUDE
 *     └── cluster[i]          mỗi cụm tán xoay thêm, lệch pha
 * ```
 *
 * Hình học local tính một lần trong constructor; mỗi frame chỉ đổi góc xoay.
 */
export class AncientTree {
  readonly id = 'tree';
  readonly name = 'Cây cổ thụ';
  readonly description =
    'Cây cổ thụ trăm năm che bóng cả khu rừng. Ban đêm, hốc cây sáng lên như có ai đang thắp đèn bên trong.';
  readonly algorithms: readonly string[] = [
    'Scanline polygon fill (thân, rễ, cành, vân xoắn)',
    'Bresenham, nét dày (cành nhỏ, vân gỗ)',
    'Midpoint circle (thuỳ tán)',
    'Flood fill (hốc cây)',
    'Alpha blending (quầng sáng, chấm sáng ban đêm)',
    'Đường xoắn ốc chiếu phẳng (dây leo quấn thân)',
    'Biến đổi gộp: cây Node, xoay quanh điểm gắn cành',
  ];
  readonly layer = TREE_LAYER;
  readonly interactive = true;

  readonly root = new Node();
  readonly crown = new Node();
  readonly clusters: readonly Node[];

  /** Hình học local, tính sẵn. */
  private readonly trunkLocal: readonly Vec2[];
  private readonly staticBranches: readonly (readonly Vec2[])[];
  private readonly swayBranches: readonly (readonly Vec2[])[];
  private readonly lobesLocal: readonly (readonly { x: number; y: number; r: number }[])[];
  private readonly phases: readonly number[];
  /** Dây leo: các cung mặt trước và gai (world, tính sẵn). */
  private readonly vineArcs: readonly Vec2[][] = vineFrontArcs();
  private readonly vineLeafList: readonly VineLeaf[] = vineLeaves(this.vineArcs);

  constructor() {
    this.root.transform.x = TREE_BASE.x;
    this.root.transform.y = TREE_BASE.y;

    const pivotLocal = sub(CROWN_PIVOT, TREE_BASE);
    this.crown.transform.x = pivotLocal.x;
    this.crown.transform.y = pivotLocal.y;
    this.root.add(this.crown);

    this.trunkLocal = TRUNK.map((p) => sub(p, TREE_BASE));
    // Rễ và cành đứng yên đều gắn vào Node gốc
    this.staticBranches = [
      ...ROOTS.map((rt) => taperedPolygon(rt.path, rt.widthStart, rt.widthEnd)),
      ...BRANCHES.filter((b) => !b.sway).map((b) => taperedPolygon(b.path, b.widthStart, b.widthEnd)),
    ].map((poly) => poly.map((p) => sub(p, TREE_BASE)));
    this.swayBranches = BRANCHES.filter((b) => b.sway).map((b) =>
      taperedPolygon(b.path, b.widthStart, b.widthEnd).map((p) => sub(p, CROWN_PIVOT)),
    );

    // Mỗi cụm là một Node con của crown, đặt tại tâm cụm (toạ độ so với pivot)
    const clusters: Node[] = [];
    const lobes: { x: number; y: number; r: number }[][] = [];
    CANOPY.forEach((c, i) => {
      const node = new Node();
      node.transform.x = c.cx - CROWN_PIVOT.x;
      node.transform.y = c.cy - CROWN_PIVOT.y;
      this.crown.add(node);
      clusters.push(node);
      lobes.push(clusterLobes(c, 1400 + i).map((l) => ({ x: l.x - c.cx, y: l.y - c.cy, r: l.r })));
    });
    this.clusters = clusters;
    this.lobesLocal = lobes;
    this.phases = CANOPY.map((_, i) => i * 0.7);
  }

  /** Đặt góc xoay theo thời gian. Thân đứng yên; tán lay rất nhẹ. */
  update(env: Pick<TreeEnv, 'time'>): void {
    const t = env.time;
    // Làm tròn góc theo bước SWAY_STEP (0,0005 rad, đầu cành xa nhất dời < 0,5 px mỗi bước):
    // mắt không thấy khác, nhưng renderer dùng lại được hình đã vẽ của các bước trước
    const q = (a: number): number => Math.round(a / SWAY_STEP) * SWAY_STEP;
    this.crown.transform.rotation = q(SWAY_AMPLITUDE * Math.sin(t * SWAY_SPEED));
    this.clusters.forEach((node, i) => {
      node.transform.rotation = q(SWAY_AMPLITUDE * 0.5 * Math.sin(t * SWAY_SPEED * 1.6 + this.phases[i]));
    });
  }

  // --- Hình học world (áp transform hiện tại) ------------------------------

  /** Thân, rễ và cành đứng yên, world (phần tử đầu là thân). */
  trunkWorld(): Vec2[][] {
    const m = this.root.worldMatrix();
    return [transformPoints(m, this.trunkLocal), ...this.staticBranches.map((p) => transformPoints(m, p))];
  }

  /** Các cành đung đưa, world. */
  swayBranchesWorld(): Vec2[][] {
    const m = this.crown.worldMatrix();
    return this.swayBranches.map((p) => transformPoints(m, p));
  }

  /**
   * Thuỳ của từng cụm tán, world. Tâm cụm lấy từ ma trận world của Node cụm
   * (biến đổi gộp root → crown → cụm). Góc lay chỉ vài phần nghìn radian nên
   * các thuỳ (hình tròn) chỉ tịnh tiến theo tâm cụm, hình dạng cụm giữ nguyên:
   * renderer nhờ vậy dùng lại được hình đã vẽ của cụm ở mọi khung.
   */
  canopyWorld(): { x: number; y: number; r: number }[][] {
    return this.clusters.map((node, i) => {
      const c = mat3Apply(node.worldMatrix(), vec2(0, 0));
      return this.lobesLocal[i].map((l) => ({ x: c.x + l.x, y: c.y + l.y, r: l.r }));
    });
  }

  /** Ma trận world của crown (để test và debug). */
  crownMatrix(): Mat3 {
    return this.crown.worldMatrix();
  }

  /** Polygon nhấn chuột: thân, cành, và một elip bao mỗi cụm tán. */
  hitPolygons(): Vec2[][] {
    const polys = [...this.trunkWorld(), ...this.swayBranchesWorld()];
    this.clusters.forEach((node, i) => {
      const c = mat3Apply(node.worldMatrix(), vec2(0, 0));
      const r = CANOPY[i].r;
      polys.push(ellipsePolygon(c.x, c.y, r * 0.95, r * 0.85, 24));
    });
    return polys;
  }

  // --- Vẽ ------------------------------------------------------------------

  draw(r: TreeRenderer, env: TreeEnv): void {
    const p = env.palette;
    const canopy = this.canopyWorld();

    // 0. Bóng đổ dưới gốc (đặt trên mặt đất, dưới rễ)
    const sh = GROUND_SHADOW;
    r.polygon(ellipsePolygon(sh.cx, sh.cy, sh.rx, sh.ry, 40), p.shadow, true);

    // 1. Lớp tán phía sau (nằm dưới thân)
    canopy.forEach((lobes, i) => {
      if (CANOPY[i].depth === 0) this.drawCluster(r, p, lobes, CANOPY[i].r, true);
    });

    // 2. Thân + rễ + cành: gộp mask, tô 3 tông, viền một lần
    // Cành lay vẽ thành khối riêng, ngay trước thân: chỗ nối nằm dưới tán phía trước
    // nên không thấy đường viền. Thân đứng yên thì renderer dùng lại hình đã vẽ.
    const woodStyle: ShapeStyle = { fill: p.trunk, shade: p.trunkDark, highlight: p.trunkLight, outline: p.ink, outlineWidth: 2 };
    const swaying = r.mask();
    for (const poly of this.swayBranchesWorld()) swaying.polygon(poly);
    r.shape(swaying, woodStyle);
    const wood = r.mask();
    for (const poly of this.trunkWorld()) wood.polygon(poly);
    r.shape(wood, woodStyle);

    // 2a. Vân xoắn trên thân và lưng rễ (gộp một mask)
    const ridges = r.mask();
    for (const rg of RIDGES) {
      ridges.polygon(transformPoints(this.root.worldMatrix(), taperedPolygon(rg.path, rg.widthStart, rg.widthEnd).map((q) => sub(q, TREE_BASE))));
    }
    r.shape(ridges, { fill: p.trunkLight, shade: p.trunk, outline: p.trunkDark, outlineWidth: 1 });

    // 3. Vân gỗ (Bresenham)
    const rootM = this.root.worldMatrix();
    for (const line of BARK_LINES) {
      const pts = transformPoints(rootM, line.map((q) => sub(q, TREE_BASE)));
      for (let i = 1; i < pts.length; i++) {
        r.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, p.trunkDark, 1, 'bresenham');
      }
    }

    // 3a. Dây leo: chỉ các cung mặt trước, kèm lá
    this.drawVine(r, p, rootM);

    // 3b. Bụi rêu tròn (vẽ sau vân gỗ để vân không đè lên rêu); gộp một mask
    const rootMatrix = this.root.worldMatrix();
    const mossMask = r.mask();
    for (const moss of MOSS) {
      const c = mat3Apply(rootMatrix, sub(vec2(moss.x, moss.y), TREE_BASE));
      for (const l of LOBES) mossMask.circle(c.x + l.dx * moss.r, c.y + l.dy * moss.r, l.r * moss.r);
    }
    r.shape(mossMask, { fill: p.moss, shade: p.canopyDark, highlight: p.canopyLight, outline: p.ink, outlineWidth: 2 });

    // 4. Cành nhỏ: nét dày cho cành con, Bresenham cho nhánh lá
    const crownM = this.crown.worldMatrix();
    for (const tw of TWIGS) {
      const m = tw.sway ? crownM : rootM;
      const base = tw.sway ? CROWN_PIVOT : TREE_BASE;
      const a = mat3Apply(m, sub(tw.from, base));
      const b = mat3Apply(m, sub(tw.to, base));
      if (tw.width > 1) r.line(a.x, a.y, b.x, b.y, p.trunkDark, tw.width);
      else r.line(a.x, a.y, b.x, b.y, p.inkSoft, 1, 'bresenham');
    }

    // 5. Hốc cây: viền đa giác rồi flood fill bên trong
    this.drawHollow(r, p, env.dayPhase, env.time);

    // 6. Lớp tán phía trước (che một phần cành lớn)
    canopy.forEach((lobes, i) => {
      if (CANOPY[i].depth === 1) this.drawCluster(r, p, lobes, CANOPY[i].r, false);
    });

  }

  private drawVine(r: TreeRenderer, p: Palette, m: Mat3): void {
    const toW = (q: Vec2): Vec2 => mat3Apply(m, sub(q, TREE_BASE));
    // Dây: viền ink, thân màu lá, vệt sáng phía trên (ánh sáng từ trên-phải)
    for (const arc of this.vineArcs) {
      const pts = arc.map(toW);
      for (let i = 1; i < pts.length; i++) r.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, p.ink, 7);
      for (let i = 1; i < pts.length; i++) r.line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, p.leaf, 4.5);
      for (let i = 1; i < pts.length; i++) r.line(pts[i - 1].x + 0.6, pts[i - 1].y - 0.9, pts[i].x + 0.6, pts[i].y - 0.9, p.canopyLight, 2);
    }
    // Cuống lá
    const leafPolys: Vec2[][] = [];
    for (const lf of this.vineLeafList) {
      const ca = Math.cos(lf.angle), sa = Math.sin(lf.angle);
      const a = toW(lf.at);
      const b = toW(vec2(lf.at.x + ca * lf.stalk, lf.at.y + sa * lf.stalk));
      r.line(a.x, a.y, b.x, b.y, p.ink, 3.5);
      r.line(a.x, a.y, b.x, b.y, p.leaf, 1.5);
      leafPolys.push(vineLeafShape(lf.len).map((q) => toW(vec2(
        lf.at.x + ca * (lf.stalk + q.x) - sa * q.y,
        lf.at.y + sa * (lf.stalk + q.x) + ca * q.y,
      ))));
    }
    // Lá: gộp một mask, tô 3 tông + viền
    const leaves = r.mask();
    for (const poly of leafPolys) leaves.polygon(poly);
    r.shape(leaves, { fill: lerpColor(p.leaf, p.canopyLight, 0.55), shade: p.leaf, highlight: p.canopyLight, outline: p.ink, outlineWidth: 2 });
    // Gân lá
    for (const lf of this.vineLeafList) {
      const ca = Math.cos(lf.angle), sa = Math.sin(lf.angle);
      const a = toW(vec2(lf.at.x + ca * (lf.stalk + 1), lf.at.y + sa * (lf.stalk + 1)));
      const b = toW(vec2(lf.at.x + ca * (lf.stalk + lf.len * 0.7), lf.at.y + sa * (lf.stalk + lf.len * 0.7)));
      r.line(a.x, a.y, b.x, b.y, p.leaf, 1, 'bresenham');
    }
  }

  /**
   * Tia phép bay ra từ hốc: mỗi hạt đi theo một hướng chếch lên, vừa bay vừa
   * lắc ngang, sáng dần rồi tắt; hết vòng thì quay lại miệng hốc. Vị trí chỉ
   * phụ thuộc thời gian nên không cần lưu trạng thái.
   */
  private drawSparkles(r: TreeRenderer, p: Palette, night: number, time: number): void {
    const m = this.root.worldMatrix();
    const o = mat3Apply(m, sub(HOLLOW_SEED, TREE_BASE));
    const n = SPARKLE_COUNT;
    for (let i = 0; i < n; i++) {
      const ph = (time / SPARKLE_PERIOD + i / n) % 1;
      const angle = -2.5 + (1.9 * ((i * 7) % n)) / (n - 1);
      const dist = 110 * ph;
      const x = o.x + Math.cos(angle) * dist + 8 * Math.sin(ph * 9 + i);
      const y = o.y + Math.sin(angle) * dist - 40 * ph;
      const a = night * Math.sin(Math.PI * ph);
      if (a <= 0.01) continue;
      // Tia phép thuật: ngôi sao 4 cánh bằng 2 đoạn Bresenham, có quầng nhỏ
      const len = 6 + 3 * Math.sin(time * 6 + i);
      const c = withAlpha(p.firefly, a);
      r.line(x - len, y, x + len, y, c, 1, 'bresenham');
      r.line(x, y - len, x, y + len, c, 1, 'bresenham');
      r.circle(x, y, 4, withAlpha(p.windowGlow, 0.2 * a), true);
    }
  }

  private drawCluster(
    r: TreeRenderer,
    p: Palette,
    lobes: readonly { x: number; y: number; r: number }[],
    radius: number,
    back: boolean,
  ): void {
    const m = r.mask();
    for (const l of lobes) m.circle(l.x, l.y, l.r);
    // Lớp sau tối hơn một bậc để tạo chiều sâu
    const style: ShapeStyle = back
      ? { fill: lerpColor(p.canopyDark, p.canopy, 0.45), shade: p.canopyDark, highlight: p.canopy, outline: p.ink, outlineWidth: 2 }
      : { fill: p.canopy, shade: p.canopyDark, highlight: p.canopyLight, outline: p.ink, outlineWidth: 2 };
    r.shape(m, style);

    // Chùm lá sáng bên trong cụm (thuỳ đầu tiên nằm đúng tâm cụm); mỗi cụm
    // lệch vị trí, cỡ và số chùm khác nhau theo seed
    const cx = lobes[0].x;
    const cy = lobes[0].y;
    const rnd = createRng(Math.round(radius * 31 + cx));
    const count = 3 + Math.floor(rnd() * 2);
    // Các chùm lá của một cụm gộp chung một mask (không viền nên gộp không đổi hình)
    const clumps = r.mask();
    for (let k = 0; k < count; k++) {
      const leaf = LEAF_CLUMPS[k];
      const x = cx + (leaf.dx + (rnd() - 0.5) * 0.2) * radius;
      const y = cy + (leaf.dy + (rnd() - 0.5) * 0.16) * radius;
      const rr = leaf.r * radius * (0.8 + rnd() * 0.4);
      clumps.circle(x, y, rr).circle(x + rr * 0.7, y + rr * 0.15, rr * 0.75).circle(x - rr * 0.6, y + rr * 0.25, rr * 0.7);
    }
    r.shape(clumps, back
      ? { fill: lerpColor(style.fill, p.canopy, 0.6), shade: style.fill }
      : { fill: p.canopyLight, shade: p.canopy });
  }

  private drawHollow(r: TreeRenderer, p: Palette, dayPhase: number, time: number): void {
    const m = this.root.worldMatrix();
    const pts = transformPoints(m, HOLLOW.map((q) => sub(q, TREE_BASE)));
    const seed = mat3Apply(m, sub(HOLLOW_SEED, TREE_BASE));
    // Viền miệng hốc dày, màu gỗ tối: tạo cảm giác hốc lõm vào trong thân
    const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length;
    const cy = pts.reduce((a, q) => a + q.y, 0) / pts.length;
    r.polygon(pts.map((q) => vec2(cx + (q.x - cx) * 1.3, cy + (q.y - cy) * 1.18)), p.trunkDark, true);
    r.polygon(pts, p.ink, false);

    // Ban ngày hốc tối; ban đêm lòng hốc ấm lên như có đèn bên trong
    const night = Math.max(0, Math.min(1, dayPhase));
    const dark = lerpColor(p.trunkDark, p.ink, 0.6);
    r.floodFill(seed.x, seed.y, lerpColor(dark, p.window, night * 0.85));

    // Quầng sáng tràn ra vỏ cây, chỉ khi trời tối
    if (night <= 0) return;
    const c = mat3Apply(m, sub(GLOW_CENTER, TREE_BASE));
    for (const ring of GLOW_RINGS) {
      r.circle(c.x, c.y, ring.r, withAlpha(p.fireflyGlow, ring.alpha * night), true);
    }
    // Bụi phép thuật bay ra khỏi hốc (đom đóm do #23 làm riêng)
    this.drawSparkles(r, p, night, time);
  }
}
