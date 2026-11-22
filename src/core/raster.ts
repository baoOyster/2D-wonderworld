/**
 * Raster cơ bản: vẽ đoạn thẳng (DDA, Bresenham), nét dày, đường tròn và elip (Midpoint).
 * Chủ sở hữu: Nguyệt (#3).
 *
 * Mọi hàm nhận một `RasterTarget` tối thiểu; `Framebuffer` khớp interface này nên
 * truyền thẳng vào được (test `tests/raster.test.ts` chạy trên cả hai). Mọi pixel ngoài biên bị bỏ qua (clip), không throw.
 */

import type { RGBA } from './color.ts';

/** Màu packed 0xRRGGBBAA (xem `color.ts`). */
export type Color = RGBA;

export interface RasterTarget {
  readonly width: number;
  readonly height: number;
  setPixel(x: number, y: number, c: Color): void;
  blendPixel(x: number, y: number, c: Color): void;
}

/** Gọi cho mỗi dòng quét của hình tô kín: tô các pixel x0..x1 (gồm cả hai đầu) trên dòng y. */
export type SpanCallback = (y: number, x0: number, x1: number) => void;

const round = (v: number): number => Math.floor(v + 0.5);

/**
 * Ghi pixel đã clip. Màu đục (alpha = 255) ghi thẳng; màu trong suốt được gom lại để
 * mỗi pixel chỉ trộn đúng một lần (tránh đậm lên ở chỗ các điểm đối xứng trùng nhau).
 */
class Plotter {
  private readonly opaque: boolean;
  private readonly seen: Set<number> | null;
  private readonly t: RasterTarget;
  private readonly c: Color;

  constructor(t: RasterTarget, c: Color) {
    this.t = t;
    this.c = c;
    this.opaque = (c & 0xff) === 0xff;
    this.seen = this.opaque ? null : new Set<number>();
  }

  px(x: number, y: number): void {
    const t = this.t;
    if (x < 0 || y < 0 || x >= t.width || y >= t.height) return;
    if (this.opaque) { t.setPixel(x, y, this.c); return; }
    const k = y * t.width + x;
    if (this.seen!.has(k)) return;
    this.seen!.add(k);
    t.blendPixel(x, y, this.c);
  }

  /**
   * Tô dòng x0..x1 trên dòng y. `unique = true` nghĩa là dòng này chỉ được tô một lần
   * (hình đặc: mỗi dòng quét đúng một lần) nên ghi thẳng, không cần chống trộn trùng.
   */
  span(y: number, x0: number, x1: number, unique = true): void {
    const t = this.t;
    if (y < 0 || y >= t.height) return;
    const a = Math.max(0, Math.min(x0, x1));
    const b = Math.min(t.width - 1, Math.max(x0, x1));
    if (this.opaque) { for (let x = a; x <= b; x++) t.setPixel(x, y, this.c); return; }
    if (unique) { for (let x = a; x <= b; x++) t.blendPixel(x, y, this.c); return; }
    for (let x = a; x <= b; x++) this.px(x, y);
  }
}

// ---------------------------------------------------------------------------
// Đoạn thẳng
// ---------------------------------------------------------------------------

/**
 * DDA: bước 1 pixel theo trục dài, toạ độ trục còn lại cộng dần một số thực rồi làm tròn.
 * Độ phức tạp O(max(|dx|, |dy|)).
 */
export function lineDDA(t: RasterTarget, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const p = new Plotter(t, c);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(round(x1) - round(x0)), Math.abs(round(y1) - round(y0)));
  if (steps === 0) { p.px(round(x0), round(y0)); return; }
  const xi = dx / steps;
  const yi = dy / steps;
  let x = x0;
  let y = y0;
  for (let i = 0; i <= steps; i++) {
    p.px(round(x), round(y));
    x += xi;
    y += yi;
  }
}

/**
 * Bresenham: chỉ dùng số nguyên. Với |dy| <= |dx| (trục x là trục dài):
 *   p0 = 2dy - dx;  nếu p < 0: p += 2dy;  ngược lại: y += 1, p += 2(dy - dx).
 * Trường hợp |dy| > |dx| đổi vai trò x và y. Hướng âm xử lý bằng bước sx, sy = ±1,
 * nên phủ đủ 8 octant. Độ phức tạp O(max(|dx|, |dy|)).
 */
export function lineBresenham(t: RasterTarget, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const p = new Plotter(t, c);
  bresenhamPoints(round(x0), round(y0), round(x1), round(y1), (x, y) => p.px(x, y));
}

