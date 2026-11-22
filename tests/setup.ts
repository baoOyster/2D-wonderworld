/**
 * Node không có `ImageData` (API của trình duyệt), nên framebuffer cần một
 * bản thay thế tối thiểu để chạy test.
 *
 * Bản này giữ nguyên tham chiếu `data` giống ImageData thật, nhờ vậy
 * `fb.data` và `fb.image.data` vẫn là cùng một vùng nhớ.
 */

class ImageDataPolyfill {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: PredefinedColorSpace = 'srgb';

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      const width = dataOrWidth;
      const h = widthOrHeight;
      if (!Number.isInteger(width) || !Number.isInteger(h) || width <= 0 || h <= 0) {
        throw new RangeError(`Kích thước ImageData không hợp lệ: ${width}×${h}`);
      }
      this.width = width;
      this.height = h;
      this.data = new Uint8ClampedArray(width * h * 4);
      return;
    }

    const data = dataOrWidth;
    const width = widthOrHeight;
    const h = height ?? (width > 0 ? data.length / 4 / width : 0);
    if (!Number.isInteger(width) || !Number.isInteger(h) || width <= 0 || h <= 0) {
      throw new RangeError(`Kích thước ImageData không hợp lệ: ${width}×${h}`);
    }
    if (data.length !== width * h * 4) {
      throw new RangeError(
        `Dữ liệu ImageData không khớp kích thước: ${data.length} byte cho ${width}×${h}`,
      );
    }

    this.width = width;
    this.height = h;
    this.data = data;
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  Object.defineProperty(globalThis, 'ImageData', {
    value: ImageDataPolyfill,
    writable: true,
    configurable: true,
  });
}
