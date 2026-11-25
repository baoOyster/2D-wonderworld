/**
 * Demo `?demo=rocks` (#20): đá ven hồ, sỏi và lau sậy trên nền hồ tạm (#13 chưa
 * xong). Ngày ↔ đêm tự đổi mỗi 16 giây như demo midground.
 *
 * Rê chuột qua cụm sậy: sậy ngả theo con trỏ qua `env.pointer`, rồi lay tắt dần
 * về trạng thái cũ. Lớp input thật (#9/#25) chưa có nên demo tự bắt `pointermove`
 * trên canvas và đổi sang toạ độ world bằng `Camera.screenToWorld`.
 */
import { Camera } from '../core/camera.ts';
import { lerpColor } from '../core/color.ts';
import type { Framebuffer } from '../core/framebuffer.ts';
import { DAY, NIGHT, mixPalette, type Palette } from '../core/palette.ts';
import { Renderer } from '../core/renderer.ts';
import { vec2, type Vec2 } from '../core/vec2.ts';
import { Boulders, LAKE, Pebbles } from '../scene/rocks/rocks.ts';
import { Reeds } from '../scene/rocks/reeds.ts';
import type { Env } from '../scene/types.ts';

const pebbles = new Pebbles();
const boulders = new Boulders();
const reeds = new Reeds();

let renderer: Renderer | null = null;
let camera: Camera | null = null;
let target: Framebuffer | null = null;
let lastTime = -1;
let pointer: Vec2 | null = null;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
canvas?.addEventListener('pointermove', (event) => {
  if (!camera || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  // Toạ độ CSS → pixel framebuffer → toạ độ world.
  pointer = camera.screenToWorld(vec2(
    ((event.clientX - rect.left) / rect.width) * canvas.width,
    ((event.clientY - rect.top) / rect.height) * canvas.height,
  ));
});
canvas?.addEventListener('pointerleave', () => {
  pointer = null;
});

/** Nền tạm: trời gradient, đất phẳng và hồ elip (hồ thật là #13). */
function drawBackdrop(fb: Framebuffer, r: Renderer, palette: Palette): void {
  const horizon = Math.round(450 * (fb.height / 720));
  for (let y = 0; y < fb.height; y++) {
    const c = y < horizon
      ? lerpColor(palette.skyTop, palette.skyBottom, y / horizon)
      : lerpColor(palette.ground, palette.groundDark, (y - horizon) / (fb.height - horizon));
    for (let x = 0; x < fb.width; x++) fb.setPixel(x, y, c);
  }
  r.ellipse(LAKE.cx, LAKE.cy, LAKE.rx, LAKE.ry, palette.waterDeep, true);
  r.ellipse(LAKE.cx, LAKE.cy + 6, LAKE.rx * 0.94, LAKE.ry * 0.84, palette.waterShallow, true);
  // Vài vệt sáng trên mặt nước (gợn thật do #13 vẽ).
  for (let i = 0; i < 7; i++) {
    const x = LAKE.cx - 190 + i * 58;
    const y = LAKE.cy + 16 + ((i * 13) % 22) - 11;
    r.line(x, y, x + 34, y, palette.waterHighlight, 1, 'dda');
  }
}

export default function rocksDemo(fb: Framebuffer, t: number): void {
  if (target !== fb || !renderer || !camera) {
    camera = new Camera();
    renderer = new Renderer(fb, camera);
    target = fb;
  }
  const cycle = (t % 16) / 16;
  const ramp = (a: number): number => Math.max(0, Math.min(1, a));
  const night = cycle < 0.5 ? ramp((cycle - 0.4375) * 16) : 1 - ramp((cycle - 0.9375) * 16);
  const palette = night <= 0 ? DAY : night >= 1 ? NIGHT : mixPalette(DAY, NIGHT, night);

  renderer.begin(palette.skyBottom);
  drawBackdrop(fb, renderer, palette);

  const env: Env = {
    time: t,
    dt: lastTime < 0 || t < lastTime ? 1 / 60 : Math.min(0.1, t - lastTime),
    dayPhase: night,
    palette,
    camera,
    pointer,
  };
  lastTime = t;
  pebbles.draw(renderer, env);
  boulders.draw(renderer, env);
  reeds.draw(renderer, env);
}
