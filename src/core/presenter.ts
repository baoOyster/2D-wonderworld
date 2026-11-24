import { FB_H, FB_W } from './config.ts';
import type { Framebuffer } from './framebuffer.ts';

/**
 * Đưa framebuffer lên canvas bằng đúng một lệnh `putImageData`.
 *
 * Canvas giữ backing store cố định `FB_W × FB_H`; CSS lo co giãn 16:9 và
 * letterbox (xem `style.css`). Không dùng `drawImage`, không bật
 * `image-rendering: pixelated`.
 */
export class Presenter {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = FB_W;
    canvas.height = FB_H;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Presenter: canvas không hỗ trợ 2D context');
    this.context = context;
  }

  /** Chép nguyên `ImageData` của framebuffer lên canvas; không cấp phát mới. */
  present(fb: Framebuffer): void {
    if (fb.width !== this.canvas.width || fb.height !== this.canvas.height) {
      this.canvas.width = fb.width;
      this.canvas.height = fb.height;
    }
    this.context.putImageData(fb.image, 0, 0);
  }
}
