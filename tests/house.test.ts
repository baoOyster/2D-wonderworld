import { describe, expect, it } from 'vitest';
import { DAY, NIGHT } from '../src/core/palette.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import { Layer } from '../src/scene/layers.ts';
import {
  DOOR, DOOR_MIN_WIDTH_LOSS, DOOR_SWING_TIME, HOUSE_BASE, HOUSE_DROP, HOUSE_SHIFT, MOUND, MushroomHouse, STEP_COUNT, STEP_DX, STEP_DY, STEP_H, STEP_ORIGIN, STEP_W, stepPolygon,
} from '../src/scene/midground/mushroom-house.ts';
import { pointInPolygon as pip } from '../src/scene/midground/tree.ts';
import type { RGBA } from '../src/core/color.ts';
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

/** Mọi màu (RGBA) xuất hiện trong các lệnh vẽ, kể cả trong ShapeStyle. */
function colorsUsed(calls: readonly Call[]): RGBA[] {
  const out: RGBA[] = [];
  for (const c of calls) {
    if (c.op === 'shape') {
      const s = c.args[1] as ShapeStyle;
      for (const k of ['fill', 'shade', 'highlight', 'outline'] as const) if (s[k] !== undefined) out.push(s[k] as RGBA);
    } else {
      for (const a of c.args) if (typeof a === 'number' && a > 0xffff && Number.isInteger(a)) out.push(a);
    }
  }
  return out;
}

/** So màu bỏ qua kênh alpha. */
const sameRgb = (a: RGBA, b: RGBA): boolean => (a >>> 8) === (b >>> 8);

/** Khung bao của tập điểm. */
const bbox = (pts: readonly Vec2[]) => ({
  x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
});

/** Env tối thiểu cho draw/update. */
function env(palette: Palette, time = 1, dayPhase = 0) {
  return { time, dt: 1 / 60, dayPhase, palette, camera: {} as never };
}

/** Điểm trong đa giác (dùng hàm của cây). */
const pointInPolygon = (x: number, y: number, poly: readonly Vec2[]): boolean => pip(vec2(x, y), poly);

describe('nhà nấm (#15)', () => {
  it('khai báo SceneObject đúng layer, có tương tác', () => {
    const h = new MushroomHouse();
    expect(h.id).toBe('house');
    expect(h.layer).toBe(Layer.HOUSE);
    expect(h.interactive).toBe(true);
    expect(h.algorithms.length).toBeGreaterThan(0);
  });

  it('cả nhà hạ xuống HOUSE_DROP và dịch phải HOUSE_SHIFT qua Node gốc', () => {
    const h = new MushroomHouse();
    expect(h.root.transform.x).toBe(HOUSE_BASE.x + HOUSE_SHIFT);
    expect(h.root.transform.y).toBe(HOUSE_BASE.y + HOUSE_DROP);
  });

  it('4 bậc thềm bằng nhau, lệch đều nhau, bậc cuối chạm chân gò', () => {
    expect(STEP_COUNT).toBe(4);
    for (let i = 0; i < STEP_COUNT; i++) {
      const b = bbox(stepPolygon(i));
      expect(b.x1 - b.x0).toBeCloseTo(STEP_W);
      expect(b.y1 - b.y0).toBeCloseTo(STEP_H);
      expect(b.x0).toBeCloseTo(STEP_ORIGIN.x + i * STEP_DX);
      expect(b.y0).toBeCloseTo(STEP_ORIGIN.y + i * STEP_DY);
    }
    const last = bbox(stepPolygon(STEP_COUNT - 1));
    const moundBottomLocal = Math.max(...MOUND.map((p) => p.y));
    expect(Math.abs(last.y1 - moundBottomLocal)).toBeLessThanOrEqual(2);
  });

  it('bậc thềm bắt đầu ngay dưới cửa', () => {
    expect(STEP_ORIGIN.x).toBeGreaterThanOrEqual(DOOR.x0);
    expect(STEP_ORIGIN.x).toBeLessThan(DOOR.x1);
  });

  it('cửa mở trong DOOR_SWING_TIME giây khi bấm, bấm lần nữa thì đóng', () => {
    const h = new MushroomHouse();
    expect(h.doorOpenAmount).toBe(0);
    h.onClick();
    const steps = Math.ceil(DOOR_SWING_TIME * 60);
    for (let i = 0; i < steps - 2; i++) h.update({ time: i / 60, dt: 1 / 60 });
    expect(h.doorOpenAmount).toBeGreaterThan(0.9);
    expect(h.doorOpenAmount).toBeLessThan(1);
    for (let i = 0; i < 5; i++) h.update({ time: 1, dt: 1 / 60 });
    expect(h.doorOpenAmount).toBe(1);
    expect(h.doorHinge.transform.scaleX).toBeCloseTo(1 - DOOR_MIN_WIDTH_LOSS);
    h.toggleDoor();
    for (let i = 0; i < steps + 2; i++) h.update({ time: 2, dt: 1 / 60 });
    expect(h.doorOpenAmount).toBe(0);
    expect(h.doorHinge.transform.scaleX).toBeCloseTo(1);
  });

  it('cửa mở nhanh như nhau dù máy vẽ chậm (dt lớn)', () => {
    const h = new MushroomHouse();
    h.toggleDoor();
    h.update({ time: 0, dt: DOOR_SWING_TIME / 2 });
    expect(h.doorOpenAmount).toBeCloseTo(0.5);
    h.update({ time: 0, dt: DOOR_SWING_TIME });
    expect(h.doorOpenAmount).toBe(1);
  });

  it('vùng bấm phủ thân, gò, bậc thềm và mũ nấm', () => {
    const h = new MushroomHouse();
    const polys = h.hitPolygons();
    expect(polys.length).toBe(2 + STEP_COUNT + 1);
    const hit = (x: number, y: number): boolean => polys.some((p) => pointInPolygon(x, y, p));
    expect(hit(DOOR.x0 + HOUSE_SHIFT + 20, DOOR.yBottom + HOUSE_DROP - 20), 'cửa').toBe(true);
    expect(hit(430 + HOUSE_SHIFT, 260 + HOUSE_DROP), 'mũ nấm').toBe(true);
    expect(hit(1200, 100), 'trời').toBe(false);
  });

  it('khói ống khói chỉ có ban ngày', () => {
    const smokeCount = (palette: typeof DAY, dayPhase: number): number => {
      const { r, calls } = mockRenderer();
      new MushroomHouse().draw(r, env(palette, 1.3, dayPhase));
      return calls.filter((c) => c.op === 'circle' && sameRgb(c.args[3] as number, palette.cloud)).length;
    };
    expect(smokeCount(DAY, 0)).toBeGreaterThan(0);
    expect(smokeCount(NIGHT, 1)).toBe(0);
  });

  it('cửa sổ ban ngày không trùng màu trời', () => {
    const { r, calls } = mockRenderer();
    new MushroomHouse().draw(r, env(DAY));
    const used = colorsUsed(calls);
    for (const sky of [DAY.skyTop, DAY.skyMid, DAY.skyBottom]) {
      expect(used.some((c) => sameRgb(c, sky))).toBe(false);
    }
  });
});
