import { describe, expect, it } from 'vitest';
import {
  bresenhamPoints, circleMidpoint, circleSpans, ellipseMidpoint, ellipseSpans,
  lineBresenham, lineDDA, thickLine, type RasterTarget,
} from '../src/core/raster.ts';
import { Framebuffer } from '../src/core/framebuffer.ts';

/** Bề mặt giả: ghi lại pixel và số lần trộn mỗi pixel. */
class Fake implements RasterTarget {
  readonly px = new Set<string>();
  readonly blends = new Map<string, number>();
  readonly width: number;
  readonly height: number;
  constructor(width = 400, height = 300) { this.width = width; this.height = height; }
  setPixel(x: number, y: number): void {
    expect(x >= 0 && y >= 0 && x < this.width && y < this.height).toBe(true);
    this.px.add(`${x},${y}`);
  }
  blendPixel(x: number, y: number): void {
    this.setPixel(x, y);
    const k = `${x},${y}`;
    this.blends.set(k, (this.blends.get(k) ?? 0) + 1);
  }
  has(x: number, y: number): boolean { return this.px.has(`${x},${y}`); }
  points(): [number, number][] { return [...this.px].map((s) => s.split(',').map(Number) as [number, number]); }
}

const C = 0xff0000ff;
const HALF = 0xff000080;

