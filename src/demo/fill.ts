
import type { Framebuffer } from '../core/framebuffer.ts';
import { lerpColor } from '../core/color.ts';
import { DAY } from '../core/palette.ts';
import {
  polygonFill,
  strokePolygon,
  floodFill,
  fillMask,
  outlineMask
} from '../core/fill.ts';
import {
  Mask,
  maskEllipse,
  maskUnion
} from '../core/mask.ts';

export default function demoFill(
  fb: Framebuffer,
  _t: number
): void {
  // Màu lấy từ palette chung (style guide): nền trời + đất, viền ink
  const p = DAY;
  const leafColor = p.canopy;
  const water = p.waterShallow;
  const starColor = p.flowerYellow;
  const ink = p.ink;

  const horizon = Math.round(fb.height * 0.62);
  for (let y = 0; y < fb.height; y++) {
    const c = y < horizon
      ? lerpColor(p.skyTop, p.skyBottom, y / horizon)
      : lerpColor(p.ground, p.groundDark, (y - horizon) / (fb.height - horizon));
    for (let x = 0; x < fb.width; x++) fb.setPixel(x, y, c);
  }

  // 1. Núi - Scanline Polygon Fill
  polygonFill(fb, [
    { x: 50, y: 650 },
    { x: 350, y: 180 },
    { x: 650, y: 650 }
  ], p.mountainNear);

  strokePolygon(fb, [
    { x: 50, y: 650 },
    { x: 350, y: 180 },
    { x: 650, y: 650 }
  ], ink, 3);

  // 2. Ngôi sao tự cắt - Even-Odd
  const vertices = Array.from(
    { length: 5 },
    (_, i) => {
      const angle =
        -Math.PI / 2 + i * 2 * Math.PI / 5;

      return {
        x: 950 + 180 * Math.cos(angle),
        y: 390 + 180 * Math.sin(angle)
      };
    }
  );

  const star = [0, 2, 4, 1, 3]
    .map(i => vertices[i]);

  polygonFill(fb, star, starColor);
  strokePolygon(fb, star, ink, 3);

  // 3. Flood Fill bên trong một vùng tròn
  const circle = new Mask(fb.width, fb.height);
  maskEllipse(circle, 1500, 390, 165, 165);

  outlineMask(fb, circle, ink, 3);

  floodFill(fb, 1500, 390, water, {
    mode: 'boundary',
    boundary: ink,
    maxPixels: 120000
  });

  // 4. So sánh các elip có viền riêng
  const leftA = new Mask(fb.width, fb.height);
  const leftB = new Mask(fb.width, fb.height);

  maskEllipse(leftA, 430, 840, 170, 90);
  maskEllipse(leftB, 560, 840, 170, 90);

  fillMask(fb, leftA, leafColor);
  outlineMask(fb, leftA, ink, 4);

  fillMask(fb, leftB, leafColor);
  outlineMask(fb, leftB, ink, 4);

  // 5. Hợp Mask rồi tạo một viền chung
  const rightA = new Mask(fb.width, fb.height);
  const rightB = new Mask(fb.width, fb.height);

  maskEllipse(rightA, 1250, 840, 170, 90);
  maskEllipse(rightB, 1380, 840, 170, 90);

  const merged = maskUnion(rightA, rightB);

  fillMask(fb, merged, leafColor);
  outlineMask(fb, merged, ink, 4);
}
