/**
 * Đá lớn ven hồ và sỏi (#20).
 *
 * Thuật toán dùng:
 * - **Scanline polygon fill**: mỗi tảng đá là một đa giác 6–8 cạnh, sinh một lần
 *   trong constructor bằng RNG có seed (không `Math.random` trong `draw`).
 * - **Gộp khối + tô 3 tông**: cả tảng vào một `Mask`, tô `stone`, tông tối
 *   `stoneDark` ở mép dưới-trái, tông sáng ở mép trên-phải, rồi viền `ink` 2 px
 *   theo biên của mask (không viền từng hình con).
 * - **Mặt đá (facet)**: hai đa giác phụ — mặt tối dưới-trái, mặt sáng trên-phải —
 *   cắt theo mask thân (clipping) và viền `inkSoft` 1 px. Nhờ vậy tảng đá đọc ra
 *   thành khối nhiều mặt, không phải một cục xám phẳng.
 * - **DDA**: highlight mảnh men theo cạnh trên.
 * - **Midpoint ellipse + alpha blending**: bóng đổ dưới chân, vũng nước nông
 *   quanh chân đá ven hồ, và 16 viên sỏi elip alpha nhẹ.
 *
 * Toạ độ world 1280×720; 8 tảng đặt đúng theo `docs/reference/layout.md`
 * (4 tảng ven hồ, 4 tảng tiền cảnh), cỡ 14–85 px.
 */
import { lerpColor, withAlpha, type RGBA } from '../../core/color.ts';
import type { Palette } from '../../core/palette.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { createRng } from '../../core/rng.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';

/** Hồ nước theo `layout.md`; hồ và gợn sóng do #13 vẽ, đá chỉ cần biết mép hồ. */
export const LAKE = { cx: 1010, cy: 590, rx: 300, ry: 66 } as const;

/** Hướng nguồn sáng dùng chung của cả cảnh: trên-phải (`docs/style-guide.md`). */
export const LIGHT_DIR: Vec2 = vec2(Math.SQRT1_2, -Math.SQRT1_2);

/** Một tảng đá: tâm chân, cỡ (nửa bề ngang lớn nhất) và seed hình dạng. */
export interface BoulderSpec {
  readonly at: Vec2;
  /** Cỡ, 14–85 world px. */
  readonly size: number;
  readonly seed: number;
  /** `true` nếu chân đá nằm trong nước nông (đá ven hồ). */
  readonly shore: boolean;
}

/**
 * 8 tảng đá của issue #20. Thứ tự: 4 tảng ven hồ (trái sang phải) rồi 4 tảng
 * tiền cảnh, để vẽ theo thứ tự này (xa trước, gần sau).
 */
export const BOULDERS: readonly BoulderSpec[] = [
  { at: vec2(735, 540), size: 62, seed: 2001, shore: true },
  { at: vec2(826, 526), size: 44, seed: 2002, shore: true },
  { at: vec2(1186, 506), size: 85, seed: 2003, shore: true },
  { at: vec2(1136, 526), size: 52, seed: 2004, shore: true },
  { at: vec2(300, 665), size: 78, seed: 2005, shore: false },
  { at: vec2(432, 660), size: 34, seed: 2006, shore: false },
  { at: vec2(495, 628), size: 18, seed: 2007, shore: false },
  { at: vec2(752, 692), size: 70, seed: 2008, shore: false },
];

/** Hình một tảng: biên ngoài, hai mặt đá và dải cạnh trên. */
export interface BoulderShape {
  readonly outline: readonly Vec2[];
  /** Mặt tối ở phía dưới-trái. */
  readonly darkFacet: readonly Vec2[];
  /** Mặt sáng ở phía trên-phải. */
  readonly lightFacet: readonly Vec2[];
  /** Các đỉnh liên tiếp men theo cạnh trên-phải (để kẻ highlight). */
  readonly topEdge: readonly Vec2[];
  /** Đường đáy (đá kê trên mặt đất/nước). */
  readonly baseY: number;
}

/** Bốn tông đá suy ra từ palette; không hardcode màu cảnh. */
export function stoneTones(p: Palette): {
  fill: RGBA;
  shade: RGBA;
  highlight: RGBA;
  lightFace: RGBA;
  darkFace: RGBA;
} {
  return {
    fill: p.stone,
    shade: p.stoneDark,
    highlight: lerpColor(p.stone, p.pathStone, 0.5),
    lightFace: lerpColor(p.stone, p.pathStone, 0.62),
    darkFace: lerpColor(p.stoneDark, p.stone, 0.18),
  };
}

/** Tâm của một danh sách đỉnh. */
function centroid(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return vec2(x / points.length, y / points.length);
}

/**
 * Hình một tảng đá: đa giác 6–8 cạnh, bán kính mỗi đỉnh lệch ngẫu nhiên theo
 * seed, đáy phẳng ở `at.y + 0,5·size` để đá "ngồi" trên đất.
 *
 * Hai mặt đá lấy từ dải đỉnh liên tiếp nghiêng về hai phía của hướng sáng rồi
 * thu nhỏ về tâm mặt (0,86 / 0,9), nên luôn nằm trong biên và chừa một dải nền
 * quanh khối.
 */