describe('đoạn thẳng', () => {
  // các đoạn mẫu không có điểm "đúng nửa pixel" nên DDA và Bresenham phải trùng nhau
  const segs: [number, number, number, number][] = [
    [10, 10, 17, 13], [10, 10, 3, 13], [10, 10, 17, 7], [10, 10, 3, 7],
    [10, 10, 13, 17], [10, 10, 7, 17], [10, 10, 13, 3], [10, 10, 7, 3],
    [20, 20, 31, 28], [5, 40, 5, 60], [5, 40, 30, 40], [50, 50, 50, 50],
  ];

  it('luôn tô hai đầu mút, mọi octant', () => {
    for (const [a, b, c, d] of segs) {
      for (const draw of [lineDDA, lineBresenham]) {
        const f = new Fake();
        draw(f, a, b, c, d, C);
        expect(f.has(a, b) && f.has(c, d)).toBe(true);
      }
    }
  });

  it('Bresenham liền mạch, đúng max(|dx|,|dy|)+1 pixel', () => {
    for (const [a, b, c, d] of segs) {
      const pts: [number, number][] = [];
      bresenhamPoints(a, b, c, d, (x, y) => pts.push([x, y]));
      expect(pts.length).toBe(Math.max(Math.abs(c - a), Math.abs(d - b)) + 1);
      for (let i = 1; i < pts.length; i++) {
        expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
        expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('DDA và Bresenham cho cùng tập pixel; đảo chiều không đổi kết quả', () => {
    for (const [a, b, c, d] of segs) {
      const f1 = new Fake(); lineDDA(f1, a, b, c, d, C);
      const f2 = new Fake(); lineBresenham(f2, a, b, c, d, C);
      const f3 = new Fake(); lineBresenham(f3, c, d, a, b, C);
      expect([...f1.px].sort()).toEqual([...f2.px].sort());
      expect([...f3.px].sort()).toEqual([...f2.px].sort());
    }
  });

  it('nét dày phủ đều quanh đoạn', () => {
    const f = new Fake();
    thickLine(f, 20, 20, 120, 70, 7, C);
    const len = Math.hypot(100, 50);
    for (const [x, y] of f.points()) {
      const t = Math.max(0, Math.min(1, ((x - 20) * 100 + (y - 20) * 50) / (len * len)));
      const dist = Math.hypot(x - (20 + 100 * t), y - (20 + 50 * t));
      expect(dist).toBeLessThanOrEqual(3.6);
    }
    expect(f.has(70, 45) && f.has(70, 48) && f.has(70, 42)).toBe(true);
  });

  it('màu trong suốt: mỗi pixel chỉ trộn một lần', () => {
    const f = new Fake();
    thickLine(f, 10, 10, 60, 30, 6, HALF);
    expect(Math.max(...f.blends.values())).toBe(1);
  });
});

describe('đường tròn', () => {
  it('viền nằm sát bán kính và đối xứng 8 hướng', () => {
    for (const r of [1, 5, 17, 40]) {
      const f = new Fake();
      circleMidpoint(f, 100, 100, r, C);
      for (const [x, y] of f.points()) {
        const dx = x - 100, dy = y - 100;
        expect(Math.abs(Math.hypot(dx, dy) - r)).toBeLessThanOrEqual(0.75);
        for (const [u, v] of [[-dx, dy], [dx, -dy], [dy, dx]]) expect(f.has(100 + u, 100 + v)).toBe(true);
      }
    }
  });

  it('hình tròn đặc: diện tích ≈ πr², không tràn khỏi hộp bao', () => {
    const r = 40;
    const f = new Fake();
    circleMidpoint(f, 100, 100, r, C, true);
    expect(Math.abs(f.px.size - Math.PI * r * r) / (Math.PI * r * r)).toBeLessThan(0.05);
    for (const [x, y] of f.points()) expect(Math.abs(x - 100) <= r && Math.abs(y - 100) <= r).toBe(true);
  });

  it('r = 0 là một pixel, r âm không vẽ gì; mỗi dòng quét chỉ gọi một lần', () => {
    const f = new Fake();
    circleMidpoint(f, 5, 5, 0, C); expect([...f.px]).toEqual(['5,5']);
    const g = new Fake(); circleMidpoint(g, 5, 5, -3, C, true); expect(g.px.size).toBe(0);
    const rows: number[] = [];
    circleSpans(50, 50, 12, (y) => rows.push(y));
    expect(new Set(rows).size).toBe(rows.length);
    expect(rows.length).toBe(25);
  });

  it('cắt theo biên: tâm ngoài màn hình không lỗi', () => {
    const f = new Fake(100, 80);
    circleMidpoint(f, -20, 30, 50, HALF, true);
    circleMidpoint(f, 500, 500, 30, C);
    expect(f.px.size).toBeGreaterThan(0);
  });
});

describe('elip', () => {
  it('viền đối xứng và nằm trong hộp bao', () => {
    for (const [rx, ry] of [[30, 12], [12, 30], [60, 25], [3, 40], [40, 3]]) {
      const f = new Fake();
      ellipseMidpoint(f, 150, 120, rx, ry, C);
      for (const [x, y] of f.points()) {
        const dx = x - 150, dy = y - 120;
        expect(Math.abs(dx) <= rx && Math.abs(dy) <= ry).toBe(true);
        expect(f.has(150 - dx, 120 + dy) && f.has(150 + dx, 120 - dy)).toBe(true);
      }
      expect(f.has(150 + rx, 120) && f.has(150, 120 + ry)).toBe(true);
    }
  });

  it('elip đặc: diện tích ≈ π·rx·ry', () => {
    const f = new Fake();
    ellipseMidpoint(f, 150, 120, 80, 35, C, true);
    expect(Math.abs(f.px.size - Math.PI * 80 * 35) / (Math.PI * 80 * 35)).toBeLessThan(0.05);
  });

  it('viền liền mạch (không có lỗ giữa hai vùng)', () => {
    const f = new Fake();
    ellipseMidpoint(f, 150, 120, 70, 20, C);
    for (const [x, y] of f.points()) {
      let near = 0;
      for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) if ((u || v) && f.has(x + u, y + v)) near++;
      expect(near).toBeGreaterThanOrEqual(2);
    }
  });

  it('bán kính suy biến hoặc rất nhỏ không treo', () => {
    const f = new Fake();
    ellipseMidpoint(f, 50, 50, 0, 10, C); expect(f.px.size).toBe(21);
    const g = new Fake(); ellipseMidpoint(g, 50, 50, 1, 60, C, true); expect(g.px.size).toBeGreaterThan(0);
    const h = new Fake(); ellipseMidpoint(h, 50, 50, -1, 5, C); expect(h.px.size).toBe(0);
    const rows: number[] = []; ellipseSpans(10, 10, 7, 4, (y) => rows.push(y)); expect(rows.length).toBe(9);
  });
});

describe('chạy trên Framebuffer thật', () => {
  const at = (fb: Framebuffer, x: number, y: number) => {
    const i = (y * fb.width + x) * 4;
    return [fb.data[i], fb.data[i + 1], fb.data[i + 2], fb.data[i + 3]];
  };

  it('ghi đúng màu, cắt theo biên, không lỗi', () => {
    const fb = new Framebuffer(64, 48);
    lineBresenham(fb, -10, -10, 60, 60, 0x112233ff); // đoạn chéo 45°, đi qua (0,0), hai đầu nằm ngoài biên
    circleMidpoint(fb, 32, 24, 10, 0xff0000ff, true);
    ellipseMidpoint(fb, 70, 70, 20, 8, 0x00ff00ff);
    expect(at(fb, 32, 24)).toEqual([255, 0, 0, 255]);
    expect(at(fb, 0, 0)[3]).toBe(255);
  });

  it('quầng sáng trong suốt: mỗi pixel trộn đúng một lần', () => {
    const fb = new Framebuffer(64, 48);
    fb.clear(0x000000ff);
    circleMidpoint(fb, 32, 24, 12, 0xffffff80, true);
    const v = at(fb, 32, 24)[0];
    expect(v).toBeGreaterThan(120);
    expect(v).toBeLessThan(136); // trộn hai lần sẽ ra khoảng 191
  });
});
