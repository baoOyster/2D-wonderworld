
import type { Vec2 } from './vec2.ts';

export class Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 || height <= 0) {
      throw new RangeError('Invalid mask size');
    }

    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
  }

  get(x: number, y: number): boolean {
    if (!Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 || y < 0 ||
        x >= this.width || y >= this.height) {
      return false;
    }

    return this.data[y * this.width + x] !== 0;
  }

  set(x: number, y: number, v = true): void {
    if (!Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 || y < 0 ||
        x >= this.width || y >= this.height) {
      return;
    }

    this.data[y * this.width + x] = v ? 1 : 0;
  }

  clear(): void {
    this.data.fill(0);
  }

  bounds() {
    let x0 = this.width;
    let y0 = this.height;
    let x1 = -1;
    let y1 = -1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.get(x, y)) continue;

        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }

    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
}

function checkSize(a: Mask, b: Mask): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new RangeError('Mask sizes must match');
  }
}

export function maskUnion(a: Mask, b: Mask): Mask {
  checkSize(a, b);
  const result = new Mask(a.width, a.height);

  for (let i = 0; i < a.data.length; i++) {
    result.data[i] = a.data[i] | b.data[i];
  }

  return result;
}

export function maskIntersect(a: Mask, b: Mask): Mask {
  checkSize(a, b);
  const result = new Mask(a.width, a.height);

  for (let i = 0; i < a.data.length; i++) {
    result.data[i] = a.data[i] & b.data[i];
  }

  return result;
}

export function maskSubtract(a: Mask, b: Mask): Mask {
  checkSize(a, b);
  const result = new Mask(a.width, a.height);

  for (let i = 0; i < a.data.length; i++) {
    result.data[i] = a.data[i] & (b.data[i] ^ 1);
  }

  return result;
}

export function maskShift(
  m: Mask,
  dx: number,
  dy: number
): Mask {
  const result = new Mask(m.width, m.height);
  const sx = Math.round(dx);
  const sy = Math.round(dy);

  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const sourceX = Math.max(
        0, Math.min(m.width - 1, x - sx)
      );
      const sourceY = Math.max(
        0, Math.min(m.height - 1, y - sy)
      );

      result.set(x, y, m.get(sourceX, sourceY));
    }
  }

  return result;
}

// Scanline Even-Odd Polygon Fill
export function maskPolygon(
  m: Mask,
  pts: readonly Vec2[]
): void {
  if (pts.length < 3) return;

  const ys = pts.map(p => p.y);
  const minY = Math.max(0, Math.ceil(Math.min(...ys) - 0.5));
  const maxY = Math.min(
    m.height - 1,
    Math.floor(Math.max(...ys) - 0.5)
  );

  for (let y = minY; y <= maxY; y++) {
    const scanY = y + 0.5;
    const intersections: number[] = [];

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];

      if (a.y === b.y) continue;

      if (scanY >= Math.min(a.y, b.y) &&
          scanY < Math.max(a.y, b.y)) {
        const x = a.x +
          (scanY - a.y) *
          (b.x - a.x) / (b.y - a.y);

        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(
        0, Math.ceil(intersections[i] - 0.5)
      );
      const right = Math.min(
        m.width - 1,
        Math.ceil(intersections[i + 1] - 0.5) - 1
      );

      for (let x = left; x <= right; x++) {
        m.set(x, y);
      }
    }
  }
}



export function maskEllipse(
  m: Mask,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): void {
  if (![cx, cy, rx, ry].every(Number.isFinite)) return;

  // Raster hóa trên lưới pixel nguyên
  cx = Math.round(cx);
  cy = Math.round(cy);
  rx = Math.round(rx);
  ry = Math.round(ry);

  if (rx <= 0 || ry <= 0) return;

  let x = 0;
  let y = ry;

  const rx2 = rx * rx;
  const ry2 = ry * ry;

  let dx = 2 * ry2 * x;
  let dy = 2 * rx2 * y;

  // Mỗi dòng lưu biên trái/phải cần tô
  const spans = new Map<number, number>();

  function record(px: number, py: number): void {
    for (const yy of [cy + py, cy - py]) {
      if (yy < 0 || yy >= m.height) continue;

      const previous = spans.get(yy) ?? -1;
      spans.set(yy, Math.max(previous, px));
    }
  }

  // Vùng 1: độ dốc |m| < 1
  let p1 = ry2 - rx2 * ry + 0.25 * rx2;

  while (dx < dy) {
    record(x, y);

    x++;
    dx += 2 * ry2;

    if (p1 < 0) {
      p1 += ry2 + dx;
    } else {
      y--;
      dy -= 2 * rx2;
      p1 += ry2 + dx - dy;
    }
  }

  // Vùng 2: độ dốc |m| >= 1
  let p2 =
    ry2 * (x + 0.5) ** 2 +
    rx2 * (y - 1) ** 2 -
    rx2 * ry2;

  while (y >= 0) {
    record(x, y);

    y--;
    dy -= 2 * rx2;

    if (p2 > 0) {
      p2 += rx2 - dy;
    } else {
      x++;
      dx += 2 * ry2;
      p2 += rx2 - dy + dx;
    }
  }

  // Tô kín từng dòng ngang
  for (const [row, halfWidth] of spans) {
    const left = Math.max(0, cx - halfWidth);
    const right = Math.min(m.width - 1, cx + halfWidth);

    for (let col = left; col <= right; col++) {
      m.set(col, row, true);
    }
  }
}


export function maskOutline(
  m: Mask,
  width = 1
): Mask {
  const result = new Mask(m.width, m.height);

  if (!Number.isInteger(width) || width < 1) {
    throw new RangeError('Invalid outline width');
  }

  // Tạo vùng còn lại sau mỗi lần bóc lớp biên
  let current = new Mask(m.width, m.height);
  current.data.set(m.data);

  for (let step = 0; step < width; step++) {
    const inner = new Mask(m.width, m.height);

    for (let y = 0; y < m.height; y++) {
      for (let x = 0; x < m.width; x++) {
        if (!current.get(x, y)) continue;

        const inside =
          current.get(x - 1, y) &&
          current.get(x + 1, y) &&
          current.get(x, y - 1) &&
          current.get(x, y + 1);

        if (inside) {
          inner.set(x, y);
        } else {
          result.set(x, y);
        }
      }
    }

    current = inner;
  }

  return result;
}
