import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { Framebuffer } from '../src/core/framebuffer.ts';
import { mat3Apply } from '../src/core/mat3.ts';
import { DAY, NIGHT, type Palette } from '../src/core/palette.ts';
import { FB_H, FB_W } from '../src/core/config.ts';
import { withAlpha } from '../src/core/color.ts';
import { Renderer } from '../src/core/renderer.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import { pathPolygon } from '../src/scene/midground/path.ts';
import { RESERVED_RIGHT_X } from '../src/scene/foreground/ground.ts';
import { bladePolygon } from '../src/scene/foreground/grass.ts';
import {
  BOULDERS,
  HOVER_MAX_LEAN,
  HOVER_RADIUS,
  LAKE,
  PEBBLE_COUNT,
  REFLECT_ALPHA,
  REFLECT_NEAR_ALPHA,
  REFLECT_SQUASH,
  REED_CLUSTERS,
  REED_DAMPING,
  REED_STIFFNESS,
  REED_SWAY_SPEED,
  ROCK_ASPECT,
  ROCK_VERTICES,
  ROCK_WOBBLE,
  Boulders,
  Pebbles,
  Reeds,
  boulderShape,
  clipHorizontal,
  createRocks,
  desaturate,
  generatePebbles,
  lakeEdgeY,
  stoneTones,
} from '../src/scene/rocks/index.ts';
import type { Env, SceneObject } from '../src/scene/types.ts';

const CAMERA = new Camera();

function makeEnv(palette: Palette = DAY, pointer: Vec2 | null = null): Env {
  return {
    time: 0,
    dt: 1 / 60,
    dayPhase: palette === NIGHT ? 1 : 0,
    palette,
    camera: CAMERA,
    pointer,
  };
}

/** Chạy `frames` khung 1/60 giây, giữ con trỏ cố định; trả `Env` ở khung cuối. */
function run(obj: SceneObject, env: Env, frames: number, pointer: Vec2 | null = null): Env {
  let time = env.time;
  for (let i = 0; i < frames; i++) {
    time += 1 / 60;
    obj.update?.({ ...env, time, dt: 1 / 60, pointer });
  }
  return { ...env, time, pointer };
}

/** Lay theo gió mà lá `i` phải bám theo ở thời điểm `time`. */
function ambientAt(reeds: Reeds, time: number, i: number): number {
  const blade = reeds.blades[i];
  return blade.sway * Math.sin(time * REED_SWAY_SPEED + blade.phase);
}

const bbox = (pts: readonly Vec2[]) => ({
  x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
});

