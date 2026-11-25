import { describe, expect, it } from 'vitest';
import { DAY, NIGHT } from '../src/core/palette.ts';
import { mat3Apply } from '../src/core/mat3.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import {
  AncientTree, BRANCHES, CANOPY, CROWN_PIVOT, HOLLOW, HOLLOW_SEED, ROOTS, SWAY_AMPLITUDE, SWAY_STEP, TRUNK, TWIGS,
  clusterLobes, pointInPolygon, taperedPolygon,
  type ShapeStyle, type TreeMask, type TreeRenderer,
} from '../src/scene/midground/tree.ts';
import { createMidground } from '../src/scene/midground/index.ts';

type Call = { op: string; args: unknown[] };

/** Renderer giả: ghi lại các lệnh vẽ để kiểm tra thứ tự và tham số. */
function mockRenderer(): { r: TreeRenderer; calls: Call[] } {
  const calls: Call[] = [];
  const mask = (): TreeMask => {
    const m: TreeMask & { prims: unknown[] } = {
      prims: [],
      polygon(pts) { m.prims.push(['poly', pts.length]); return m; },
      circle(cx, cy, r) { m.prims.push(['circle', cx, cy, r]); return m; },
    };
    return m;
  };
  const r: TreeRenderer = {
    line: (...args) => { calls.push({ op: 'line', args }); },
    polygon: (...args) => { calls.push({ op: 'polygon', args }); },
    circle: (...args) => { calls.push({ op: 'circle', args }); },
    floodFill: (...args) => { calls.push({ op: 'floodFill', args }); },
    mask,
    shape: (m: TreeMask, style: ShapeStyle) => { calls.push({ op: 'shape', args: [(m as unknown as { prims: unknown[] }).prims, style] }); },
  };
  return { r, calls };
}

const bbox = (pts: readonly Vec2[]) => ({
  x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
});

describe('hình học cây cổ thụ theo layout.md', () => {
  it('thân lệch trái, x ≈ 160…365, từ chỗ chẻ cành (y ≈ 120) xuống gốc', () => {
    const b = bbox(TRUNK);
    expect(b.x0).toBeGreaterThanOrEqual(155);
    expect(b.x1).toBeLessThanOrEqual(370);
    expect(b.y0).toBeLessThanOrEqual(125);
    expect(b.y1).toBeLessThanOrEqual(505);
  });

  it('rễ lan đều hai bên quanh trục thân x = 262 và không vươn cao', () => {
    const xs = ROOTS.flatMap((r) => r.path.map((p) => p.x));
    const left = 262 - Math.min(...xs);
    const right = Math.max(...xs) - 262;
    expect(Math.abs(left - right)).toBeLessThanOrEqual(10);
    for (const root of ROOTS) {
      expect(root.path[0].y, 'gốc rễ không cao quá').toBeGreaterThanOrEqual(370);
    }
  });

  it('mọi rễ bám đất: điểm cuối ở y ≥ 490, đầu rễ vẫn dày', () => {
    for (const root of ROOTS) {
      expect(root.path[root.path.length - 1].y).toBeGreaterThanOrEqual(490);
      expect(root.widthEnd).toBeGreaterThanOrEqual(14);
    }
  });

  it('cành chính đi qua gần (300,110), (560,70), (900,148)', () => {
    const main = BRANCHES[0].path;
    const dist = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(Math.min(...main.map((p) => dist(p, vec2(300, 110))))).toBeLessThanOrEqual(20);
    expect(Math.min(...main.map((p) => dist(p, vec2(560, 70))))).toBeLessThanOrEqual(4);
    expect(Math.min(...main.map((p) => dist(p, vec2(900, 148))))).toBeLessThanOrEqual(4);
  });

  it('cành con không lơ lửng: đầu cành chui vào một cụm tán', () => {
    for (const tw of TWIGS) {
      const inside = CANOPY.some((c) => Math.hypot(tw.to.x - c.cx, tw.to.y - c.cy) < c.r);
      expect(inside, `${tw.to.x},${tw.to.y}`).toBe(true);
    }
  });

  it('11 cụm tán dọc mép trên, x = 0…1120, y = 0…200', () => {
    expect(CANOPY).toHaveLength(11);
    for (const c of CANOPY) {
      expect(c.cx).toBeGreaterThanOrEqual(0);
      expect(c.cx).toBeLessThanOrEqual(1120);
      expect(c.cy).toBeGreaterThanOrEqual(0);
      expect(c.cy).toBeLessThanOrEqual(200);
    }
  });

  it('tán dày: các cụm kề nhau cùng lớp chồng lên nhau, lớp trước chồng lên lớp sau', () => {
    for (const depth of [0, 1] as const) {
      const row = CANOPY.filter((c) => c.depth === depth).sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < row.length; i++) {
        const gap = row[i].cx - row[i - 1].cx;
        // mỗi cụm bè ngang khoảng 1,1 lần bán kính về mỗi bên
        expect(gap).toBeLessThan(1.1 * (row[i].r + row[i - 1].r));
      }
    }
    const back = CANOPY.filter((c) => c.depth === 0);
    for (const f of CANOPY.filter((c) => c.depth === 1)) {
      const near = back.some((b) => Math.hypot(f.cx - b.cx, f.cy - b.cy) < 0.8 * (f.r + b.r));
      expect(near).toBe(true);
    }
  });

  it('hốc cây quanh (250,330), cao ~60, nằm trong thân', () => {
    const b = bbox(HOLLOW);
    expect(Math.abs((b.x0 + b.x1) / 2 - 250)).toBeLessThanOrEqual(4);
    expect(Math.abs((b.y0 + b.y1) / 2 - 330)).toBeLessThanOrEqual(4);
    expect(b.y1 - b.y0).toBeGreaterThanOrEqual(55);
    expect(b.y1 - b.y0).toBeLessThanOrEqual(66);
    for (const p of HOLLOW) expect(pointInPolygon(p, TRUNK)).toBe(true);
    expect(pointInPolygon(HOLLOW_SEED, HOLLOW)).toBe(true);
  });
});

