/**
 * Demo `?demo=midground` (#14–#16): cây cổ thụ, nhà nấm, hàng rào, lối đi vẽ bằng
 * Renderer thật (#34), trên nền trời và đất tạm. Ngày ↔ đêm tự đổi mỗi 8 giây.
 */
import { Camera } from '../core/camera.ts';
import { lerpColor } from '../core/color.ts';
import type { Framebuffer } from '../core/framebuffer.ts';
import { DAY, NIGHT, mixPalette } from '../core/palette.ts';
import { Renderer } from '../core/renderer.ts';
import { Fence } from '../scene/midground/fence.ts';
import { MushroomHouse } from '../scene/midground/mushroom-house.ts';
import { GardenPath } from '../scene/midground/path.ts';
import { AncientTree } from '../scene/midground/tree.ts';

const tree = new AncientTree();
const house = new MushroomHouse();
const fence = new Fence();
const path = new GardenPath();
let renderer: Renderer | null = null;
let camera: Camera | null = null;
let target: Framebuffer | null = null;
let lastDoorPhase = -1;
let lastTime = -1;

export default function midgroundDemo(fb: Framebuffer, t: number): void {
  if (target !== fb || !renderer || !camera) {
    camera = new Camera();
    renderer = new Renderer(fb, camera);
    target = fb;
  }
  const cycle = (t % 16) / 16;
  const ramp = (a: number): number => Math.max(0, Math.min(1, a));
  const night = cycle < 0.5 ? ramp((cycle - 0.4375) * 16) : 1 - ramp((cycle - 0.9375) * 16);
  const palette = night <= 0 ? DAY : night >= 1 ? NIGHT : mixPalette(DAY, NIGHT, night);

  const horizon = Math.round(450 * (fb.height / 720));
  // Nền tạm: trời gradient, đất phẳng từ y = 450 (world)
  renderer.begin(palette.skyBottom);
  for (let y = 0; y < fb.height; y++) {
    const c = y < horizon
      ? lerpColor(palette.skyTop, palette.skyBottom, y / horizon)
      : lerpColor(palette.ground, palette.groundDark, (y - horizon) / (fb.height - horizon));
    for (let x = 0; x < fb.width; x++) fb.setPixel(x, y, c);
  }
  const env = { time: t, dt: 1 / 60, dayPhase: night, palette, camera };
  // Chưa có World (#9) để bấm chuột: demo tự mở cửa ở giây thứ 1, rồi cứ 3 giây
  // lại đổi mở ↔ đóng. dt lấy theo thời gian thật giữa hai khung để cửa luôn
  // mở trong ~0,6 giây dù máy vẽ chậm.
  const doorPhase = t < 1 ? -1 : Math.floor((t - 1) / 3);
  if (doorPhase !== lastDoorPhase) {
    if (doorPhase >= 0) house.toggleDoor();
    lastDoorPhase = doorPhase;
  }
  env.dt = lastTime < 0 || t < lastTime ? 1 / 60 : Math.min(0.1, t - lastTime);
  lastTime = t;
  tree.update(env);
  house.update(env);
  tree.draw(renderer, env);
  house.draw(renderer, env);
  fence.draw(renderer, env);
  path.draw(renderer, env);
}
