
import type { Framebuffer } from '../core/framebuffer.ts';
import { rgb } from '../core/color.ts';
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
  const bg = rgb('#14243b');
  const green = rgb('#45b879');
  const blue = rgb('#38bdf8');
  const yellow = rgb('#ffd166');
  const white = rgb('#ffffff');

  fb.clear(bg);

  // 1. Núi - Scanline Polygon Fill
  polygonFill(fb, [
    { x: 50, y: 650 },
    { x: 350, y: 180 },
    { x: 650, y: 650 }
  ], green);

  strokePolygon(fb, [
    { x: 50, y: 650 },
    { x: 350, y: 180 },
    { x: 650, y: 650 }
  ], white, 3);

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

  polygonFill(fb, star, yellow);
  strokePolygon(fb, star, white, 3);

  // 3. Flood Fill bên trong một vùng tròn
  const circle = new Mask(fb.width, fb.height);
  maskEllipse(circle, 1500, 390, 165, 165);

  outlineMask(fb, circle, white, 3);

  floodFill(fb, 1500, 390, blue, {
    mode: 'boundary',
    boundary: white,
    maxPixels: 120000
  });

  // 4. So sánh các elip có viền riêng
  const leftA = new Mask(fb.width, fb.height);
  const leftB = new Mask(fb.width, fb.height);

  maskEllipse(leftA, 430, 840, 170, 90);
  maskEllipse(leftB, 560, 840, 170, 90);

  fillMask(fb, leftA, green);
  outlineMask(fb, leftA, white, 4);

  fillMask(fb, leftB, green);
  outlineMask(fb, leftB, white, 4);

  // 5. Hợp Mask rồi tạo một viền chung
  const rightA = new Mask(fb.width, fb.height);
  const rightB = new Mask(fb.width, fb.height);

  maskEllipse(rightA, 1250, 840, 170, 90);
  maskEllipse(rightB, 1380, 840, 170, 90);

  const merged = maskUnion(rightA, rightB);

  fillMask(fb, merged, green);
  outlineMask(fb, merged, white, 4);
}