describe('hàm hình học', () => {
  it('taperedPolygon có 2n đỉnh, đầu rộng w0, cuối rộng w1', () => {
    const path = [vec2(0, 0), vec2(100, 0), vec2(200, 0)];
    const poly = taperedPolygon(path, 40, 10);
    expect(poly).toHaveLength(6);
    const width = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(width(poly[0], poly[5])).toBeCloseTo(40);
    expect(width(poly[2], poly[3])).toBeCloseTo(10);
    expect(taperedPolygon([vec2(0, 0)], 10, 5)).toEqual([]);
  });

  it('clusterLobes: 9 thuỳ (1 tâm + 8 quanh viền), cùng seed cho cùng kết quả', () => {
    const a = clusterLobes(CANOPY[0], 7);
    expect(a).toHaveLength(9);
    expect(a[0].x).toBe(CANOPY[0].cx);
    expect(a[0].y).toBe(CANOPY[0].cy);
    expect(clusterLobes(CANOPY[0], 7)).toEqual(a);
    expect(clusterLobes(CANOPY[0], 8)).not.toEqual(a);
  });

  it('pointInPolygon đúng với hình vuông', () => {
    const sq = [vec2(0, 0), vec2(10, 0), vec2(10, 10), vec2(0, 10)];
    expect(pointInPolygon(vec2(5, 5), sq)).toBe(true);
    expect(pointInPolygon(vec2(15, 5), sq)).toBe(false);
  });
});

