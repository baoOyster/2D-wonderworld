import { describe, expect, it } from 'vitest';
import { pack, unpack } from '../src/core/color.ts';
import { mat3Apply } from '../src/core/mat3.ts';
import { DAY, NIGHT } from '../src/core/palette.ts';
import { vec2 } from '../src/core/vec2.ts';
import { Layer } from '../src/scene/layers.ts';
import {
  FLOWER_CLUSTERS, Flowers, PATH_SIDE_FLOWERS, PETAL_COLORS, SCATTERED_FLOWERS, generateFlowers, petalCircles, petalColor, saturate, stemLocal,
} from '../src/scene/foreground/flowers.ts';
import {
  GROUND_TOP, RESERVED_RIGHT_X, ROOT_ZONE, isFreeGround, pointInPolygon,
} from '../src/scene/foreground/ground.ts';
import {
  Grass, ROOT_TUFTS, bladePolygon, depthScale, generateGrass,
} from '../src/scene/foreground/grass.ts';
import { createForeground } from '../src/scene/foreground/index.ts';
import { Meadow, meadowOrder } from '../src/scene/foreground/meadow.ts';
import { pathPolygon } from '../src/scene/midground/path.ts';
import type { Palette } from '../src/core/palette.ts';
import type { Renderer, ShapeStyle, WorldMask } from '../src/core/renderer-types.ts';
import type { Vec2 } from '../src/core/vec2.ts';

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

