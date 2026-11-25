import { describe, expect, it } from 'vitest';
import { mat3Apply } from '../src/core/mat3.ts';
import { DAY, NIGHT } from '../src/core/palette.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import { FENCE_SEGMENTS, Fence } from '../src/scene/midground/fence.ts';
import { createMidground } from '../src/scene/midground/index.ts';
import {
  DOOR, HOUSE_DROP, HOUSE_SHIFT, MOUND, STEP_COUNT, STEP_DX, STEP_ORIGIN, STEP_W,
} from '../src/scene/midground/mushroom-house.ts';
import {
  GardenPath, PATH_END, PATH_LEFT, PATH_RIGHT, PATH_START, pathCenter, pathPolygon, pathStones, pathWidth,
} from '../src/scene/midground/path.ts';
import { pointInPolygon as pip } from '../src/scene/midground/tree.ts';
import type { Palette } from '../src/core/palette.ts';
import type { Renderer, ShapeStyle, WorldMask } from '../src/core/renderer-types.ts';

// --- Renderer giả: ghi lại lệnh vẽ, không vẽ gì -----------------------------
/** Một lệnh vẽ đã ghi lại. */
type Call = { op: string; args: unknown[] };

/** Mask giả: ghi các hình con đã thêm. */
interface MockMask extends WorldMask {
  prims: { kind: string; pts?: readonly Vec2[]; c?: [number, number, number, number] }[];
}

/**
 * Renderer giả đủ `interface Renderer`: không vẽ gì, chỉ ghi lại lệnh để test
 * kiểm tra thứ tự, số lượng và màu.
 */
function mockRenderer(): { r: Renderer; calls: Call[]; masks: MockMask[] } {
  const calls: Call[] = [];
  const masks: MockMask[] = [];
  const mask = (): MockMask => {
    const m: MockMask = {
      prims: [],
      polygon(pts) { m.prims.push({ kind: 'polygon', pts }); return m; },
      ellipse(cx, cy, rx, ry) { m.prims.push({ kind: 'ellipse', c: [cx, cy, rx, ry] }); return m; },
      circle(cx, cy, r) { m.prims.push({ kind: 'circle', c: [cx, cy, r, r] }); return m; },
      union() { return m; },
      intersect() { return m; },
      subtract() { return m; },
      clear() { m.prims = []; return m; },
      isEmpty() { return m.prims.length === 0; },
    };
    masks.push(m);
    return m;
  };
  const rec = (op: string) => (...args: unknown[]): void => { calls.push({ op, args }); };
  const r: Renderer = {
    begin: rec('begin'),
    line: rec('line'),
    polyline: rec('polyline'),
    circle: rec('circle'),
    ellipse: rec('ellipse'),
    polygon: rec('polygon'),
    floodFill: rec('floodFill'),
    text: rec('text'),
    mask,
    shape: (m: WorldMask, style: ShapeStyle) => { calls.push({ op: 'shape', args: [m, style] }); },
  };
  return { r, calls, masks };
}

/** Env tối thiểu cho draw/update. */
function env(palette: Palette, time = 1, dayPhase = 0) {
  return { time, dt: 1 / 60, dayPhase, palette, camera: {} as never };
}

/** Điểm trong đa giác (dùng hàm của cây). */
const pointInPolygon = (x: number, y: number, poly: readonly Vec2[]): boolean => pip(vec2(x, y), poly);

/** Gò đất theo toạ độ world (sau khi hạ và dịch nhà). */
const MOUND_W: Vec2[] = MOUND.map((p) => vec2(p.x + HOUSE_SHIFT, p.y + HOUSE_DROP));
const MOUND_TOP = Math.min(...MOUND_W.map((p) => p.y));
const MOUND_BOTTOM = Math.max(...MOUND_W.map((p) => p.y));

/** Mép trái/phải của gò tại độ cao y (gò là hình thang). */
function moundEdgesAt(y: number): { left: number; right: number } {
  const t = (y - MOUND_TOP) / (MOUND_BOTTOM - MOUND_TOP);
  const [tl, tr, br, bl] = MOUND_W;
  return { left: tl.x + (bl.x - tl.x) * t, right: tr.x + (br.x - tr.x) * t };
}

