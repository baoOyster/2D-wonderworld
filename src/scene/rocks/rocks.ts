/**
 * Đá lớn ven hồ và sỏi (#20).
 *
 * Thuật toán dùng:
 * - **Scanline polygon fill**: mỗi tảng là đa giác 16 đỉnh bo tròn (bán kính mỗi
 *   đỉnh lệch ±7% quanh elip nửa rộng `size` × nửa cao `size·ROCK_ASPECT`), sinh
 *   một lần bằng RNG có seed (không `Math.random` trong `draw`).
 * - **Gộp khối + tô 3 tông**: cả tảng vào một `Mask`, tô `stone`, tông tối
 *   `stoneDark` ở mép dưới-trái, tông sáng ở mép trên-phải theo hướng sáng
 *   trên-phải của `docs/style-guide.md`. Đá **không viền `ink`**: viền dày biến
 *   tảng thành viên đá quý (góp ý 25/11, và "tránh viền đen dày" trong issue #20).
 * - **Đá ở mép nước**: mép dưới tảng đặt đúng mực nước tại hoành độ của nó; không
 *   cắt tảng ở mực nước (bản trước để 25% chìm dưới nước nên trông lơ lửng).
 * - **Phản chiếu**: lật thân qua đường đáy rồi ép dọc, tô **tối hơn** nền và mờ
 *   dần theo chiều sâu — vệt phản chiếu dưới chân tảng như ảnh mẫu `B5_ho_da.jpg`.
 * - **Midpoint ellipse + alpha blending**: bóng đổ dưới chân tảng trên cỏ, và 16
 *   viên sỏi elip alpha nhẹ.
 *
 * Toạ độ world 1280×720. Bốn tảng ven hồ lấy hoành độ theo `docs/reference/layout.md`
 * nhưng **tung độ suy từ mép elip hồ** (`lakeEdgeY`) để đá luôn nằm ở mép nước dù
 * hồ đổi cỡ; bốn tảng tiền cảnh giữ nguyên toạ độ layout.
 */
import { lerpColor, pack, unpack, withAlpha, type RGBA } from '../../core/color.ts';
import type { Palette } from '../../core/palette.ts';
import type { Renderer, ShapeStyle } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';

/** Hồ nước theo `layout.md`; hồ và gợn sóng do #13 vẽ, đá chỉ cần biết mép hồ. */
export const LAKE = { cx: 1010, cy: 590, rx: 300, ry: 66 } as const;

/** Nửa cao / nửa rộng của tảng: đá bẹt và bo tròn, không phải khối đa diện. */
export const ROCK_ASPECT = 0.66;

/** Số đỉnh của viền bo tròn (đủ nhiều để thấy mềm, đủ ít để còn "vẽ tay"). */
export const ROCK_VERTICES = 16;

/** Bán kính mỗi đỉnh lệch ngẫu nhiên ±7% quanh elip. */
export const ROCK_WOBBLE = 0.07;

/** Vệt phản chiếu: hệ số ép dọc, hệ số thu hẹp ngang so với thân, alpha. */
export const REFLECT_SQUASH = 0.45;
export const REFLECT_WIDTH = 0.8;
export const REFLECT_ALPHA = 0.18;
export const REFLECT_NEAR_ALPHA = 0.16;
/** Phần trên của vệt phản chiếu (tính theo chiều sâu vệt) được tô đậm hơn. */
export const REFLECT_FADE = 0.5;

/** Điểm trên mép elip hồ theo góc (rad), `y` hướng xuống như toạ độ world. */
export function lakePoint(angle: number): Vec2 {
  return vec2(LAKE.cx + Math.cos(angle) * LAKE.rx, LAKE.cy + Math.sin(angle) * LAKE.ry);
}

/** Mực nước cục bộ: mép **trên** của elip hồ tại hoành độ `x`. */
export function lakeEdgeY(x: number): number {
  const t = Math.max(-1, Math.min(1, (x - LAKE.cx) / LAKE.rx));
  return LAKE.cy - LAKE.ry * Math.sqrt(1 - t * t);
}

/** Một tảng đá: tâm thân, cỡ (nửa bề ngang lớn nhất) và seed hình dạng. */
export interface BoulderSpec {
  readonly at: Vec2;
  /** Nửa bề ngang, 14–85 world px. */
  readonly size: number;
  readonly seed: number;
  /** `true` nếu chân đá nằm ở mép nước (tảng ven hồ). */
  readonly shore: boolean;
}

