import type { RGBA } from './color.ts';
import type { Vec2 } from './vec2.ts';

/**
 * Vùng 1 bit theo toạ độ world, được raster hoá vào hệ pixel framebuffer.
 *
 * Vật thể ghép nhiều hình con (tán cây, mũ nấm, thân cá…) nên vẽ hết vào một
 * `WorldMask` rồi mới tô/viền một lần, tránh lộ mép giữa các hình.
 */
export interface WorldMask {
  /** Thêm đa giác (scanline even-odd) vào vùng. */
  polygon(points: readonly Vec2[]): this;
  /** Thêm elip đặc vào vùng. */
  ellipse(cx: number, cy: number, rx: number, ry: number): this;
  /** Thêm hình tròn đặc vào vùng. */
  circle(cx: number, cy: number, r: number): this;
  /** Hợp với vùng khác (cùng kích thước framebuffer). */
  union(other: WorldMask): this;
  /** Giao với vùng khác. */
  intersect(other: WorldMask): this;
  /** Trừ vùng khác. */
  subtract(other: WorldMask): this;
  /** Xoá toàn bộ vùng. */
  clear(): this;
  /** `true` nếu chưa có pixel nào thuộc vùng. */
  isEmpty(): boolean;
}

/** Kiểu tô khối theo phong cách 3 tông + viền của dự án. */
export interface ShapeStyle {
  /** Màu nền (bắt buộc). */
  fill: RGBA;
  /** Tông tối ở mép dưới-trái. */
  shade?: RGBA;
  /** Tông sáng ở mép trên-phải. */
  highlight?: RGBA;
  /** Màu viền (thường `palette.ink`). */
  outline?: RGBA;
  /** Độ dày viền theo toạ độ world (mặc định 2). */
  outlineWidth?: number;
  /** Chỉ tô phần nằm trong mask cha (clipping chi tiết). */
  clip?: WorldMask;
}

/**
 * Hợp đồng API vẽ theo toạ độ world (SPEC #1, mục 3.6).
 *
 * `Renderer` biến đổi world → screen bằng `Camera` rồi gọi các thuật toán
 * raster/fill/font/mask. Mọi bán kính, độ dày và vị trí đều tính theo world.
 */
export interface Renderer {
  /** Xoá framebuffer bằng `clearColor` và bắt đầu một khung mới. */
  begin(clearColor: RGBA): void;

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: RGBA,
    width?: number,
    alg?: 'dda' | 'bresenham',
  ): void;

  polyline(points: readonly Vec2[], color: RGBA, width?: number): void;
  circle(cx: number, cy: number, r: number, color: RGBA, filled?: boolean): void;
  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGBA, filled?: boolean): void;
  polygon(points: readonly Vec2[], color: RGBA, filled?: boolean): void;
  floodFill(x: number, y: number, color: RGBA): void;

  text(
    text: string,
    x: number,
    y: number,
    color: RGBA,
    scale?: number,
    align?: 'left' | 'center' | 'right',
    shadow?: RGBA,
  ): void;

  /** Cấp một mask trống theo toạ độ world (được tái sử dụng giữa các khung). */
  mask(): WorldMask;

  /** Tô mask theo 3 tông, viền và clipping. */
  shape(mask: WorldMask, style: ShapeStyle): void;
}
