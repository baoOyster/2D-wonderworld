
import type { Vec2 } from './vec2.ts';
import { ellipseSpans } from './raster.ts';

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
    const { width: w, height: h, data } = this;

    // Dòng trên cùng và dưới cùng có pixel: quét từ hai đầu, gặp là dừng
    const rowEmpty = (y: number): boolean => {
      for (let i = y * w; i < (y + 1) * w; i++) if (data[i] !== 0) return false;
      return true;
    };

    let y0 = 0;
    while (y0 < h && rowEmpty(y0)) y0++;
    if (y0 === h) return null;

    let y1 = h - 1;
    while (rowEmpty(y1)) y1--;

    // Cột trái/phải: mỗi dòng chỉ cần xét phần nằm ngoài [x0, x1] hiện có
    let x0 = w;
    let x1 = -1;

    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = 0; x < x0; x++) {
        if (data[row + x] !== 0) { x0 = x; break; }
      }
      for (let x = w - 1; x > x1; x--) {
        if (data[row + x] !== 0) { x1 = x; break; }
      }
    }

    return { x0, y0, x1, y1 };
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
  const { width: w, height: h } = m;
  const result = new Mask(w, h);
  const sx = Math.round(dx);
  const sy = Math.round(dy);

  // Cột đích x lấy từ cột nguồn x - sx; chỉ [lo, hi) có nguồn nằm trong ảnh
  const lo = Math.max(0, Math.min(w, sx));
  const hi = Math.max(0, Math.min(w, w + sx));

  for (let y = 0; y < h; y++) {
    const src = Math.max(0, Math.min(h - 1, y - sy)) * w;
    const dst = y * w;

    // Phần giữa: chép nguyên đoạn
    if (lo < hi) {
      result.data.set(m.data.subarray(src + lo - sx, src + hi - sx), dst + lo);
    }

    // Phần trống bên trái/phải: lặp lại pixel mép để không tạo dải lạ
    if (lo > 0) result.data.fill(m.data[src], dst, dst + lo);
    if (hi < w) result.data.fill(m.data[src + w - 1], dst + hi, dst + w);
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



// Midpoint ellipse filled: dùng chung ellipseSpans của raster.ts (#3),
// ghi từng đoạn ngang vào mask, kẹp theo biên ảnh
export function maskEllipse(
  m: Mask,
  cx: number,
  cy: number,
  rx: number,
  ry: number
): void {
  if (![cx, cy, rx, ry].every(Number.isFinite)) return;
  if (Math.round(rx) <= 0 || Math.round(ry) <= 0) return;

  ellipseSpans(cx, cy, rx, ry, (y, x0, x1) => {
    if (y < 0 || y >= m.height) return;

    const left = Math.max(0, x0);
    const right = Math.min(m.width - 1, x1);

    if (left <= right) {
      m.data.fill(1, y * m.width + left, y * m.width + right + 1);
    }
  });
}


// Viền bên trong vùng: lớp 1 là pixel thuộc vùng có láng giềng 4 hướng
// nằm ngoài vùng; width > 1 thì bóc tiếp lớp biên (co vùng / erosion) width lần.
// Pixel ngoài khung ảnh được coi là "trong vùng": vật bị khung hình cắt
// (tán cây chạm mép trên) vẫn liền ra ngoài, nên không có viền dọc mép ảnh.
export function maskOutline(
  m: Mask,
  width = 1
): Mask {
  if (!Number.isInteger(width) || width < 1) {
    throw new RangeError('Invalid outline width');
  }

  const { width: w, height: h } = m;
  const result = new Mask(w, h);
  const b = m.bounds();

  if (!b) return result;
  const { x0, y0, x1, y1 } = b;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  // Chỉ làm việc trong hộp bao: chép phần đó của mask ra mảng nhỏ
  let current = new Uint8Array(bw * bh);
  let inner = new Uint8Array(bw * bh);

  for (let y = y0; y <= y1; y++) {
    current.set(m.data.subarray(y * w + x0, y * w + x1 + 1), (y - y0) * bw);
  }

  // Láng giềng nằm ngoài hộp bao: ngoài ảnh thì coi là trong vùng (1),
  // còn trong ảnh thì chắc chắn ngoài vùng (0) vì hộp bao đã bao hết mask
  const leftOut = x0 === 0 ? 1 : 0;
  const rightOut = x1 === w - 1 ? 1 : 0;
  const topOut = y0 === 0 ? 1 : 0;
  const bottomOut = y1 === h - 1 ? 1 : 0;

  for (let step = 0; step < width; step++) {
    for (let j = 0; j < bh; j++) {
      for (let k = 0; k < bw; k++) {
        const i = j * bw + k;

        if (current[i] === 0) {
          inner[i] = 0;
          continue;
        }

        const inside =
          (k === 0 ? leftOut : current[i - 1]) &&
          (k === bw - 1 ? rightOut : current[i + 1]) &&
          (j === 0 ? topOut : current[i - bw]) &&
          (j === bh - 1 ? bottomOut : current[i + bw]);

        if (inside) {
          inner[i] = 1;
        } else {
          inner[i] = 0;
          result.data[(y0 + j) * w + x0 + k] = 1;
        }
      }
    }

    [current, inner] = [inner, current];
  }

  return result;
}