/**
 * Tảng ven hồ: giữ hoành độ, hạ tâm xuống sao cho **mép dưới nằm đúng mực nước**
 * tại `x` — đá kê trên bờ, mặt nước chạm chân đá. Không cắt tảng ở mực nước nữa
 * (bản trước để 25% chìm dưới nước nên nhìn như đang lơ lửng — góp ý 25/11).
 */
function shoreRock(x: number, size: number, seed: number): BoulderSpec {
  return { at: vec2(x, lakeEdgeY(x) - size * ROCK_ASPECT), size, seed, shore: true };
}

/**
 * 8 tảng đá của issue #20. Thứ tự: 4 tảng ven hồ (trái sang phải) rồi 4 tảng
 * tiền cảnh trên bờ gần, để vẽ theo thứ tự này (xa trước, gần sau).
 *
 * Bốn tảng tiền cảnh **dời khỏi vùng hoa cỏ và lối đi** (góp ý 25/11): layout cũ
 * đặt chúng ở `x = 300...752`, tức giữa vùng hoa cỏ (#17) và một tảng nằm giữa lối
 * đi (#16). Nay cả bốn ở bờ gần hồ, `x ≥ 700` (ngoài `RESERVED_RIGHT_X` của lớp
 * hoa cỏ) và nằm phải mép phải lối đi — đúng thế "đá tụ ở bờ hồ" như B5.
 */
export const BOULDERS: readonly BoulderSpec[] = [
  shoreRock(735, 62, 2001),
  shoreRock(826, 44, 2002),
  shoreRock(1186, 80, 2003),
  shoreRock(1136, 52, 2004),
  { at: vec2(870, 674), size: 42, seed: 2005, shore: false },
  { at: vec2(930, 692), size: 24, seed: 2006, shore: false },
  { at: vec2(1090, 700), size: 48, seed: 2007, shore: false },
  { at: vec2(1210, 684), size: 40, seed: 2008, shore: false },
];

/** Hình một tảng: biên ngoài bo tròn và đường đáy. */
export interface BoulderShape {
  readonly outline: readonly Vec2[];
  /** Nửa bề ngang (cỡ khai báo của tảng). */
  readonly size: number;
  /** Đường đáy của thân: khi ở mép hồ thì đây cũng là mực nước cục bộ. */
  readonly baseY: number;
  readonly shore: boolean;
}

/**
 * Bỏ bớt độ bão hoà: kéo từng kênh về mức xám trung bình theo hệ số `keep`
 * (`keep = 1` giữ nguyên, `0` là xám hoàn toàn). Palette chỉ có `stone`/`stoneDark`
 * ngả hồng-be, mà góp ý 25/11 xin đá **xám trung tính**; đây là cách duy nhất suy
 * ra xám từ palette, cùng cách `flowers.ts` tăng bão hoà cho cánh hoa.
 */
export function desaturate(c: RGBA, keep: number): RGBA {
  const { r, g, b, a } = unpack(c);
  const l = (r + g + b) / 3;
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(l + (v - l) * keep)));
  return pack(f(r), f(g), f(b), a);
}

/** Bốn tông đá suy ra từ palette; không hardcode màu cảnh. */
export interface StoneTones {
  /** Màu nền thân đá. */
  readonly fill: RGBA;
  /** Tông tối ở mép dưới-trái. */
  readonly shade: RGBA;
  /** Tông sáng ở mép trên-phải. */
  readonly highlight: RGBA;
  /** Màu vệt phản chiếu, **tối hơn** mặt nước (vẽ với `REFLECT_ALPHA`). */
  readonly reflection: RGBA;
}

/** Tông đá suy ra từ palette; không hardcode màu cảnh. */
export function stoneTones(p: Palette): StoneTones {
  const fill = desaturate(p.stone, 0.4);
  return {
    fill,
    shade: desaturate(p.stoneDark, 0.45),
    // Tông sáng: xám nhạt hơn ở mép trên-phải; không pha `pathStone` (màu đường
    // đất làm tảng ngả hồng/be — góp ý 25/11).
    highlight: lerpColor(fill, desaturate(p.mushroomSpot, 0.55), 0.5),
    // Vệt phản chiếu **tối hơn** nền (nước hoặc cỏ). Bản trước pha sáng hơn nước
    // nên đọc ra như một tảng thứ hai nằm dưới => "đá bay lơ lửng" (góp ý 25/11).
    reflection: lerpColor(desaturate(p.stoneDark, 0.5), p.ink, 0.5),
  };
}