describe('hàng rào (#16)', () => {
  it('2 đoạn, cùng chiều cao, chân rào nằm giữa mặt trên và chân gò', () => {
    expect(FENCE_SEGMENTS.length).toBe(2);
    expect(FENCE_SEGMENTS[0].height).toBe(FENCE_SEGMENTS[1].height);
    for (const s of FENCE_SEGMENTS) {
      for (const p of [s.from, s.to]) {
        expect(p.y).toBeGreaterThan(MOUND_TOP);
        expect(p.y).toBeLessThan(MOUND_BOTTOM);
      }
    }
  });

  it('mọi trụ đứng trên gò, không trụ nào ra ngoài mép gò', () => {
    const f = new Fence();
    for (const { posts } of f.segments) {
      for (const n of posts) {
        const foot = mat3Apply(n.worldMatrix(), vec2(0, 0));
        const e = moundEdgesAt(foot.y);
        expect(foot.x - 5).toBeGreaterThanOrEqual(e.left);
        expect(foot.x + 5).toBeLessThanOrEqual(e.right);
      }
    }
  });

  it('đoạn trái dừng trước cửa, đoạn phải bắt đầu sau bậc thềm cuối', () => {
    const [left, right] = FENCE_SEGMENTS;
    expect(left.to.x).toBeLessThan(DOOR.x0 + HOUSE_SHIFT);
    const lastStepRight = STEP_ORIGIN.x + (STEP_COUNT - 1) * STEP_DX + STEP_W + HOUSE_SHIFT;
    expect(right.from.x).toBeGreaterThan(lastStepRight);
  });

  it('trụ cao thấp khác nhau nhẹ (≤ 6%), không random giữa các lần tạo', () => {
    const a = new Fence();
    const b = new Fence();
    a.segments.forEach((seg, i) => seg.posts.forEach((n, k) => {
      expect(n.transform.scaleY).toBe(b.segments[i].posts[k].transform.scaleY);
      expect(n.transform.scaleY / seg.seg.height).toBeGreaterThanOrEqual(0.88);
      expect(n.transform.scaleY / seg.seg.height).toBeLessThanOrEqual(1);
    }));
  });

  it('trụ gộp một mask mỗi đoạn, tô 3 tông + viền', () => {
    const { r, calls } = mockRenderer();
    new Fence().draw(r, env(DAY));
    const shapes = calls.filter((c) => c.op === 'shape');
    expect(shapes.length).toBe(FENCE_SEGMENTS.length);
    for (const s of shapes) {
      const style = s.args[1] as { fill: number; shade?: number; highlight?: number; outline?: number };
      expect(style.fill).toBe(DAY.fence);
      expect(style.shade).toBe(DAY.fenceDark);
      expect(style.outline).toBe(DAY.ink);
    }
  });
});

describe('lối đi (#16)', () => {
  const poly = pathPolygon();

  it('mép trên lối đi nằm đúng chân gò, nối khớp gò đất', () => {
    expect(PATH_START.y).toBe(MOUND_BOTTOM);
    expect(Math.min(...poly.map((p) => p.y))).toBeGreaterThanOrEqual(MOUND_BOTTOM - 0.001);
    const top = poly.filter((p) => Math.abs(p.y - MOUND_BOTTOM) < 0.5);
    expect(top.length).toBeGreaterThanOrEqual(2);
  });

  it('chỗ nối rộng hơn bậc thềm nhưng nằm trong khoảng giữa hai đoạn rào', () => {
    const lastStepLeft = STEP_ORIGIN.x + (STEP_COUNT - 1) * STEP_DX + HOUSE_SHIFT;
    expect(PATH_LEFT).toBeLessThan(lastStepLeft);
    expect(PATH_RIGHT).toBeGreaterThan(lastStepLeft + STEP_W);
    expect(PATH_LEFT).toBeGreaterThan(FENCE_SEGMENTS[0].to.x);
    expect(PATH_RIGHT).toBeLessThan(FENCE_SEGMENTS[1].to.x + 6);
  });

  it('rộng dần về tiền cảnh', () => {
    for (let i = 1; i <= 10; i++) expect(pathWidth(i / 10)).toBeGreaterThan(pathWidth((i - 1) / 10));
  });

  it('đầu cuối nằm hẳn dưới khung hình: cả mép cuối bị khung cắt', () => {
    expect(PATH_END.y).toBeGreaterThan(720);
    const n = poly.length / 2;
    // Điểm cuối của mép trái và đầu mép phải (sau reverse) là mép cuối lối đi
    expect(poly[n - 1].y).toBeGreaterThan(720);
    expect(poly[n].y).toBeGreaterThan(720);
  });

  it('mép phải là một đường thẳng từ đầu rào phải xuống mép dưới', () => {
    const n = poly.length / 2;
    const edge = poly.slice(0, n);
    const a = edge[0];
    const b = edge[edge.length - 1];
    expect(a.x).toBeCloseTo(PATH_RIGHT);
    for (const p of edge) {
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.01);
    }
  });

  it('đường giữa đi chéo xuống bên phải', () => {
    const a = pathCenter(0);
    const b = pathCenter(1);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('phiến đá cố định theo seed và nằm trong lối đi', () => {
    expect(pathStones()).toEqual(pathStones());
    for (const s of pathStones()) {
      expect(pointInPolygon(s.x, s.y, poly)).toBe(true);
    }
  });

  it('vẽ thân lối đi và phiến đá bằng 2 mask', () => {
    const { r, calls } = mockRenderer();
    new GardenPath().draw(r, env(DAY));
    expect(calls.filter((c) => c.op === 'shape').length).toBe(2);
  });
});

describe('createMidground', () => {
  it('tạo cây, nhà, rào, lối đi với layer tăng dần', () => {
    const objs = createMidground();
    expect(objs.map((o) => o.id)).toEqual(['tree', 'house', 'fence', 'path']);
    for (let i = 1; i < objs.length; i++) expect(objs[i].layer).toBeGreaterThan(objs[i - 1].layer);
  });

  it('id không trùng và mọi vật vẽ được cả ngày lẫn đêm', () => {
    const objs = createMidground();
    expect(new Set(objs.map((o) => o.id)).size).toBe(objs.length);
    for (const o of objs) {
      for (const [p, ph] of [[DAY, 0], [NIGHT, 1]] as const) {
        const { r, calls } = mockRenderer();
        o.update?.(env(p, 2, ph));
        o.draw(r, env(p, 2, ph));
        expect(calls.length).toBeGreaterThan(0);
      }
    }
  });
});