/** Điểm trong đa giác (even-odd). */
function inside(p: Vec2, poly: readonly Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Hai mép lối đi tại hàng `y` (world px), hoặc `null` nếu hàng không cắt lối đi. */
function pathEdges(y: number): { left: number; right: number } | null {
  const path = pathPolygon();
  let left: number | null = null;
  let right: number | null = null;
  for (let x = 0; x < 1280; x++) {
    if (inside(vec2(x, y), path)) {
      if (left === null) left = x;
      right = x;
    }
  }
  return left === null ? null : { left, right: right as number };
}

const SHORE = BOULDERS.filter((b) => b.shore);
const FOREGROUND = BOULDERS.filter((b) => !b.shore);

describe('hình học đá theo layout.md', () => {
  it('đủ 8 tảng: 4 ven hồ đúng hoành độ layout, 4 tiền cảnh', () => {
    expect(BOULDERS).toHaveLength(8);
    expect(SHORE.map((b) => b.at.x)).toEqual([735, 826, 1186, 1136]);
    expect(FOREGROUND.map((b) => b.at.x)).toEqual([870, 930, 1090, 1210]);
    expect(FOREGROUND.map((b) => b.at.y)).toEqual([674, 692, 700, 684]);
  });

  it('cỡ mỗi tảng trong 14–85 px, có cả tảng lớn và tảng nhỏ', () => {
    for (const b of BOULDERS) {
      expect(b.size).toBeGreaterThanOrEqual(14);
      expect(b.size).toBeLessThanOrEqual(85);
    }
    expect(Math.min(...BOULDERS.map((b) => b.size))).toBeLessThanOrEqual(30);
    expect(Math.max(...BOULDERS.map((b) => b.size))).toBeGreaterThanOrEqual(80);
  });

  it('mỗi tảng là đa giác bo tròn nhiều đỉnh, đáy phẳng ở at.y + cỡ·ROCK_ASPECT', () => {
    for (const spec of BOULDERS) {
      const shape = boulderShape(spec);
      expect(shape.outline).toHaveLength(ROCK_VERTICES);
      expect(shape.size).toBe(spec.size);
      const halfWidth = spec.size;
      const halfHeight = spec.size * ROCK_ASPECT;
      // Mọi đỉnh nằm sát elip nửa rộng `size` × nửa cao `size·ROCK_ASPECT` (lệch ±ROCK_WOBBLE)
      for (const p of shape.outline) {
        const t = Math.hypot((p.x - spec.at.x) / halfWidth, (p.y - spec.at.y) / halfHeight);
        expect(t).toBeGreaterThanOrEqual(1 - ROCK_WOBBLE - 1e-9);
        expect(t).toBeLessThanOrEqual(1 + ROCK_WOBBLE + 1e-9);
      }
      // Không có đỉnh nào lồi ra ngoài ±1,1 lần cỡ (đá không nhọn)
      const b = bbox(shape.outline);
      expect(b.x1 - b.x0).toBeGreaterThanOrEqual(1.5 * spec.size);
      expect(b.x1 - b.x0).toBeLessThanOrEqual(2 * spec.size * (1 + ROCK_WOBBLE) + 1e-6);
      // Đáy phẳng: không đỉnh nào thấp hơn đường đáy
      expect(shape.baseY).toBeCloseTo(spec.at.y + halfHeight, 9);
      expect(Math.max(...shape.outline.map((p) => p.y))).toBeLessThanOrEqual(shape.baseY + 1e-9);
      expect(shape.outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    }
  });

  it('không còn mặt vát: hình chỉ có biên ngoài (một dải đỉnh liền mạch)', () => {
    // Đa giác lồi đều đặn ⇒ mọi đỉnh đều là đỉnh của biên, không đỉnh nào nằm
    // trong (không có đa giác phụ kiểu "mặt đá" của bản đầu)
    for (const spec of BOULDERS) {
      const shape = boulderShape(spec);
      const angles = shape.outline.map((p) => Math.atan2(p.y - spec.at.y, p.x - spec.at.x));
      const sorted = [...angles].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(0);
    }
  });

  it('cắt đa giác theo đường ngang: giữ đúng nửa trên/nửa dưới, thêm đỉnh ở mép', () => {
    const square = [vec2(0, 0), vec2(10, 0), vec2(10, 10), vec2(0, 10)];
    const top = clipHorizontal(square, 4, true);
    const bottom = clipHorizontal(square, 4, false);
    expect(top.every((p) => p.y <= 4)).toBe(true);
    expect(bottom.every((p) => p.y >= 4)).toBe(true);
    // Mỗi nửa là tứ giác: hai đỉnh gốc + hai giao điểm trên đường cắt
    expect(top).toHaveLength(4);
    expect(bottom).toHaveLength(4);
    expect(top.filter((p) => p.y === 4)).toHaveLength(2);
    // Đường cắt ngoài đa giác: một nửa rỗng, nửa kia giữ nguyên
    expect(clipHorizontal(square, -5, true)).toHaveLength(0);
    expect(clipHorizontal(square, -5, false)).toEqual(square);
  });

  it('tảng ven hồ kê đúng mép nước: mép dưới trùng mực nước, không cắt nửa chừng', () => {
    for (const spec of SHORE) {
      const shape = boulderShape(spec);
      expect(shape.shore).toBe(true);
      // Mép dưới = mực nước tại hoành độ tảng (đá nằm trên bờ, nước chạm chân)
      expect(shape.baseY).toBeCloseTo(lakeEdgeY(spec.at.x), 9);
      // Cả thân nằm trên mực nước: không đỉnh nào chìm dưới mực nước
      expect(Math.max(...shape.outline.map((p) => p.y))).toBeLessThanOrEqual(shape.baseY + 1e-9);
      expect(shape.baseY).toBeGreaterThan(LAKE.cy - LAKE.ry);
    }
    for (const spec of FOREGROUND) {
      const shape = boulderShape(spec);
      expect(shape.shore).toBe(false);
      // Trên cỏ: không có mực nước, đáy là mặt đất
      expect(shape.baseY).toBe(spec.at.y + spec.size * ROCK_ASPECT);
    }
  });

  it('cùng seed cho cùng hình; khác seed cho hình khác', () => {
    const a = boulderShape(BOULDERS[0]);
    expect(boulderShape({ ...BOULDERS[0], at: vec2(BOULDERS[0].at.x, BOULDERS[0].at.y) })).toEqual(a);
    expect(boulderShape({ ...BOULDERS[0], seed: 999 })).not.toEqual(a);
  });
});

describe('tông đá', () => {
  it('xám trung tính: bỏ bớt độ bão hoà của `stone`, không ngả hồng/be', () => {
    const day = stoneTones(DAY);
    expect(day.fill).toBe(desaturate(DAY.stone, 0.4));
    expect(day.fill).not.toBe(DAY.stone);
    // Khoảng cách kênh đỏ–lam thu lại ⇒ bớt ngả hồng/be
    const spread = (c: number): number => ((c >>> 24) & 0xff) - ((c >>> 8) & 0xff);
    expect(Math.abs(spread(day.fill))).toBeLessThan(Math.abs(spread(DAY.stone)));
    // Ba tông xếp đúng thứ tự sáng dần: shade < fill < highlight
    const lum = (c: number): number => (((c >>> 24) & 0xff) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
    expect(lum(day.shade)).toBeLessThan(lum(day.fill));
    expect(lum(day.highlight)).toBeGreaterThan(lum(day.fill));
    // Mọi tông đều suy từ palette: đổi palette ⇒ đổi tông, không hardcode
    const night = stoneTones(NIGHT);
    for (const key of ['fill', 'shade', 'highlight', 'reflection'] as const) {
      expect(night[key]).not.toBe(day[key]);
    }
  });
});

describe('sỏi', () => {
  it('16 viên (12–18) ven bờ và trong nước nông, không đè lên đá lớn', () => {
    const pebbles = generatePebbles();
    expect(pebbles).toHaveLength(PEBBLE_COUNT);
    expect(PEBBLE_COUNT).toBeGreaterThanOrEqual(12);
    expect(PEBBLE_COUNT).toBeLessThanOrEqual(18);
    for (const s of pebbles) {
      // Hệ số bán kính elip hồ: 0,72–1,06 ⇒ nước nông hoặc sát mép bờ
      const factor = Math.hypot((s.at.x - LAKE.cx) / LAKE.rx, (s.at.y - LAKE.cy) / LAKE.ry);
      expect(factor).toBeGreaterThanOrEqual(0.7);
      expect(factor).toBeLessThanOrEqual(1.1);
      expect(s.at.y).toBeLessThan(LAKE.cy);
      expect(s.rx).toBeGreaterThan(0);
      expect(s.ry).toBeLessThan(s.rx);
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
      expect(s.tone).toBeGreaterThanOrEqual(0);
      expect(s.tone).toBeLessThan(1);
      for (const b of BOULDERS) {
        expect(Math.hypot(b.at.x - s.at.x, b.at.y - s.at.y)).toBeGreaterThanOrEqual(b.size * 0.8);
      }
    }
  });

  it('không rải đều như lưới: khoảng cách tới viên gần nhất lệch nhau rõ', () => {
    const pebbles = generatePebbles();
    const nearest = pebbles.map((s, i) => Math.min(...pebbles.map((o, j) =>
      i === j ? Infinity : Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y))));
    const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length;
    const spread = Math.sqrt(nearest.reduce((a, b) => a + (b - mean) ** 2, 0) / nearest.length);
    expect(spread).toBeGreaterThan(0);
    expect(spread / mean).toBeGreaterThan(0.2);
  });

  it('cùng seed cho cùng danh sách', () => {
    expect(generatePebbles(5)).toEqual(generatePebbles(5));
    expect(generatePebbles(5)).not.toEqual(generatePebbles(6));
  });
});

describe('lau sậy (bụi lá)', () => {
  it('2 bụi ở bờ trái/phải hồ, 9–10 lá dài 55–100 px xoè thành quạt', () => {
    expect(REED_CLUSTERS).toHaveLength(2);
    const clusters = new Reeds().clusters;
    expect(clusters).toHaveLength(2);
    // Hai bụi nép vào hai mép hồ (bán kính elip hồ ≤ 1,05)
    for (const cluster of clusters) {
      expect(Math.hypot((cluster.base.x - LAKE.cx) / LAKE.rx, (cluster.base.y - LAKE.cy) / LAKE.ry))
        .toBeLessThan(1.05);
      expect(cluster.blades.length).toBeGreaterThanOrEqual(9);
      expect(cluster.blades.length).toBeLessThanOrEqual(10);
      for (const blade of cluster.blades) {
        expect(blade.height).toBeGreaterThanOrEqual(55);
        expect(blade.height).toBeLessThanOrEqual(100);
        expect(blade.width).toBeGreaterThanOrEqual(6);
      }
      // Quạt: lá ngoài cùng nghiêng ra xa, lá giữa gần như thẳng
      const bends = cluster.blades.map((b) => b.bend);
      expect(Math.max(...bends)).toBeGreaterThan(8);
      expect(Math.min(...bends)).toBeLessThan(-8);
      expect(Math.abs(Math.min(...bends.map(Math.abs)))).toBeLessThan(10);
    }
    expect(clusters[0].base.x).toBeLessThan(clusters[1].base.x);
  });

  it('lá thon nhọn: chân lá rộng, ngọn là một điểm', () => {
    const blade = new Reeds().blades[0];
    const poly = bladePolygon(blade, 5);
    // 2·samples đỉnh bên + 1 đỉnh ngọn (thon nhọn, không phải hình chữ nhật)
    expect(poly).toHaveLength(11);
    // Chân lá rộng đúng `width`: hai đỉnh đầu (trái, phải) cách nhau `width`
    expect(poly[10].x - poly[0].x).toBeCloseTo(blade.width, 6);
    expect(poly[0].y).toBeCloseTo(poly[10].y, 6);
    const tip = poly[5];
    expect(tip.x).toBeCloseTo(blade.bend, 6);
    expect(tip.y).toBeCloseTo(-blade.height, 6);
    // Ngọn nhọn: hai đỉnh cuối hai bên cách nhau dưới 1/4 bề rộng chân
    expect(Math.abs(poly[6].x - poly[4].x)).toBeLessThan(blade.width / 4);
  });

  it('lay theo gió quanh gốc: gốc đứng yên, góc bám biên độ · sin(ωt + φ)', () => {
    const reeds = new Reeds();
    let env = makeEnv(DAY);
    let maxAngle = 0;
    let maxTip = 0;
    for (let f = 0; f < 600; f++) {
      env = run(reeds, env, 1);
      const blade = reeds.blades[0];
      const tip = mat3Apply(reeds.nodes[0].worldMatrix(), vec2(blade.bend, -blade.height));
      maxTip = Math.max(maxTip, Math.hypot(tip.x - (blade.base.x + blade.bend), tip.y - (blade.base.y - blade.height)));
      for (let i = 0; i < reeds.blades.length; i++) maxAngle = Math.max(maxAngle, Math.abs(reeds.angleOf(i)));
    }
    // Biên độ lay lớn nhất của mọi lá là 0,055 rad ⇒ ngọn dời vài px
    expect(maxAngle).toBeGreaterThan(0.04);
    expect(maxTip).toBeGreaterThan(1);
    // Gốc lá không dời: xoay quanh gốc
    reeds.blades.forEach((blade, i) => {
      const base = mat3Apply(reeds.nodes[i].worldMatrix(), vec2(0, 0));
      expect(base.x).toBeCloseTo(blade.base.x, 6);
      expect(base.y).toBeCloseTo(blade.base.y, 6);
      // Lò xo bám sát hình sin của gió
      expect(Math.abs(reeds.angleOf(i) - ambientAt(reeds, env.time, i))).toBeLessThan(0.012);
    });
  });

  it('con trỏ bên phải ⇒ ngả phải, bên trái ⇒ ngả trái, không quá góc tối đa', () => {
    for (const side of [1, -1] as const) {
      const reeds = new Reeds();
      const blade = reeds.blades[0];
      const env = run(reeds, makeEnv(DAY), 120, vec2(blade.base.x + side * 30, blade.base.y - 50));
      expect(Math.sign(reeds.angleOf(0))).toBe(side);
      expect(Math.abs(reeds.angleOf(0))).toBeGreaterThan(0.05);
      expect(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0))).toBeLessThanOrEqual(HOVER_MAX_LEAN);
      // Lá ở xa con trỏ cũng ngả cùng hướng nhưng ít hơn
      const far = reeds.blades[reeds.blades.length - 1];
      if (Math.hypot(far.base.x - blade.base.x, far.base.y - blade.base.y) > 120) {
        expect(Math.abs(reeds.angleOf(reeds.blades.length - 1))).toBeLessThan(Math.abs(reeds.angleOf(0)));
      }
    }
  });

  it('con trỏ ngoài bán kính ảnh hưởng thì chỉ còn lay theo gió', () => {
    const reeds = new Reeds();
    const blade = reeds.blades[0];
    const env = run(reeds, makeEnv(DAY), 120, vec2(blade.base.x + HOVER_RADIUS + 40, blade.base.y));
    expect(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0))).toBeLessThan(0.012);
  });

  it('bỏ con trỏ: phản ứng tắt dần rồi về đúng trạng thái cũ', () => {
    const reeds = new Reeds();
    const blade = reeds.blades[0];
    const held = run(reeds, makeEnv(DAY), 120, vec2(blade.base.x + 24, blade.base.y - 40));
    const leaned = reeds.angleOf(0) - ambientAt(reeds, held.time, 0);
    expect(leaned).toBeGreaterThan(0.05);

    const deviation: number[] = [];
    let env = held;
    for (let i = 0; i < 300; i++) {
      env = run(reeds, env, 1, null);
      deviation.push(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0)));
    }
    // Tắt dần: biên độ đầu khung lớn, 2 giây sau đã nhỏ, cuối cùng về ~0
    expect(Math.max(...deviation.slice(0, 30))).toBeGreaterThan(0.03);
    expect(Math.max(...deviation.slice(120, 150))).toBeLessThan(Math.max(...deviation.slice(0, 30)));
    expect(Math.max(...deviation.slice(-60))).toBeLessThan(0.02);
  });

  it('lò xo có dao động tắt dần (cản < 2√k), không lệch vĩnh viễn', () => {
    expect(REED_DAMPING).toBeLessThan(2 * Math.sqrt(REED_STIFFNESS));
    const reeds = new Reeds();
    const blade = reeds.blades[0];
    let env = run(reeds, makeEnv(DAY), 120, vec2(blade.base.x + 20, blade.base.y - 30));
    // Nhả chuột: độ lệch đổi dấu ít nhất một lần (dao động) rồi tắt
    let crossings = 0;
    for (let i = 0; i < 300; i++) {
      const before = reeds.angleOf(0) - ambientAt(reeds, env.time, 0);
      env = run(reeds, env, 1, null);
      const after = reeds.angleOf(0) - ambientAt(reeds, env.time, 0);
      if (before > 0 !== after > 0) crossings++;
    }
    expect(crossings).toBeGreaterThan(0);
  });
});