/** Duyệt các điểm Bresenham (số nguyên) từ (x0,y0) tới (x1,y1), gồm cả hai đầu. */
export function bresenhamPoints(x0: number, y0: number, x1: number, y1: number, visit: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;
  let x = x0;
  let y = y0;
  if (dy <= dx) {
    let pk = 2 * dy - dx;
    for (let i = 0; i <= dx; i++) {
      visit(x, y);
      x += sx;
      if (pk < 0) pk += 2 * dy;
      else { y += sy; pk += 2 * (dy - dx); }
    }
  } else {
    let pk = 2 * dx - dy;
    for (let i = 0; i <= dy; i++) {
      visit(x, y);
      y += sy;
      if (pk < 0) pk += 2 * dx;
      else { x += sx; pk += 2 * (dx - dy); }
    }
  }
}

/**
 * Nét dày: đặt (stamp) một hình tròn đặc đường kính `width` tại mỗi điểm Bresenham.
 * Đầu nét tròn, nét đều theo mọi hướng. Với width <= 1 dùng Bresenham thường.
 * Độ phức tạp O(L · w²) với L là độ dài đoạn; chấp nhận được vì w nhỏ (cành, cọc, lan can).
 */
export function thickLine(t: RasterTarget, x0: number, y0: number, x1: number, y1: number, width: number, c: Color): void {
  if (width <= 1.5) { lineBresenham(t, x0, y0, x1, y1, c); return; }
  const p = new Plotter(t, c);
  const r = (width - 1) / 2;
  const rows = circleHalfWidths(Math.max(0, round(r)));
  bresenhamPoints(round(x0), round(y0), round(x1), round(y1), (x, y) => {
    for (let dy = 0; dy < rows.length; dy++) {
      p.span(y + dy, x - rows[dy], x + rows[dy], false); // các vòng tròn chồng nhau
      if (dy) p.span(y - dy, x - rows[dy], x + rows[dy], false);
    }
  });
}

// ---------------------------------------------------------------------------
// Đường tròn
// ---------------------------------------------------------------------------

/**
 * Duyệt 1/8 cung tròn bằng Midpoint, gọi `visit(x, y)` với 0 <= x <= y.
 *   x = 0, y = r, d = 1 - r
 *   nếu d < 0: d += 2x + 3           (chọn điểm E)
 *   ngược lại: d += 2(x - y) + 5, y -= 1   (chọn điểm SE)
 *   x += 1, lặp tới khi x > y.
 */
function circleOctant(r: number, visit: (x: number, y: number) => void): void {
  let x = 0;
  let y = r;
  let d = 1 - r;
  while (x <= y) {
    visit(x, y);
    if (d < 0) d += 2 * x + 3;
    else { d += 2 * (x - y) + 5; y--; }
    x++;
  }
}

/** Nửa bề rộng của hình tròn đặc tại mỗi độ lệch dọc dy = 0..r (lấy từ 8 octant). */
function circleHalfWidths(r: number): number[] {
  const half = new Array<number>(r + 1).fill(0);
  circleOctant(r, (x, y) => {
    if (half[y] < x) half[y] = x;
    if (half[x] < y) half[x] = y;
  });
  return half;
}

/** Duyệt các dòng quét của hình tròn đặc (mỗi dòng đúng một lần). Thụ dùng cho `maskEllipse`/Mask (#4). */
export function circleSpans(cx: number, cy: number, r: number, cb: SpanCallback): void {
  cx = round(cx); cy = round(cy); r = round(r);
  if (r < 0) return;
  const half = circleHalfWidths(r);
  for (let dy = 0; dy <= r; dy++) {
    cb(cy + dy, cx - half[dy], cx + half[dy]);
    if (dy) cb(cy - dy, cx - half[dy], cx + half[dy]);
  }
}

/**
 * Midpoint circle. `filled = false`: viền, 8 điểm đối xứng mỗi bước.
 * `filled = true`: tô từng dòng quét lấy bề rộng từ 8 octant. Độ phức tạp: viền O(r), đặc O(r²).
 */
export function circleMidpoint(t: RasterTarget, cx: number, cy: number, r: number, c: Color, filled = false): void {
  const p = new Plotter(t, c);
  if (filled) { circleSpans(cx, cy, r, (y, a, b) => p.span(y, a, b)); return; }
  cx = round(cx); cy = round(cy); r = round(r);
  if (r < 0) return;
  circleOctant(r, (x, y) => {
    p.px(cx + x, cy + y); p.px(cx - x, cy + y); p.px(cx + x, cy - y); p.px(cx - x, cy - y);
    p.px(cx + y, cy + x); p.px(cx - y, cy + x); p.px(cx + y, cy - x); p.px(cx - y, cy - x);
  });
}

