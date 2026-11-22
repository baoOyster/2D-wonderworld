import { FB_H, FB_W } from './config.ts';
import type { RGBA } from './color.ts';

/**
 * Mặt giấy RGBA của toàn bộ cảnh.
 *
 * `data` và `image` dùng chung một vùng nhớ: vẽ vào `data` rồi đưa `image`
 * lên canvas bằng `putImageData`, không cấp phát lại mỗi frame.
 *
 * Mọi thao tác pixel đều clip theo biên và không throw.
 */
export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly image: ImageData;

  constructor(width: number = FB_W, height: number = FB_H) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`Kích thước framebuffer không hợp lệ: ${width}×${height}`);
    }

    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.image = new ImageData(this.data, width, height);
  }

  /** Tô toàn bộ framebuffer bằng một màu (không trộn alpha). */
  clear(color: RGBA): void {
    const value = color >>> 0;
    const r = (value >>> 24) & 0xff;
    const g = (value >>> 16) & 0xff;
    const b = (value >>> 8) & 0xff;
    const a = value & 0xff;
    const data = this.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  /** Ghi đè một pixel; bỏ qua nếu toạ độ nằm ngoài framebuffer. */
  setPixel(x: number, y: number, color: RGBA): void {
    const i = this.index(x, y);
    if (i < 0) return;

    const value = color >>> 0;
    const data = this.data;
    data[i] = (value >>> 24) & 0xff;
    data[i + 1] = (value >>> 16) & 0xff;
    data[i + 2] = (value >>> 8) & 0xff;
    data[i + 3] = value & 0xff;
  }

  /**
   * Trộn một pixel lên framebuffer theo công thức source-over (alpha thường,
   * không premultiplied):
   *
   * `outA = srcA + dstA·(1 − srcA)`
   *
   * `outC = (srcC·srcA + dstC·dstA·(1 − srcA)) / outA`
   *
   * Bỏ qua nếu toạ độ nằm ngoài framebuffer.
   */
  blendPixel(x: number, y: number, color: RGBA): void {
    const i = this.index(x, y);
    if (i < 0) return;

    const value = color >>> 0;
    const sr = (value >>> 24) & 0xff;
    const sg = (value >>> 16) & 0xff;
    const sb = (value >>> 8) & 0xff;
    const sa = value & 0xff;

    if (sa === 0) return;

    const data = this.data;
    if (sa === 255) {
      data[i] = sr;
      data[i + 1] = sg;
      data[i + 2] = sb;
      data[i + 3] = 255;
      return;
    }

    const da = data[i + 3];
    if (da === 0) {
      data[i] = sr;
      data[i + 1] = sg;
      data[i + 2] = sb;
      data[i + 3] = sa;
      return;
    }

    const srcA = sa / 255;
    const dstA = da / 255;
    const outA = srcA + dstA * (1 - srcA);
    const invOutA = 1 / outA;
    const srcWeight = srcA * invOutA;
    const dstWeight = dstA * (1 - srcA) * invOutA;

    data[i] = Math.round(sr * srcWeight + data[i] * dstWeight);
    data[i + 1] = Math.round(sg * srcWeight + data[i + 1] * dstWeight);
    data[i + 2] = Math.round(sb * srcWeight + data[i + 2] * dstWeight);
    data[i + 3] = Math.round(outA * 255);
  }

  /** Đọc một pixel; trả `0` (trong suốt) nếu toạ độ nằm ngoài framebuffer. */
  getPixel(x: number, y: number): RGBA {
    const i = this.index(x, y);
    if (i < 0) return 0;

    const data = this.data;
    return (
      ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0
    );
  }

  /** Offset byte của pixel, hoặc -1 nếu ngoài biên. */
  private index(x: number, y: number): number {
    if (!(x >= 0 && y >= 0 && x < this.width && y < this.height)) return -1;
    return ((y | 0) * this.width + (x | 0)) * 4;
  }
}
