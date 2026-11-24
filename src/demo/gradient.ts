import { lerpColor, type RGBA } from '../core/color.ts';
import type { Framebuffer } from '../core/framebuffer.ts';
import { DAY } from '../core/palette.ts';

/**
 * Demo mặc định: nền gradient vẽ từng pixel bằng `setPixel` và một ô vuông
 * nhấp nháy. Dùng làm cảnh tạm khi chưa có scene chung.
 */
export default function gradientDemo(fb: Framebuffer, t: number): void {
  const p = DAY;
  const horizon = Math.round(fb.height * 0.62);

  // Mỗi dòng một màu: 1080 lần lerp thay vì 2 triệu lần. Ghi thẳng vào
  // `fb.data` theo từng dòng để không gọi `setPixel` 2 triệu lần mỗi frame.
  const data = fb.data;
  const stride = fb.width * 4;
  let offset = 0;
  for (let y = 0; y < fb.height; y++) {
    const color: RGBA = y < horizon
      ? lerpColor(p.skyTop, p.skyBottom, y / horizon)
      : lerpColor(p.ground, p.groundDark, (y - horizon) / (fb.height - horizon));

    const value = color >>> 0;
    const r = (value >>> 24) & 0xff;
    const g = (value >>> 16) & 0xff;
    const b = (value >>> 8) & 0xff;
    const a = value & 0xff;
    for (let i = 0; i < stride; i += 4) {
      data[offset + i] = r;
      data[offset + i + 1] = g;
      data[offset + i + 2] = b;
      data[offset + i + 3] = a;
    }
    offset += stride;
  }

  // Mặt trời nhỏ + ô vuông nhấp nháy, căn theo khung world 1280×720.
  const scale = fb.width / 1280;
  const sunX = Math.round(1188 * scale);
  const sunY = Math.round(85 * scale);
  const sunR = Math.round(34 * scale);
  for (let y = -sunR; y <= sunR; y++) {
    for (let x = -sunR; x <= sunR; x++) {
      if (x * x + y * y <= sunR * sunR) fb.setPixel(sunX + x, sunY + y, p.sun);
    }
  }

  if (Math.floor(t * 2) % 2 === 0) {
    const size = Math.round(48 * scale);
    const left = Math.round(616 * scale);
    const top = Math.round(320 * scale);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) fb.setPixel(left + x, top + y, p.selection);
    }
  }
}