describe('biến đổi gộp (cây Node)', () => {
  it('crown đặt tại điểm gắn cành, cụm tán đặt tại tâm cụm', () => {
    const tree = new AncientTree();
    tree.update({ time: 0 });
    const pivot = mat3Apply(tree.crownMatrix(), vec2(0, 0));
    expect(pivot.x).toBeCloseTo(CROWN_PIVOT.x);
    expect(pivot.y).toBeCloseTo(CROWN_PIVOT.y);
    tree.clusters.forEach((node, i) => {
      const c = mat3Apply(node.worldMatrix(), vec2(0, 0));
      expect(c.x).toBeCloseTo(CANOPY[i].cx);
      expect(c.y).toBeCloseTo(CANOPY[i].cy);
    });
  });

  it('góc xoay tán không vượt ±0.01 rad, là bội của SWAY_STEP, điểm gắn cành đứng yên', () => {
    const tree = new AncientTree();
    for (let t = 0; t < 20; t += 0.37) {
      tree.update({ time: t });
      const rot = tree.crown.transform.rotation;
      expect(Math.abs(rot)).toBeLessThanOrEqual(SWAY_AMPLITUDE + 1e-12);
      expect(Math.abs(rot / SWAY_STEP - Math.round(rot / SWAY_STEP))).toBeLessThan(1e-9);
      const pivot = mat3Apply(tree.crownMatrix(), vec2(0, 0));
      expect(pivot.x).toBeCloseTo(CROWN_PIVOT.x);
      expect(pivot.y).toBeCloseTo(CROWN_PIVOT.y);
    }
  });

  it('thân đứng yên, tán lay nhẹ (dưới 15 px world)', () => {
    const tree = new AncientTree();
    tree.update({ time: 0 });
    const trunk0 = tree.trunkWorld();
    const canopy0 = tree.canopyWorld();
    tree.update({ time: Math.PI / (2 * 0.6) });
    expect(tree.trunkWorld()).toEqual(trunk0);
    const canopy1 = tree.canopyWorld();
    let maxMove = 0;
    canopy1.forEach((lobes, i) => lobes.forEach((l, j) => {
      maxMove = Math.max(maxMove, Math.hypot(l.x - canopy0[i][j].x, l.y - canopy0[i][j].y));
    }));
    expect(maxMove).toBeGreaterThan(0.5);
    expect(maxMove).toBeLessThan(15);
  });
});

describe('vật thể tương tác', () => {
  it('thông tin hiển thị', () => {
    const tree = new AncientTree();
    expect(tree.id).toBe('tree');
    expect(tree.name).toBe('Cây cổ thụ');
    expect(tree.layer).toBe(20);
    expect(tree.interactive).toBe(true);
    expect(tree.algorithms.join(' ')).toContain('Flood fill');
  });

  it('hitPolygons gồm thân, rễ, cành và 11 cụm tán; nhấn thân hoặc tán đều trúng', () => {
    const tree = new AncientTree();
    tree.update({ time: 1 });
    const polys = tree.hitPolygons();
    expect(polys).toHaveLength(1 + ROOTS.length + BRANCHES.length + CANOPY.length);
    const hit = (p: Vec2) => polys.some((poly) => pointInPolygon(p, poly));
    expect(hit(vec2(260, 250))).toBe(true);   // thân
    expect(hit(vec2(618, 110))).toBe(true);   // cụm tán
    expect(hit(vec2(80, 484))).toBe(true);    // rễ trái
    expect(hit(vec2(444, 484))).toBe(true);   // rễ phải
    expect(hit(vec2(700, 400))).toBe(false);  // khoảng trời dưới tán
  });

  it('createMidground trả về cây cổ thụ', () => {
    const objs = createMidground();
    expect(objs.map((o) => o.id)).toContain('tree');
  });
});