/**
 * Hình một tảng đá: đa giác `ROCK_VERTICES` đỉnh trên elip nửa rộng `size` × nửa
 * cao `size·ROCK_ASPECT`, mỗi đỉnh lệch ngẫu nhiên ±`ROCK_WOBBLE` theo seed, đáy
 * kẹp phẳng ở `baseY` để tảng "ngồi" trên mặt phẳng. Không có mặt vát: khối đọc
 * ra bằng ba tông mềm của `shape()`.
 */
export function boulderShape(spec: BoulderSpec): BoulderShape {
  const rnd = createRng(spec.seed);
  const halfWidth = spec.size;
  const halfHeight = spec.size * ROCK_ASPECT;
  const spin = rnd() * Math.PI * 2;
  const outline: Vec2[] = [];
  for (let i = 0; i < ROCK_VERTICES; i++) {
    const angle = spin + (i / ROCK_VERTICES) * Math.PI * 2;
    const wobble = 1 + (rnd() - 0.5) * 2 * ROCK_WOBBLE;
    outline.push(vec2(
      spec.at.x + Math.cos(angle) * halfWidth * wobble,
      spec.at.y + Math.sin(angle) * halfHeight * wobble,
    ));
  }
  const baseY = spec.at.y + halfHeight;
  for (const p of outline) if (p.y > baseY) p.y = baseY;
  return { outline, size: spec.size, baseY, shore: spec.shore };
}

/**
 * Cắt đa giác bằng đường ngang `y = line` (Sutherland–Hodgman với một nửa mặt
 * phẳng): giữ phần `y ≤ line` (`keepAbove`) hoặc `y ≥ line`. Dùng để tách tảng ven
 * hồ theo mực nước mà không phải quét mask toàn framebuffer.
 */
export function clipHorizontal(points: readonly Vec2[], line: number, keepAbove: boolean): Vec2[] {
  const out: Vec2[] = [];
  const inside = (p: Vec2): boolean => (keepAbove ? p.y <= line : p.y >= line);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aIn = inside(a);
    const bIn = inside(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (line - a.y) / (b.y - a.y);
      out.push(vec2(a.x + (b.x - a.x) * t, line));
    }
  }
  return out;
}

/** Kiểu tô một tảng đá: 3 tông mềm, không viền (xem góp ý 25/11 trong `docs/algorithms.md`). */
export function stoneStyle(tone: StoneTones): ShapeStyle {
  return { fill: tone.fill, shade: tone.shade, highlight: tone.highlight };
}

/** Một viên sỏi: tâm, bán kính, tông màu (0 = `pathStone` sáng ... 1 = `stoneDark`) và alpha. */
export interface Pebble {
  readonly at: Vec2;
  readonly rx: number;
  readonly ry: number;
  readonly tone: number;
  readonly alpha: number;
}

/** Số viên sỏi (issue #20: 12–18) và số cụm rải dọc mép hồ. */
export const PEBBLE_COUNT = 16;
const PEBBLE_CLUSTERS = 5;

/**
 * 16 viên sỏi thành 5 cụm dọc mép hồ: mỗi cụm lấy một góc trên cung mép hồ rồi
 * rải các viên quanh đó, hệ số bán kính elip 0,72–1,06 nên có viên trong nước
 * nông, có viên trên bờ. Bỏ vị trí đè lên đá lớn. Cỡ và tông màu lệch ngẫu
 * nhiên nên sỏi không thành hàng lối.
 */
export function generatePebbles(seed = 2017): Pebble[] {
  const rnd = createRng(seed);
  const range = (a: number, b: number): number => a + (b - a) * rnd();
  const pebbles: Pebble[] = [];
  for (let i = 0; i < PEBBLE_COUNT; i++) {
    const cluster = i % PEBBLE_CLUSTERS;
    for (let attempt = 0; attempt < 300; attempt++) {
      // Góc cụm lệch trong ô của cụm và lệch tiếp một chút mỗi lần thử, để viên
      // bị đá lớn chặn vẫn tìm được chỗ khác trong cùng ô.
      const angle = Math.PI + ((cluster + range(0.05, 0.95)) / PEBBLE_CLUSTERS) * Math.PI + range(-0.14, 0.14);
      const factor = range(0.72, 1.06);
      const at = vec2(
        LAKE.cx + Math.cos(angle) * LAKE.rx * factor,
        LAKE.cy + Math.sin(angle) * LAKE.ry * factor,
      );
      if (BOULDERS.some((b) => Math.hypot(b.at.x - at.x, b.at.y - at.y) < b.size * 0.8)) continue;
      const rx = range(2.6, 6.4);
      pebbles.push({ at, rx, ry: rx * range(0.5, 0.85), tone: rnd(), alpha: range(0.4, 0.75) });
      break;
    }
  }
  return pebbles;
}

