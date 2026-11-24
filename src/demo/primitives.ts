import { Camera } from '../core/camera.ts';
import { withAlpha } from '../core/color.ts';
import { RENDER_SCALE, WORLD_H, WORLD_W } from '../core/config.ts';
import { drawText } from '../core/font.ts';
import { Framebuffer } from '../core/framebuffer.ts';
import { DAY, type Palette } from '../core/palette.ts';
import { Renderer } from '../core/renderer.ts';
import type { Vec2 } from '../core/vec2.ts';

const INSET_W = 960;
const INSET_H = 540;
const INSET_X = 930;
const INSET_Y = 58;

let cachedFb: Framebuffer | null = null;
let mainRenderer: Renderer | null = null;
let staticFb: Framebuffer | null = null;
let insetFb: Framebuffer | null = null;

/**
 * Demo `?demo=primitives` (#34): lưới toạ độ, đường/tròn/elip/đa giác, chữ,
 * `mask()` + `shape()` cho tán cây ghép nhiều elip, và camera 1×/2× cạnh nhau.
 *
 * Cảnh chính vẽ ở 1×; khung nhỏ bên phải là cùng cảnh qua camera 2×, chứng
 * minh renderer biến đổi đúng mà không cần API Canvas.
 *
 * Phần tĩnh được vẽ một lần vào `staticFb` rồi chép sang mỗi frame (đúng cách
 * #26 sẽ cache lớp nền); mỗi frame chỉ vẽ lại tia nắng theo `t`.
 */
export default function primitivesDemo(fb: Framebuffer, t: number): void {
  const palette = DAY;

  if (cachedFb !== fb) {
    cachedFb = fb;
    mainRenderer = new Renderer(fb, new Camera());

    staticFb = new Framebuffer(fb.width, fb.height);
    const staticRenderer = new Renderer(staticFb, new Camera());
    staticRenderer.begin(palette.skyMid);
    drawStaticScene(staticRenderer, palette);

    insetFb = new Framebuffer(INSET_W, INSET_H);
    const camera = new Camera();
    camera.zoom = 2;
    // Đưa tâm vùng (300, 200) của world vào giữa khung 960×540.
    camera.panX = INSET_W / 2 / RENDER_SCALE - camera.zoom * 300;
    camera.panY = INSET_H / 2 / RENDER_SCALE - camera.zoom * 200;
    // Khung 2× chỉ chứa phần cảnh tĩnh (mặt trời nằm ngoài vùng này) nên vẽ
    // một lần rồi chép sang mỗi frame — vẫn đúng dữ liệu camera 2×.
    const insetRenderer = new Renderer(insetFb, camera);
    insetRenderer.begin(palette.skyMid);
    drawStaticScene(insetRenderer, palette);
  }

  if (!mainRenderer || !staticFb || !insetFb) return;

  // Một lệnh chép 8 MB thay vì vẽ lại ~700k pixel tĩnh mỗi frame.
  fb.data.set(staticFb.data);
  drawSun(mainRenderer, palette, t);

  blit(insetFb, fb, INSET_X, INSET_Y);
  outlineRect(fb, INSET_X - 5, INSET_Y - 5, INSET_W + 10, INSET_H + 10, palette.ink, 4);

  drawText(fb, 'Zoom 2x', INSET_X + 16, INSET_Y + 12, 0xfff8e7ff, {
    scale: 2,
    shadow: 0x000000b0,
  });
}