describe('vùng đất trống (ground.ts)', () => {
  it('loại lối đi, trên chân trời, vùng rễ và phần đất chừa bên phải', () => {
    const path = pathPolygon();
    const onPath = path[Math.floor(path.length / 4)];
    expect(isFreeGround(onPath.x - 20, onPath.y + 5), 'lối đi').toBe(false);
    expect(isFreeGround(100, GROUND_TOP - 10), 'trời').toBe(false);
    expect(isFreeGround((ROOT_ZONE.x0 + ROOT_ZONE.x1) / 2, ROOT_ZONE.y1 - 5), 'rễ').toBe(false);
    expect(isFreeGround(RESERVED_RIGHT_X + 50, 650), 'chừa cho hồ/cầu').toBe(false);
    expect(isFreeGround(450, 500), 'gò đất nhà nấm').toBe(false);
    expect(isFreeGround(100, 650), 'bãi cỏ trái').toBe(true);
  });

  it('margin mở rộng vùng kiểm tra', () => {
    // (695, 520): giữa mép phải gò đất và phần đất chừa, phía trên lối đi
    expect(isFreeGround(RESERVED_RIGHT_X - 5, 520)).toBe(true);
    expect(isFreeGround(RESERVED_RIGHT_X - 5, 520, 10)).toBe(false);
  });

  it('pointInPolygon theo even-odd', () => {
    const sq = [vec2(0, 0), vec2(10, 0), vec2(10, 10), vec2(0, 10)];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
});

describe('hoa (#17)', () => {
  const flowers = generateFlowers();

  it('đủ cụm trái, bông ven lối đi và bông rải rác', () => {
    const clustered = FLOWER_CLUSTERS.reduce((s, c) => s + c.count, 0);
    expect(flowers.length).toBe(clustered + PATH_SIDE_FLOWERS.length + SCATTERED_FLOWERS);
  });

  it('cụm trái nằm đúng vùng layout.md', () => {
    const c = FLOWER_CLUSTERS[0];
    const inCluster = flowers.filter((f) => f.base.x >= c.x0 && f.base.x <= c.x1 && f.base.y >= c.y0 && f.base.y <= c.y1);
    expect(inCluster.length).toBeGreaterThanOrEqual(c.count);
  });

  it('không bông nào mọc bên phải phần đất chừa cho hồ và cầu', () => {
    for (const f of flowers) expect(f.base.x).toBeLessThan(RESERVED_RIGHT_X);
  });

  it('bông rải rác nằm trên cỏ trống và không bị rễ che', () => {
    const fixed = new Set(PATH_SIDE_FLOWERS.map((p) => `${p.x},${p.y}`));
    const c = FLOWER_CLUSTERS[0];
    const scattered = flowers.filter((f) => !fixed.has(`${f.base.x},${f.base.y}`)
      && !(f.base.x >= c.x0 && f.base.x <= c.x1 && f.base.y >= c.y0 && f.base.y <= c.y1));
    expect(scattered.length).toBeGreaterThanOrEqual(SCATTERED_FLOWERS);
    for (const f of scattered) {
      expect(isFreeGround(f.base.x, f.base.y, 14)).toBe(true);
      if (f.base.x < ROOT_ZONE.x1 + 10) expect(f.base.y - 60).toBeGreaterThanOrEqual(ROOT_ZONE.y1);
    }
  });

  it('kích thước 8–18, 5–6 cánh, biên độ lay 0.02–0.04 rad', () => {
    for (const f of flowers) {
      expect(f.size).toBeGreaterThanOrEqual(8);
      expect(f.size).toBeLessThanOrEqual(18);
      expect([5, 6]).toContain(f.petals);
      expect(f.sway).toBeGreaterThanOrEqual(0.02);
      expect(f.sway).toBeLessThanOrEqual(0.04);
      expect(f.leaves.length === 1 || f.leaves.length === 2).toBe(true);
    }
  });

  it('không dùng chung một hình: đủ cả 4 màu hoa của palette, nhiều kích thước và pha', () => {
    const colors = new Set(flowers.map((f) => f.color));
    for (const c of ['red', 'yellow', 'blue', 'purple'] as const) expect(colors.has(c)).toBe(true);
    expect(colors.size).toBeGreaterThanOrEqual(6);
    expect(new Set(flowers.map((f) => f.size)).size).toBeGreaterThan(3);
    expect(new Set(flowers.map((f) => f.phase.toFixed(3))).size).toBe(flowers.length);
  });

  it('cùng seed cho cùng vườn hoa, khác seed cho vườn khác', () => {
    expect(generateFlowers(1701)).toEqual(generateFlowers(1701));
    expect(generateFlowers(42)).not.toEqual(generateFlowers(1701));
  });

  it('cánh hoa xếp đều quanh nhụy, mép cánh chạm bán kính bông', () => {
    const f = flowers[0];
    const head = vec2(f.lean, -f.height);
    const petals = petalCircles(f);
    expect(petals.length).toBe(f.petals);
    for (const p of petals) {
      const d = Math.hypot(p.c.x - head.x, p.c.y - head.y);
      expect(d + p.r).toBeCloseTo(f.size);
    }
  });

  it('thân hoa đi từ gốc (0,0) lên tới đầu hoa', () => {
    const f = flowers[0];
    const s = stemLocal(f);
    expect(s[0].x).toBeCloseTo(0);
    expect(s[0].y).toBeCloseTo(0);
    expect(s[s.length - 1].x).toBeCloseTo(f.lean);
    expect(s[s.length - 1].y).toBeCloseTo(-f.height);
  });

  it('lay quanh gốc: gốc đứng yên, đầu hoa dịch, góc trong biên độ', () => {
    const obj = new Flowers();
    for (const t of [0, 0.7, 1.9, 5]) {
      obj.update({ ...env(DAY, t) });
      obj.nodes.forEach((n, i) => {
        const f = obj.specs[i];
        expect(Math.abs(n.transform.rotation)).toBeLessThanOrEqual(f.sway + 1e-9);
        const base = mat3Apply(n.worldMatrix(), vec2(0, 0));
        expect(base.x).toBeCloseTo(f.base.x);
        expect(base.y).toBeCloseTo(f.base.y);
      });
    }
  });

  it('màu cánh lấy từ palette; trắng kem giữ nguyên, các màu khác rực hơn ban ngày', () => {
    expect(petalColor(DAY, 'white')).toBe(DAY.mushroomSpot);
    expect(petalColor(NIGHT, 'white', 1)).toBe(NIGHT.mushroomSpot);
    for (const c of PETAL_COLORS) expect(petalColor(DAY, c, 0)).not.toBe(petalColor(NIGHT, c, 1));
    expect(petalColor(DAY, 'red', 0)).toBe(saturate(DAY.flowerRed, 1.45));
  });

  it('saturate giữ màu xám và alpha, kẹp kênh trong 0…255', () => {
    const gray = pack(100, 100, 100, 200);
    expect(saturate(gray, 2)).toBe(gray);
    const c = unpack(saturate(pack(250, 10, 128, 255), 3));
    expect(c.r).toBe(255);
    expect(c.g).toBe(0);
    expect(c.a).toBe(255);
  });

  it('khai báo SceneObject đúng layer, không tương tác', () => {
    const f = new Flowers();
    expect(f.layer).toBe(Layer.FLOWER);
    expect(f.interactive).toBe(false);
  });
});

describe('cỏ (#17)', () => {
  const tufts = generateGrass();
  const grass = new Grass();

  it('250–350 lá cỏ', () => {
    expect(grass.bladeCount).toBeGreaterThanOrEqual(250);
    expect(grass.bladeCount).toBeLessThanOrEqual(350);
  });

  it('khóm rải rác trên cỏ trống, bụi chân rễ đúng vị trí', () => {
    const roots = new Set(ROOT_TUFTS.map((p) => `${p.x},${p.y}`));
    for (const t of tufts) {
      if (roots.has(`${t.base.x},${t.base.y}`)) continue;
      expect(isFreeGround(t.base.x, t.base.y, 10)).toBe(true);
    }
    expect(tufts.filter((t) => roots.has(`${t.base.x},${t.base.y}`)).length).toBe(ROOT_TUFTS.length);
  });

  it('khóm trải khắp bãi cỏ trái, không dồn một dải', () => {
    const scattered = tufts.filter((t) => !ROOT_TUFTS.some((p) => p.x === t.base.x && p.y === t.base.y));
    const ys = scattered.map((t) => t.base.y);
    const xs = scattered.map((t) => t.base.x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(150);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(500);
  });

  it('không có lá lơ lửng: gốc lá nằm ở hoặc dưới gốc khóm', () => {
    for (const t of tufts) for (const b of t.blades) expect(b.root.y).toBeGreaterThanOrEqual(0);
  });

  it('khóm xa nhỏ hơn khóm gần', () => {
    expect(depthScale(470)).toBeCloseTo(0.55);
    expect(depthScale(720)).toBeCloseTo(1.2);
    for (let y = 480; y <= 720; y += 20) expect(depthScale(y)).toBeGreaterThan(depthScale(y - 20));
  });

  it('lá cỏ thon nhọn: ngọn là một điểm, chân rộng bằng width', () => {
    const b = tufts[0].blades[0];
    const pts = bladePolygon(b);
    const tip = pts[(pts.length - 1) / 2];
    expect(tip.x).toBeCloseTo(b.root.x + b.bend);
    expect(tip.y).toBeCloseTo(b.root.y - b.height);
    expect(pts[pts.length - 1].x - pts[0].x).toBeCloseTo(b.width);
  });

  it('khóm đứng ngay trước một bông không cao tới đầu hoa', () => {
    for (const t of tufts) {
      const sc = depthScale(t.base.y);
      for (const f of generateFlowers()) {
        if (t.base.y <= f.base.y) continue;
        const headBottom = f.base.y - f.height + f.size + 3;
        const overlapX = t.base.x - 22 * sc < f.base.x + f.lean + f.size + 3 && t.base.x + 22 * sc > f.base.x + f.lean - f.size - 3;
        if (overlapX) expect(t.base.y - 34 * sc).toBeGreaterThanOrEqual(headBottom);
      }
    }
  });

  it('mỗi khóm có pha lay riêng, góc trong biên độ', () => {
    expect(new Set(tufts.map((t) => t.phase.toFixed(4))).size).toBe(tufts.length);
    grass.update(env(DAY, 3.3));
    grass.nodes.forEach((n, i) => expect(Math.abs(n.transform.rotation)).toBeLessThanOrEqual(tufts[i].sway + 1e-9));
  });

  it('cùng seed cho cùng bãi cỏ', () => {
    expect(generateGrass(1702)).toEqual(generateGrass(1702));
  });
});

describe('bãi hoa cỏ vẽ theo độ sâu (meadow.ts)', () => {
  it('thứ tự vẽ theo y gốc tăng dần và đủ mọi hoa, khóm', () => {
    const m = new Meadow();
    const ys = m.order.map((it) => it.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
    expect(m.order.filter((it) => it.kind === 'flower').length).toBe(m.flowers.specs.length);
    expect(m.order.filter((it) => it.kind === 'tuft').length).toBe(m.grass.tufts.length);
  });

  it('vật mọc phía trên vẽ trước vật mọc phía dưới (hoa và cỏ xen kẽ)', () => {
    const m = new Meadow();
    const order = meadowOrder(m.flowers, m.grass);
    const kinds = order.map((it) => it.kind);
    // Có ít nhất một chỗ cỏ nằm giữa hai bông, tức là hai loại thật sự xen nhau
    const firstFlower = kinds.indexOf('flower');
    const lastFlower = kinds.lastIndexOf('flower');
    expect(kinds.slice(firstFlower, lastFlower).includes('tuft')).toBe(true);
  });

  it('draw gọi hoa và cỏ đúng thứ tự độ sâu', () => {
    const m = new Meadow();
    const seq: string[] = [];
    const df = m.flowers.drawFlower.bind(m.flowers);
    const dt = m.grass.drawTuft.bind(m.grass);
    m.flowers.drawFlower = (r, p, i, ph) => { seq.push(`flower:${i}`); df(r, p, i, ph); };
    m.grass.drawTuft = (r, p, i) => { seq.push(`tuft:${i}`); dt(r, p, i); };
    const { r } = mockRenderer();
    m.draw(r, env(DAY));
    expect(seq).toEqual(m.order.map((it) => `${it.kind}:${it.index}`));
  });

  it('createForeground trả một vật thể layer FLOWER, không tương tác', () => {
    const objs = createForeground();
    expect(objs.length).toBe(1);
    expect(objs[0].layer).toBe(Layer.FLOWER);
    expect(objs[0].interactive).toBe(false);
  });

  it('vẽ được cả ngày lẫn đêm', () => {
    for (const [p, ph] of [[DAY, 0], [NIGHT, 1]] as const) {
      const { r, calls } = mockRenderer();
      new Meadow().draw(r, env(p, 1, ph));
      expect(calls.length).toBeGreaterThan(0);
    }
  });
});