// ---------------------------------------------------------------------------
// Elip
// ---------------------------------------------------------------------------

/**
 * Duyệt 1/4 elip (góc phần tư x >= 0, y >= 0) bằng Midpoint, gọi `visit(x, y)`.
 * Mọi tham số quyết định được nhân 4 để chỉ dùng số nguyên.
 *
 * Vùng 1 (độ dốc > -1, tức 2·ry²·x < 2·rx²·y): luôn x += 1
 *   p1 = ry² - rx²·ry + rx²/4
 *   nếu p1 < 0: p1 += 2·ry²·x + ry²
 *   ngược lại: y -= 1, p1 += 2·ry²·x - 2·rx²·y + ry²
 * Vùng 2: luôn y -= 1
 *   p2 = ry²·(x + 1/2)² + rx²·(y - 1)² - rx²·ry²
 *   nếu p2 > 0: p2 += rx² - 2·rx²·y
 *   ngược lại: x += 1, p2 += 2·ry²·x - 2·rx²·y + rx²
 * (x, y trong công thức cập nhật là giá trị sau bước.)
 */
function ellipseQuadrant(rx: number, ry: number, visit: (x: number, y: number) => void): void {
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let x = 0;
  let y = ry;
  let px = 0;            // 2·ry²·x
  let py = 2 * rx2 * y;  // 2·rx²·y
  let p = 4 * ry2 - 4 * rx2 * ry + rx2; // 4·p1
  while (px < py) {
    visit(x, y);
    x++;
    px += 2 * ry2;
    if (p < 0) p += 4 * (px + ry2);
    else { y--; py -= 2 * rx2; p += 4 * (px - py + ry2); }
  }
  p = ry2 * (2 * x + 1) * (2 * x + 1) + 4 * rx2 * (y - 1) * (y - 1) - 4 * rx2 * ry2; // 4·p2
  while (y >= 0) {
    visit(x, y);
    y--;
    py -= 2 * rx2;
    if (p > 0) p += 4 * (rx2 - py);
    else { x++; px += 2 * ry2; p += 4 * (px - py + rx2); }
  }
}

/** Nửa bề rộng của elip đặc tại mỗi độ lệch dọc dy = 0..ry. */
function ellipseHalfWidths(rx: number, ry: number): number[] {
  const half = new Array<number>(ry + 1).fill(-1);
  ellipseQuadrant(rx, ry, (x, y) => { if (y >= 0 && y <= ry && half[y] < x) half[y] = x; });
  for (let dy = 0; dy <= ry; dy++) if (half[dy] < 0) half[dy] = 0;
  return half;
}

/** Duyệt các dòng quét của elip đặc (mỗi dòng đúng một lần). Thụ dùng cho `maskEllipse` (#4). */
export function ellipseSpans(cx: number, cy: number, rx: number, ry: number, cb: SpanCallback): void {
  cx = round(cx); cy = round(cy); rx = round(rx); ry = round(ry);
  if (rx < 0 || ry < 0) return;
  if (ry === 0) { cb(cy, cx - rx, cx + rx); return; }
  const half = ellipseHalfWidths(rx, ry);
  for (let dy = 0; dy <= ry; dy++) {
    cb(cy + dy, cx - half[dy], cx + half[dy]);
    if (dy) cb(cy - dy, cx - half[dy], cx + half[dy]);
  }
}

/**
 * Midpoint ellipse. `filled = false`: viền, 4 điểm đối xứng mỗi bước.
 * `filled = true`: tô từng dòng quét. rx hoặc ry bằng 0 thành đoạn thẳng; giá trị âm thì bỏ qua.
 * Độ phức tạp: viền O(rx + ry), đặc O(rx·ry).
 */
export function ellipseMidpoint(t: RasterTarget, cx: number, cy: number, rx: number, ry: number, c: Color, filled = false): void {
  const p = new Plotter(t, c);
  if (filled) { ellipseSpans(cx, cy, rx, ry, (y, a, b) => p.span(y, a, b)); return; }
  cx = round(cx); cy = round(cy); rx = round(rx); ry = round(ry);
  if (rx < 0 || ry < 0) return;
  if (rx === 0 || ry === 0) { // elip suy biến thành đoạn thẳng
    for (let y = cy - ry; y <= cy + ry; y++) p.span(y, cx - rx, cx + rx);
    return;
  }
  ellipseQuadrant(rx, ry, (x, y) => {
    p.px(cx + x, cy + y); p.px(cx - x, cy + y); p.px(cx + x, cy - y); p.px(cx - x, cy - y);
  });
}