describe('draw()', () => {
  const isCluster = (c: Call, ink: number) =>
    c.op === 'shape' && (c.args[1] as ShapeStyle).outline === ink && (c.args[0] as unknown[]).length === 9
    && (c.args[0] as unknown[][]).every((p) => p[0] === 'circle');

  it('tán sau → cành + thân → hốc → tán trước; cụm tán, thân và rêu đều có viền ink', () => {
    const tree = new AncientTree();
    tree.update({ time: 0 });
    const { r, calls } = mockRenderer();
    tree.draw(r, { time: 0, dayPhase: 0, palette: DAY });

    const clusters = calls.filter((c) => isCluster(c, DAY.ink));
    // 11 cụm tán + 7 bụi rêu cũng là 9 thuỳ có viền ink
    expect(clusters.length).toBeGreaterThanOrEqual(CANOPY.length);

    const wood = calls.find((c) => c.op === 'shape' && (c.args[1] as ShapeStyle).fill === DAY.trunk
      && (c.args[0] as unknown[]).length === 1 + ROOTS.length + BRANCHES.filter((b) => !b.sway).length)!;
    expect(wood).toBeDefined();
    const ws = wood.args[1] as ShapeStyle;
    expect(ws.outline).toBe(DAY.ink);
    expect(ws.shade).toBe(DAY.trunkDark);
    expect(ws.highlight).toBe(DAY.trunkLight);

    const at = (c: Call) => calls.indexOf(c);
    const flood = calls.findIndex((c) => c.op === 'floodFill');
    const backCount = CANOPY.filter((c) => c.depth === 0).length;
    // cụm sau vẽ trước thân, cụm trước vẽ sau hốc
    expect(at(clusters[backCount - 1])).toBeLessThan(at(wood));
    expect(flood).toBeGreaterThan(at(wood));
    expect(at(clusters[clusters.length - 1])).toBeGreaterThan(flood);
  });

  it('flood fill đúng một lần tại hốc cây, sau khi đã vẽ viền hốc', () => {
    const tree = new AncientTree();
    const { r, calls } = mockRenderer();
    tree.draw(r, { time: 0, dayPhase: 0, palette: DAY });
    const fills = calls.filter((c) => c.op === 'floodFill');
    expect(fills).toHaveLength(1);
    expect(fills[0].args[0]).toBeCloseTo(HOLLOW_SEED.x);
    expect(fills[0].args[1]).toBeCloseTo(HOLLOW_SEED.y);
    const outline = calls.findIndex((c) => c.op === 'polygon' && c.args[2] === false);
    expect(outline).toBeGreaterThanOrEqual(0);
    expect(outline).toBeLessThan(calls.indexOf(fills[0]));
  });

  it('ban ngày không có ánh sáng; ban đêm có quầng sáng và tia phép, không có đom đóm', () => {
    const tree = new AncientTree();
    const day = mockRenderer();
    tree.draw(day.r, { time: 1, dayPhase: 0, palette: DAY });
    expect(day.calls.filter((c) => c.op === 'circle')).toHaveLength(0);

    const night = mockRenderer();
    tree.draw(night.r, { time: 1, dayPhase: 1, palette: NIGHT });
    const circles = night.calls.filter((c) => c.op === 'circle');
    expect(circles.length).toBeGreaterThan(5);
    for (const g of circles) expect(g.args[4]).toBe(true);
    // Mọi hình tròn đều là quầng mờ (alpha < 255): không còn chấm đom đóm đặc
    for (const g of circles) expect((g.args[3] as number) & 0xff).toBeLessThan(255);
    // tia phép thuật: hình chữ thập bằng Bresenham
    const sparkleLines = night.calls.filter((c) => c.op === 'line' && c.args[6] === 'bresenham'
      && ((c.args[4] as number) & 0xff) < 255);
    expect(sparkleLines.length).toBeGreaterThan(0);
  });

  it('tia phép bay ra khỏi hốc theo thời gian, cùng thời điểm thì giống nhau', () => {
    const tree = new AncientTree();
    const spots = (t: number) => {
      const m = mockRenderer();
      tree.update({ time: t });
      tree.draw(m.r, { time: t, dayPhase: 1, palette: NIGHT });
      return m.calls.filter((c) => c.op === 'line' && c.args[6] === 'bresenham'
        && ((c.args[4] as number) & 0xff) < 255).map((c) => c.args.slice(0, 4));
    };
    expect(spots(2)).not.toEqual(spots(2.5));
    expect(spots(3)).toEqual(spots(3));
  });

  it('cành con dùng nét dày, vân gỗ dùng Bresenham', () => {
    const tree = new AncientTree();
    const { r, calls } = mockRenderer();
    tree.draw(r, { time: 0, dayPhase: 0, palette: DAY });
    const lines = calls.filter((c) => c.op === 'line');
    expect(lines.some((c) => (c.args[5] as number) > 1)).toBe(true);
    expect(lines.filter((c) => c.args[6] === 'bresenham').length).toBeGreaterThan(5);
  });
});
