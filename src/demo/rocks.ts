/**
 * Demo `?demo=rocks` (#20): đá ven hồ, sỏi và lau sậy trên nền hồ tạm (#13 chưa
 * xong). Ngày ↔ đêm tự đổi mỗi 16 giây như demo midground.
 *
 * Hồ tạm cố ý làm theo ảnh mẫu `B5_ho_da.jpg` — nước trong, **sáng dần vào giữa**,
 * bờ mềm (không viền dày), có vệt phản chiếu — để #13 có mẫu đúng khi vẽ hồ thật.
 *
 * Rê chuột qua bụi sậy: sậy ngả theo con trỏ qua `env.pointer`, rồi lay tắt dần
 * về trạng thái cũ. Lớp input thật (#9/#25) chưa có nên demo tự bắt `pointermove`
 * trên canvas và đổi sang toạ độ world bằng `Camera.screenToWorld`.
 */
import { Camera } from '../core/camera.ts';
import { lerpColor, withAlpha } from '../core/color.ts';
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

/** Trời gradient và đất phẳng (hồ thật là #13). */
function drawGround(fb: Framebuffer, palette: Palette): void {
  const horizon = Math.round(450 * (fb.height / 720));
  for (let y = 0; y < fb.height; y++) {
    const c = y < horizon
      ? lerpColor(palette.skyTop, palette.skyBottom, y / horizon)
      : lerpColor(palette.ground, palette.groundDark, (y - horizon) / (fb.height - horizon));
    for (let x = 0; x < fb.width; x++) fb.setPixel(x, y, c);
  }
}

/**
 * Hồ tạm theo B5: bờ mềm (đai cát mờ dần ra ngoài), nước sáng dần vào giữa, vài
 * vệt sáng ngang mặt nước (gợn và phản chiếu thật do #13 vẽ).
 *
 * Quét từng dòng trong hộp bao elip: bề rộng nửa dòng `rx·√(1 − t²)`; độ sáng
 * theo khoảng cách tới mép (`1 − |dx|/half`), nên giữa hồ sáng nhất.
 */
function drawLake(fb: Framebuffer, r: Renderer, palette: Palette): void {
  const scale = fb.width / 1280;
  // Bờ mềm: đai cát mờ, viền ngoài nhạt dần nên hồ không có viền cứng.
  const bank = lerpColor(palette.ground, palette.pathStone, 0.25);
  r.ellipse(LAKE.cx, LAKE.cy, LAKE.rx + 7, LAKE.ry + 5, withAlpha(bank, 0.25), true);
  r.ellipse(LAKE.cx, LAKE.cy, LAKE.rx + 2.5, LAKE.ry + 1.8, withAlpha(bank, 0.4), true);

  const y0 = Math.max(0, Math.floor((LAKE.cy - LAKE.ry) * scale));
  const y1 = Math.min(fb.height - 1, Math.ceil((LAKE.cy + LAKE.ry) * scale));
  for (let y = y0; y <= y1; y++) {
    const wy = y / scale;
    const t = (wy - LAKE.cy) / LAKE.ry;
    if (t <= -1 || t >= 1) continue;
    const half = LAKE.rx * Math.sqrt(1 - t * t) * scale;
    const cx = LAKE.cx * scale;
    const x0 = Math.max(0, Math.ceil(cx - half));
    const x1 = Math.min(fb.width - 1, Math.floor(cx + half));
    // Xa bờ (gần đáy hồ) tối hơn; giữa hồ và phía trên sáng hơn.
    for (let x = x0; x <= x1; x++) {
      const edge = Math.abs(x - cx) / Math.max(1, half);
      const depth = 0.35 + 0.65 * edge * edge;
      const c = lerpColor(palette.waterShallow, palette.waterDeep, depth);
      fb.setPixel(x, y, c);
    }
  }

  // Gợn ngang: vài vệt sáng mảnh, dài ngắn khác nhau như mặt nước gợn.
  const lines = [
    [830, 600, 120], [1000, 616, 150], [1180, 606, 96],
    [880, 636, 90], [1080, 646, 130], [1240, 628, 70],
  ] as const;
  for (const [x, y, len] of lines) r.line(x, y, x + len, y, withAlpha(palette.waterHighlight, 0.6), 1, 'dda');
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
  drawGround(fb, palette);
  drawLake(fb, renderer, palette);

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