/** 8 tảng đá lớn (layer `ROCK`). */
export class Boulders implements SceneObject {
  readonly id = 'boulders';
  readonly name = 'Đá ven hồ';
  readonly description = 'Tám tảng đá bo tròn: bốn tảng ở mép nước (chìm một phần, có phản chiếu), bốn tảng trên cỏ.';
  readonly algorithms: readonly string[] = [
    'Scanline polygon fill (đa giác bo tròn nhiều đỉnh)',
    'Gộp khối bằng mask, tô 3 tông theo hướng sáng trên-phải',
    'Phép toán vùng: thân ∩/∖ nửa mặt phẳng dưới mực nước (tách phần chìm, phần nổi)',
    'Phản chiếu: lật thân qua mực nước, ép dọc, cắt xuống dưới mực nước',
    'Midpoint ellipse + alpha blending (bóng chân đá)',
  ];
  readonly layer = Layer.ROCK;
  readonly interactive = false;

  readonly specs: readonly BoulderSpec[];
  readonly shapes: readonly BoulderShape[];

  constructor(specs: readonly BoulderSpec[] = BOULDERS) {
    this.specs = specs;
    this.shapes = specs.map(boulderShape);
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    const tone = stoneTones(p);

    for (let i = 0; i < this.shapes.length; i++) {
      const spec = this.specs[i];
      const shape = this.shapes[i];

      if (shape.shore) {
        // Vệt phản chiếu: lật thân qua đường đáy (= mực nước cục bộ) rồi ép dọc.
        // Tô tối hơn nền nên đọc ra là bóng/phản chiếu, không phải tảng thứ hai;
        // lớp gần chân đậm hơn để vệt mờ dần theo chiều sâu.
        const topY = Math.min(...shape.outline.map((v) => v.y));
        const depth = (shape.baseY - topY) * REFLECT_SQUASH;
        const mirrored = shape.outline.map((v) => vec2(
          spec.at.x + (v.x - spec.at.x) * REFLECT_WIDTH,
          shape.baseY + (shape.baseY - v.y) * REFLECT_SQUASH,
        ));
        r.shape(r.mask().polygon(mirrored), { fill: withAlpha(tone.reflection, REFLECT_ALPHA) });
        const near = clipHorizontal(mirrored, shape.baseY + depth * REFLECT_FADE, true);
        if (near.length >= 3) {
          r.shape(r.mask().polygon(near), { fill: withAlpha(tone.reflection, REFLECT_NEAR_ALPHA) });
        }
        // Đường tiếp đất mảnh ngay dưới đáy: tảng "kê" trên bờ, không lơ lửng.
        r.ellipse(
          spec.at.x,
          shape.baseY + spec.size * 0.04,
          spec.size * 0.78,
          spec.size * 0.09,
          withAlpha(p.shadow, 0.6),
          true,
        );
      } else {
        // Bóng đổ dưới chân: elip alpha thấp, không viền.
        r.ellipse(
          spec.at.x + spec.size * 0.08,
          shape.baseY + spec.size * 0.07,
          spec.size * 0.8,
          spec.size * 0.2,
          p.shadow,
          true,
        );
      }

      r.shape(r.mask().polygon(shape.outline), stoneStyle(tone));
    }
  }
}

/** 16 viên sỏi ven bờ và trong nước nông (layer `ROCK`). */
export class Pebbles implements SceneObject {
  readonly id = 'pebbles';
  readonly name = 'Sỏi ven hồ';
  readonly description = 'Sỏi nhỏ rải thành cụm dọc mép hồ, có viên chìm trong nước nông.';
  readonly algorithms: readonly string[] = [
    'Midpoint ellipse (viên sỏi)',
    'Alpha blending (sỏi chìm trong nước)',
    'RNG có seed: rải theo cụm dọc cung elip, không theo lưới',
  ];
  readonly layer = Layer.ROCK;
  readonly interactive = false;

  readonly pebbles: readonly Pebble[];

  constructor(seed = 2017) {
    this.pebbles = generatePebbles(seed);
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    for (const pebble of this.pebbles) {
      // Tông sỏi: xám như đá lớn (pha thêm `pathStone` cho viên sáng), alpha nhẹ
      // để màu đất/nước lộ qua.
      const color = withAlpha(
        lerpColor(desaturate(p.stoneDark, 0.4), desaturate(p.pathStone, 0.5), 0.25 + 0.4 * pebble.tone),
        pebble.alpha,
      );
      r.ellipse(pebble.at.x, pebble.at.y, pebble.rx, pebble.ry, color, true);
    }
  }
}