export function boulderShape(spec: BoulderSpec): BoulderShape {
  const rnd = createRng(spec.seed);
  const { at, size } = spec;
  const count = 6 + Math.floor(rnd() * 3); // 6–8 cạnh
  const spin = rnd() * Math.PI * 2;
  const outline: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = spin + (i / count) * Math.PI * 2 + (rnd() - 0.5) * (Math.PI / count) * 0.7;
    const radius = size * (0.74 + 0.26 * rnd());
    outline.push(vec2(at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius * 0.74));
  }
  const baseY = at.y + 0.5 * size;
  for (const p of outline) if (p.y > baseY) p.y = baseY;

  /**
   * Dải đỉnh liên tiếp quanh hướng `dir`: lấy đỉnh gần hướng đó nhất làm tâm,
   * mở ra hai phía trong ±`halfSpan`, và ép đủ `minCount` đỉnh (chọn phía gần
   * hướng `dir` hơn) để mặt đá luôn đủ 3 đỉnh dù đa giác 6–8 cạnh lệch góc.
   * `inset < 1` thu nhỏ dải về tâm mặt, chừa dải nền quanh khối; `inset = 1` giữ
   * nguyên để kẻ highlight men theo cạnh.
   */
  const run = (dir: Vec2, halfSpan: number, inset: number, minCount = 3): Vec2[] => {
    const baseAngle = Math.atan2(dir.y, dir.x);
    const delta = outline.map((p) => {
      let d = Math.atan2(p.y - at.y, p.x - at.x) - baseAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    });
    let start = 0;
    for (let i = 1; i < count; i++) if (Math.abs(delta[i]) < Math.abs(delta[start])) start = i;

    let before = 0;
    let after = 0;
    while (1 + before + after < count) {
      const nextAfter = (start + after + 1) % count;
      const nextBefore = (start - before - 1 + count * 2) % count;
      const insideAfter = Math.abs(delta[nextAfter]) <= halfSpan;
      const insideBefore = Math.abs(delta[nextBefore]) <= halfSpan;
      if (1 + before + after >= minCount && !insideAfter && !insideBefore) break;
      const closerAfter = Math.abs(delta[nextAfter]) <= Math.abs(delta[nextBefore]);
      if (insideAfter || (!insideBefore && closerAfter)) after++;
      else before++;
    }

    const chosen: Vec2[] = [];
    for (let k = before; k >= 1; k--) chosen.push(outline[(start - k + count * 2) % count]);
    chosen.push(outline[start]);
    for (let k = 1; k <= after; k++) chosen.push(outline[(start + k) % count]);
    if (inset === 1 || chosen.length < 3) return chosen;
    const c = centroid(chosen);
    return chosen.map((p) => vec2(c.x + (p.x - c.x) * inset, c.y + (p.y - c.y) * inset));
  };

  const dark = vec2(-LIGHT_DIR.x, -LIGHT_DIR.y);
  return {
    outline,
    darkFacet: run(dark, Math.PI * 0.5, 0.84),
    lightFacet: run(LIGHT_DIR, Math.PI * 0.5, 0.8),
    topEdge: run(vec2(0, -1), Math.PI * 0.3, 1, 2),
    baseY,
  };
}

/** Một viên sỏi: tâm, bán kính, tông màu (0 = `pathStone` sáng … 1 = `stoneDark`) và alpha. */
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
    const clusterAngle = Math.PI + ((cluster + 0.5 + range(-0.18, 0.18)) / PEBBLE_CLUSTERS) * Math.PI;
    for (let attempt = 0; attempt < 300; attempt++) {
      const angle = clusterAngle + range(-0.14, 0.14);
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
  readonly description = 'Tám tảng đá nhiều mặt: bốn tảng ven hồ, bốn tảng tiền cảnh.';
  readonly algorithms: readonly string[] = [
    'Scanline polygon fill (đa giác 6–8 cạnh)',
    'Gộp khối bằng mask, tô 3 tông theo hướng sáng trên-phải',
    'Mặt đá bằng đa giác phụ, cắt theo mask thân (clipping)',
    'Viền trong mask (outline mask) 2 px',
    'Midpoint ellipse + alpha blending (bóng chân đá, nước nông)',
    'DDA (highlight cạnh trên)',
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
      const size = spec.size;

      // Nước nông quanh chân đá ven hồ (hồ do #13 vẽ dưới lớp này).
      if (spec.shore) {
        r.ellipse(spec.at.x, shape.baseY, size * 0.88, size * 0.24, withAlpha(p.waterShallow, 0.35), true);
      }
      // Bóng đổ dưới chân: elip alpha thấp, không viền.
      r.ellipse(spec.at.x + size * 0.08, shape.baseY + size * 0.07, size * 0.8, size * 0.2, p.shadow, true);

      // Thân đá: một mask cho cả tảng, tô 3 tông + viền `ink` 2 px.
      const body = r.mask();
      body.polygon(shape.outline);
      r.shape(body, {
        fill: tone.fill,
        shade: tone.shade,
        highlight: tone.highlight,
        outline: p.ink,
        outlineWidth: 2,
      });

      // Hai mặt đá vẽ bằng đa giác phụ, cắt trong mask thân.
      if (shape.darkFacet.length >= 3) {
        const facet = r.mask();
        facet.polygon(shape.darkFacet);
        r.shape(facet, { fill: tone.darkFace, outline: p.inkSoft, outlineWidth: 1, clip: body });
      }
      if (shape.lightFacet.length >= 3) {
        const facet = r.mask();
        facet.polygon(shape.lightFacet);
        r.shape(facet, { fill: tone.lightFace, outline: p.inkSoft, outlineWidth: 1, clip: body });
      }

      // Highlight mảnh men theo cạnh trên-phải.
      if (shape.topEdge.length >= 2) r.polyline(shape.topEdge, tone.lightFace, 1.4);
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
      // Tông sỏi pha giữa `pathStone` và `stoneDark`, alpha nhẹ để màu đất/nước lộ qua.
      const color = withAlpha(lerpColor(p.pathStone, p.stoneDark, 0.35 + 0.5 * pebble.tone), pebble.alpha);
      r.ellipse(pebble.at.x, pebble.at.y, pebble.rx, pebble.ry, color, true);
    }
  }
}