describe('draw()', () => {
  /** Renderer giả ghi lại thứ tự lệnh vẽ; trả mảng thao tác. */
  const recorder = (styles: Record<string, unknown>[], ops: string[]): Renderer => ({
    mask: () => {
      const m = {
        polygon: () => m, ellipse: () => m, circle: () => m,
        union: () => m, intersect: () => { ops.push('set-op'); return m; },
        subtract: () => { ops.push('set-op'); return m; },
        clear: () => m, isEmpty: () => false,
      };
      return m;
    },
    shape: (_m: unknown, style: Record<string, unknown>) => {
      styles.push(style);
      ops.push(style.clip ? 'clip' : 'shape');
    },
    ellipse: () => { ops.push('ellipse'); },
    polygon: () => { ops.push('polygon'); },
    line: () => { ops.push('line'); },
    polyline: () => { ops.push('polyline'); },
  } as unknown as Renderer);

  it('đá: tô 3 tông, không viền `ink`; tảng ven hồ có vệt phản chiếu + đường tiếp đất', () => {
    for (const palette of [DAY, NIGHT]) {
      const tone = stoneTones(palette);
      const styles: Record<string, unknown>[] = [];
      const ops: string[] = [];
      new Boulders().draw(recorder(styles, ops), makeEnv(palette));
      // Không tảng nào có viền mực: bản đầu viền `ink` dày làm đá như viên đá quý
      for (const style of styles) expect(style.outline).toBeUndefined();
      // Mỗi tảng một lượt tô thân 3 tông, rồi một lượt mảng tối mềm
      const filled = styles.filter((s) => s.fill === tone.fill);
      expect(filled).toHaveLength(BOULDERS.length);
      for (const style of filled) {
        expect(style.shade).toBe(tone.shade);
        expect(style.highlight).toBe(tone.highlight);
      }
      // Ven hồ: hai lớp phản chiếu (cả vệt mờ + phần gần chân đậm hơn)
      const reflections = styles.filter((s) => (s.fill as number) >>> 8 === tone.reflection >>> 8);
      expect(reflections).toHaveLength(2 * SHORE.length);
      const alphas = new Set(reflections.map((s) => (s.fill as number) & 0xff));
      expect(alphas).toEqual(new Set([
        withAlpha(tone.reflection, REFLECT_ALPHA) & 0xff,
        withAlpha(tone.reflection, REFLECT_NEAR_ALPHA) & 0xff,
      ]));
      // Mỗi tảng một elip: bóng chân (trên cỏ) hoặc đường tiếp đất (ven hồ)
      expect(ops.filter((o) => o === 'ellipse')).toHaveLength(BOULDERS.length);
      // Không còn đa giác phụ bị cắt trong thân (mặt vát của bản đầu)
      expect(ops.filter((o) => o === 'clip')).toHaveLength(0);
      // Không dùng phép toán vùng trên mask (quét cả framebuffer): tách theo mực
      // nước bằng cắt đa giác hình học
      expect(ops.filter((o) => o === 'set-op')).toHaveLength(0);
    }
  });

  it('phản chiếu lật qua đường đáy và ngắn hơn thân: vệt nằm dưới chân đá', () => {
    const shape = boulderShape(SHORE[0]);
    const top = Math.min(...shape.outline.map((p) => p.y));
    const mirrored = shape.baseY + (shape.baseY - top) * REFLECT_SQUASH;
    expect(mirrored).toBeGreaterThan(shape.baseY);
    expect(mirrored).toBeLessThan(shape.baseY + (shape.baseY - top));
  });

  it('vệt phản chiếu tối hơn nền: đá không "bay lơ lửng" (góp ý 25/11)', () => {
    for (const palette of [DAY, NIGHT]) {
      const tone = stoneTones(palette);
      const lum = (c: number): number =>
        (((c >>> 24) & 0xff) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
      expect(lum(tone.reflection)).toBeLessThan(lum(tone.fill));
      expect(lum(tone.reflection)).toBeLessThan(lum(palette.waterShallow));
      expect(lum(tone.reflection)).toBeLessThan(lum(palette.ground));
    }
  });

  it('sỏi vẽ bằng elip alpha < 255 theo palette', () => {
    const alphas: number[] = [];
    const colors: number[] = [];
    const r = {
      ellipse: (_x: number, _y: number, _rx: number, _ry: number, color: number) => {
        alphas.push(color & 0xff);
        colors.push(color);
      },
    };
    new Pebbles().draw(r as unknown as Renderer, makeEnv(DAY));
    expect(alphas).toHaveLength(PEBBLE_COUNT);
    expect(alphas.every((a) => a > 0 && a < 255)).toBe(true);
    expect(new Set(colors).size).toBeGreaterThan(4);
    const nightColors: number[] = [];
    new Pebbles().draw({
      ellipse: (_x: number, _y: number, _rx: number, _ry: number, color: number) => { nightColors.push(color); },
    } as unknown as Renderer, makeEnv(NIGHT));
    expect(nightColors[0] & 0xffffff00).not.toBe(colors[0] & 0xffffff00);
  });

  it('sậy: mỗi lá một đa giác tô + viền, không còn thân nét dày hay bông tròn', () => {
    const ops: string[] = [];
    const reeds = new Reeds();
    const r = {
      ellipse: () => { ops.push('shadow'); },
      line: () => { ops.push('line'); },
      mask: () => { ops.push('mask'); return {}; },
      polygon: (_pts: readonly Vec2[], _c: number, filled?: boolean) => {
        ops.push(filled ? 'fill' : 'outline');
      },
      shape: () => { ops.push('shape'); },
    };
    reeds.draw(r as unknown as Renderer, makeEnv(DAY));
    // Một bóng cho mỗi bụi, rồi mỗi lá một lượt tô + một lượt viền
    expect(ops.filter((o) => o === 'shadow')).toHaveLength(reeds.clusters.length);
    expect(ops.filter((o) => o === 'fill')).toHaveLength(reeds.blades.length);
    expect(ops.filter((o) => o === 'outline')).toHaveLength(reeds.blades.length);
    // Không dùng nét dày DDA (thân tre của bản đầu) và không có mask/bông
    expect(ops.filter((o) => o === 'line')).toHaveLength(0);
    expect(ops.filter((o) => o === 'mask')).toHaveLength(0);
    expect(ops.filter((o) => o === 'shape')).toHaveLength(0);
  });

  it('ngọn lá vẽ ra toạ độ lệch theo hướng con trỏ', () => {
    const tipXs = (pointer: Vec2): number[] => {
      const reeds = new Reeds();
      const env = run(reeds, makeEnv(DAY), 120, pointer);
      const xs: number[] = [];
      const r = {
        ellipse: () => {},
        polygon: (pts: readonly Vec2[]) => { for (const p of pts) xs.push(p.x); },
      };
      reeds.draw(r as unknown as Renderer, { ...env, pointer });
      // Chỉ lấy bụi bên trái (bụi phải nằm ngoài bán kính ảnh hưởng của con trỏ)
      return xs.filter((x) => x < 1000);
    };
    const blade = new Reeds().blades[0];
    const right = tipXs(vec2(blade.base.x + 40, blade.base.y - 60));
    const left = tipXs(vec2(blade.base.x - 40, blade.base.y - 60));
    expect(Math.max(...right)).toBeGreaterThan(Math.max(...left));
    expect(Math.min(...left)).toBeLessThan(Math.min(...right));
  });
});

describe('renderer thật: pixel theo palette ngày/đêm', () => {
  const camera = new Camera();
  const render = (palette: Palette, draw: (r: Renderer, env: Env) => void): Framebuffer => {
    const fb = new Framebuffer(FB_W, FB_H);
    const r = new Renderer(fb, camera);
    r.begin(palette.skyBottom);
    draw(r, makeEnv(palette));
    return fb;
  };
  /** Hộp bao world → hộp bao pixel framebuffer. */
  const screenBox = (box: { x0: number; x1: number; y0: number; y1: number }) => {
    const a = camera.worldToScreen(vec2(box.x0, box.y0));
    const b = camera.worldToScreen(vec2(box.x1, box.y1));
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  };
  const countColor = (fb: Framebuffer, color: number, area: { x0: number; x1: number; y0: number; y1: number }): number => {
    let count = 0;
    for (let y = Math.floor(area.y0); y <= Math.ceil(area.y1); y++) {
      for (let x = Math.floor(area.x0); x <= Math.ceil(area.x1); x++) if (fb.getPixel(x, y) === color) count++;
    }
    return count;
  };
  const pixel = (fb: Framebuffer, p: Vec2): number => {
    const s = camera.worldToScreen(p);
    return fb.getPixel(s.x, s.y);
  };
  const big = BOULDERS.reduce((a, b) => (b.size > a.size ? b : a));

  it('đá tô tông xám suy từ `stone`/`stoneDark` của palette đang dùng, không hardcode', () => {
    const area = screenBox(bbox(boulderShape(big).outline));
    const day = render(DAY, (r, env) => new Boulders().draw(r, env));
    const dayTone = stoneTones(DAY);
    expect(countColor(day, dayTone.fill, area)).toBeGreaterThan(300);
    expect(countColor(day, dayTone.shade, area)).toBeGreaterThan(10);
    // Màu của palette bên kia không xuất hiện
    expect(countColor(day, NIGHT.stone, area)).toBe(0);
    // Đá không ngả hồng/be: tông nền xám hơn màu `stone` gốc
    expect(countColor(day, DAY.stone, area)).toBe(0);

    const night = render(NIGHT, (r, env) => new Boulders().draw(r, env));
    expect(countColor(night, stoneTones(NIGHT).fill, area)).toBeGreaterThan(300);
    expect(countColor(night, DAY.stone, area)).toBe(0);
    expect(night.data).not.toEqual(day.data);
  });

  it('tảng ven hồ: dưới chân là vệt phản chiếu tối hơn nền, không tràn ra xa', () => {
    const fb = render(DAY, (r, env) => new Boulders().draw(r, env));
    const shore = SHORE[0];
    const shape = boulderShape(shore);
    const halfHeight = shore.size * ROCK_ASPECT;
    const bgLum = (((DAY.skyBottom >>> 24) & 0xff) + ((DAY.skyBottom >>> 16) & 0xff) + ((DAY.skyBottom >>> 8) & 0xff)) / 3;
    const lum = (c: number): number => (((c >>> 24) & 0xff) + ((c >>> 16) & 0xff) + ((c >>> 8) & 0xff)) / 3;
    // Ngay dưới chân: có vệt phản chiếu và nó **tối hơn** nền (không phải tảng sáng thứ hai)
    const near = pixel(fb, vec2(shore.at.x, shape.baseY + 0.3 * halfHeight));
    expect(near).not.toBe(DAY.skyBottom);
    expect(lum(near)).toBeLessThan(bgLum);
    // Xa dưới chân (quá vệt phản chiếu): không vẽ gì
    expect(pixel(fb, vec2(shore.at.x, shape.baseY + 3 * halfHeight))).toBe(DAY.skyBottom);
  });

  it('tảng trên cỏ có bóng chân làm pixel quanh chân đá khác nền', () => {
    const fb = render(DAY, (r, env) => new Boulders().draw(r, env));
    const grass = FOREGROUND[0];
    const shape = boulderShape(grass);
    const shadow = pixel(fb, vec2(grass.at.x, shape.baseY + 3));
    expect(shadow).not.toBe(DAY.skyBottom);
  });

  it('sỏi và sậy vẽ pixel thật, đổi theo palette ngày/đêm', () => {
    const draw = (r: Renderer, env: Env): void => {
      new Pebbles().draw(r, env);
      new Reeds().draw(r, env);
    };
    const day = render(DAY, draw);
    const night = render(NIGHT, draw);

    // Sỏi: pixel ở tâm viên sỏi là màu sỏi trộn với nền, khác nhau giữa ngày và đêm
    const pebble = new Pebbles().pebbles[0];
    expect(pixel(day, pebble.at)).not.toBe(DAY.skyBottom);
    expect(pixel(day, pebble.at)).not.toBe(pixel(night, pebble.at));

    // Sậy: vùng quanh bụi trái có pixel khác nền trời
    const blades = new Reeds().clusters[0].blades;
    const area = screenBox(bbox(blades.flatMap((b) => [b.base, vec2(b.base.x + b.bend, b.base.y - b.height)])));
    const total = (area.x1 - area.x0 + 1) * (area.y1 - area.y0 + 1);
    expect(total - countColor(day, DAY.skyBottom, area)).toBeGreaterThan(200);
    const blade = blades[0];
    const mid = vec2(blade.base.x + blade.bend / 2, blade.base.y - blade.height / 2);
    expect(pixel(day, mid)).not.toBe(DAY.skyBottom);
    expect(pixel(day, mid)).not.toBe(pixel(night, mid));
  });
});

describe('ràng buộc bố cục', () => {
  it('đá không che cá bơi: không tảng nào chồng lên quỹ đạo elip của cá', () => {
    // Cá bơi theo elip tâm (1010, 600), rx 220, ry 36 (layout.md, #21)
    const shapes = BOULDERS.map(boulderShape);
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const p = vec2(1010 + Math.cos(a) * 220, 600 + Math.sin(a) * 36);
      for (let k = 0; k < shapes.length; k++) {
        expect(inside(p, shapes[k].outline), `tảng ${BOULDERS[k].at.x},${BOULDERS[k].at.y}`).toBe(false);
      }
    }
  });

  it('đá tiền cảnh không lấn lối đi (#16): cả bốn tảng nằm phải mép phải lối đi', () => {
    const path = pathPolygon();
    for (const spec of FOREGROUND) {
      const shape = boulderShape(spec);
      expect(shape.outline.some((p) => inside(p, path)), `${spec.at.x},${spec.at.y}`).toBe(false);
      const edges = pathEdges(spec.at.y);
      expect(edges, `${spec.at.x},${spec.at.y}`).not.toBeNull();
      expect(Math.min(...shape.outline.map((p) => p.x)))
        .toBeGreaterThan((edges as { right: number }).right);
    }
    // Trường hợp cũ (752, 692) đúng là nằm trong lối đi — test này giữ lý do dời đá
    const old = boulderShape({ at: vec2(752, 692), size: 46, seed: 2005, shore: false });
    expect(Math.min(...old.outline.map((p) => p.x))).toBeLessThan(
      (pathEdges(692) as { right: number }).right,
    );
  });

  it('đá tiền cảnh ra khỏi vùng hoa cỏ (#17): không tảng nào lấn qua RESERVED_RIGHT_X', () => {
    for (const spec of FOREGROUND) {
      const b = bbox(boulderShape(spec).outline);
      expect(b.x0, `${spec.at.x},${spec.at.y}`).toBeGreaterThanOrEqual(RESERVED_RIGHT_X);
    }
    // Toạ độ cũ trong layout.md (300, 665) nằm giữa vùng hoa cỏ — lý do phải dời
    const old = boulderShape({ at: vec2(300, 665), size: 78, seed: 2005, shore: false });
    expect(bbox(old.outline).x0).toBeLessThan(RESERVED_RIGHT_X);
  });

  it('đá và sậy nằm dưới cầu: layer ROCK (12) < BRIDGE (13)', () => {
    for (const o of createRocks()) expect(o.layer).toBeLessThan(13);
  });
});

describe('vật thể trong cảnh', () => {
  it('createRocks trả về sỏi, đá, sậy — cùng layer ROCK, đều không tương tác', () => {
    const objects = createRocks();
    expect(objects.map((o) => o.id)).toEqual(['pebbles', 'boulders', 'reeds']);
    for (const o of objects) {
      expect(o.layer).toBe(12);
      expect(o.interactive).toBe(false);
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(0);
      expect(o.algorithms.length).toBeGreaterThanOrEqual(3);
    }
  });
});