/** Phần cảnh không đổi theo thời gian: chỉ vẽ lại khi palette hoặc camera đổi. */
function drawStaticScene(r: Renderer, p: Palette): void {
  r.begin(p.skyMid);

  // Lưới toạ độ mờ: mỗi 80 đơn vị world.
  const grid = withAlpha(p.ink, 0.14);
  for (let x = 0; x <= WORLD_W; x += 80) r.line(x, 0, x, WORLD_H, grid);
  for (let y = 0; y <= WORLD_H; y += 80) r.line(0, y, WORLD_W, y, grid);

  // Núi + đất.
  r.polygon([
    { x: 880, y: 440 },
    { x: 1080, y: 300 },
    { x: 1188, y: 282 },
    { x: 1280, y: 360 },
    { x: 1280, y: 440 },
  ], p.mountainNear);

  r.polygon([
    { x: 0, y: 470 },
    { x: 260, y: 456 },
    { x: 620, y: 476 },
    { x: 980, y: 458 },
    { x: 1280, y: 480 },
    { x: 1280, y: WORLD_H },
    { x: 0, y: WORLD_H },
  ], p.ground);

  // Đường đá uốn bằng nét dày.
  r.polyline([
    { x: 520, y: 490 },
    { x: 548, y: 570 },
    { x: 610, y: 640 },
    { x: 660, y: WORLD_H },
  ], p.pathStone, 22);
  r.polyline([
    { x: 520, y: 490 },
    { x: 548, y: 570 },
    { x: 610, y: 640 },
    { x: 660, y: WORLD_H },
  ], p.inkSoft, 1);

  // Mây ghép nhiều elip (không viền vì thuộc lớp xa).
  r.ellipse(360, 170, 92, 30, p.cloud, true);
  r.ellipse(420, 150, 62, 38, p.cloud, true);
  r.ellipse(478, 172, 78, 26, p.cloud, true);
  r.ellipse(420, 180, 118, 18, p.cloudShade, true);

  // Cây: thân + cành, tán ghép 5 elip vào MỘT mask rồi mới tô/viền.
  const trunk: Vec2[] = [
    { x: 196, y: 472 },
    { x: 218, y: 250 },
    { x: 268, y: 120 },
    { x: 330, y: 96 },
    { x: 368, y: 230 },
    { x: 356, y: 472 },
  ];
  r.polygon(trunk, p.trunk, true);
  r.polygon(trunk, p.ink, false);
  r.polyline([
    { x: 300, y: 130 },
    { x: 500, y: 88 },
    { x: 700, y: 120 },
    { x: 880, y: 150 },
  ], p.trunkDark, 9);
  r.polyline([
    { x: 286, y: 210 },
    { x: 170, y: 180 },
    { x: 80, y: 210 },
  ], p.trunkDark, 7);

  const canopy = r.mask();
  canopy.ellipse(180, 130, 112, 72);
  canopy.ellipse(300, 92, 148, 78);
  canopy.ellipse(440, 118, 142, 68);
  canopy.ellipse(590, 96, 138, 62);
  canopy.ellipse(740, 136, 118, 56);
  r.shape(canopy, {
    fill: p.canopy,
    shade: p.canopyDark,
    highlight: p.canopyLight,
    outline: p.ink,
    outlineWidth: 2,
  });

  // Nhà nấm: thân là đa giác, mũ là mask elip có đốm bị clip.
  const stem: Vec2[] = [
    { x: 372, y: 330 },
    { x: 500, y: 330 },
    { x: 514, y: 452 },
    { x: 356, y: 452 },
  ];
  r.polygon(stem, p.mushroomStem, true);
  r.polygon(stem, p.ink, false);

  const cap = r.mask();
  cap.ellipse(430, 330, 150, 88);
  r.shape(cap, {
    fill: p.mushroomCap,
    shade: p.mushroomCapDark,
    highlight: withAlpha(p.mushroomSpot, 0.45),
    outline: p.ink,
    outlineWidth: 2,
  });

  const spots = r.mask();
  spots.circle(385, 305, 15);
  spots.circle(452, 286, 11);
  spots.circle(486, 326, 13);
  spots.circle(410, 346, 9);
  r.shape(spots, { fill: p.mushroomSpot, clip: cap });

  // Cửa sổ + cửa: chi tiết nằm trong thân.
  r.circle(430, 388, 22, p.windowGlow, true);
  r.circle(430, 388, 22, p.inkSoft);

  // Hoa và bướm nhỏ dùng tròn/elip.
  for (const [x, y, color] of [
    [190, 590, p.flowerRed],
    [230, 606, p.flowerYellow],
    [780, 640, p.flowerBlue],
    [826, 660, p.flowerPurple],
  ] as const) {
    r.circle(x, y, 9, color, true);
    r.circle(x, y, 3, p.flowerYellow, true);
  }

  // Chữ do font bitmap tự cài đặt (không dùng ctx.fillText).
  r.text('Thế giới cổ tích', 40, 44, p.text, 2, 'left', withAlpha(p.ink, 0.35));
  r.text('Toàn cảnh 1x', 40, 664, p.text, 1, 'left', withAlpha(p.ink, 0.3));
}

/**
 * Mặt trời: quầng trong suốt + đĩa đặc + tia xoay theo thời gian.
 *
 * Vẽ sau khi chép lớp tĩnh; tia nắng chỉ nằm ở góc phải trên nên không đè lên
 * mây, tán cây hay núi.
 */
function drawSun(r: Renderer, p: Palette, t: number): void {
  for (let i = 0; i < 12; i++) {
    const angle = t * 0.18 + (i / 12) * Math.PI * 2;
    const ax = 1188 + Math.cos(angle) * 48;
    const ay = 85 + Math.sin(angle) * 48;
    const bx = 1188 + Math.cos(angle) * 74;
    const by = 85 + Math.sin(angle) * 74;
    r.line(ax, ay, bx, by, withAlpha(p.sunGlow, 0.55), 2, 'dda');
  }
  r.circle(1188, 85, 52, withAlpha(p.sunGlow, 0.16), true);
  r.circle(1188, 85, 34, p.sun, true);
  r.circle(1188, 85, 34, p.inkSoft);
}

/** Chép từng dòng RGBA từ framebuffer nhỏ sang framebuffer chính. */
function blit(source: Framebuffer, target: Framebuffer, left: number, top: number): void {
  const rowBytes = source.width * 4;
  for (let y = 0; y < source.height; y++) {
    const dstY = top + y;
    if (dstY < 0 || dstY >= target.height) continue;
    const dstOffset = (dstY * target.width + left) * 4;
    target.data.set(source.data.subarray(y * rowBytes, (y + 1) * rowBytes), dstOffset);
  }
}

/** Viền chữ nhật vẽ từng pixel (demo không dùng API Canvas). */
function outlineRect(
  fb: Framebuffer,
  left: number,
  top: number,
  width: number,
  height: number,
  color: number,
  thickness: number,
): void {
  for (let t = 0; t < thickness; t++) {
    for (let x = left; x < left + width; x++) {
      fb.setPixel(x, top + t, color);
      fb.setPixel(x, top + height - 1 - t, color);
    }
    for (let y = top; y < top + height; y++) {
      fb.setPixel(left + t, y, color);
      fb.setPixel(left + width - 1 - t, y, color);
    }
  }
}
