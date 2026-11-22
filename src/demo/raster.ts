/**
 * Demo `?demo=raster` (Nguyệt, #3): so sánh DDA với Bresenham, nét dày, Midpoint tròn và elip.
 * Trang demo (#32) gọi hàm mặc định mỗi khung hình với framebuffer và thời gian t (giây).
 * Màu ở đây chỉ dùng cho demo, cảnh thật lấy màu từ palette.
 */
import {
  circleMidpoint, ellipseMidpoint, lineBresenham, lineDDA, thickLine, type RasterTarget,
} from '../core/raster.ts';

const INK = 0x34261fff;
const DDA = 0x2f6fd0ff;
const BRES = 0xd0402fff;
const SUN = 0xffd060ff;
const GLOW = 0xffd06040;
const CLOUD = 0xffffffff;
const SHADE = 0xcfe0f0ff;

export default function rasterDemo(fb: RasterTarget, t: number): void {
  const s = fb.width / 1280; // vẽ theo khung 1280×720 rồi co giãn theo framebuffer
  const S = (v: number): number => v * s;

  // 1) cùng một bộ đoạn thẳng: bên trái DDA (xanh), bên phải Bresenham (đỏ)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.3;
    const dx = Math.cos(a) * 120, dy = Math.sin(a) * 120;
    lineDDA(fb, S(220), S(200), S(220 + dx), S(200 + dy), DDA);
    lineBresenham(fb, S(560), S(200), S(560 + dx), S(200 + dy), BRES);
  }

  // 2) nét dày: cành cây thuôn dần
  for (let w = 1; w <= 7; w++) thickLine(fb, S(120 + w * 50), S(440), S(150 + w * 50), S(560), S(w), INK);

  // 3) mặt trời: quầng sáng trong suốt + đĩa đặc + viền (Midpoint circle)
  for (let k = 3; k >= 1; k--) circleMidpoint(fb, S(1000), S(180), S(60 + k * 18), GLOW, true);
  circleMidpoint(fb, S(1000), S(180), S(60), SUN, true);
  circleMidpoint(fb, S(1000), S(180), S(60), INK);

  // 4) đám mây: các elip đặc chồng nhau (Midpoint ellipse), đáy là một elip màu bóng
  //    (viền cho khối gộp nhiều elip là việc của mask/outline ở #4)
  const cx = 900 + Math.sin(t * 0.5) * 40;
  ellipseMidpoint(fb, S(cx), S(470), S(110), S(26), SHADE, true);
  for (const [dx, dy, rx, ry] of [[-60, 440, 50, 36], [0, 420, 64, 50], [62, 440, 48, 34]]) {
    ellipseMidpoint(fb, S(cx + dx), S(dy), S(rx), S(ry), CLOUD, true);
  }
}
