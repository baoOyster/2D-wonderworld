/**
 * Demo `?demo=world`: chạy cảnh thật qua `World` + `attachInput` (#9).
 *
 * Khác `?demo=scene` (bản tạm tự xử lý chuột), demo này dùng đúng pipeline:
 * `World.update/draw/drawOverlay` + input chung (chọn, hover, zoom, pan, phím).
 * Không cần chờ `main.ts` (#26) để thử tương tác.
 */
import { Camera } from '../core/camera.ts';
import { lerpColor } from '../core/color.ts';
import type { Framebuffer } from '../core/framebuffer.ts';
import { attachInput, type InputEngine } from '../core/input.ts';
import { Renderer } from '../core/renderer.ts';
import { DayNightCycle } from '../scene/theme.ts';
import type { Env } from '../scene/types.ts';
import { World } from '../scene/world.ts';
import { collectSceneObjects } from './scene.ts';

let started = false;
let world: World | null = null;
let camera: Camera | null = null;
let renderer: Renderer | null = null;
let overlay: Renderer | null = null;
let target: Framebuffer | null = null;
let lastTime = -1;

function drawBackdrop(fb: Framebuffer, env: Env): void {
  const p = env.palette;
  const horizon = Math.round(450 * (fb.height / 720));
  for (let y = 0; y < fb.height; y++) {
    const c = y < horizon
      ? lerpColor(p.skyTop, p.skyBottom, y / horizon)
      : lerpColor(p.ground, p.groundDark, (y - horizon) / (fb.height - horizon));
    for (let x = 0; x < fb.width; x++) fb.setPixel(x, y, c);
  }
}

function start(): void {
  started = true;
  camera = new Camera();
  world = new World(camera, collectSceneObjects(), new DayNightCycle());

  if (typeof document === 'undefined') return;
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  if (!canvas) return;
  const engine: InputEngine = { camera };
  attachInput(canvas, engine, world);
}

export default function worldDemo(fb: Framebuffer, t: number): void {
  if (!started) start();
  if (!world || !camera) return;

  if (target !== fb || !renderer || !overlay) {
    target = fb;
    renderer = new Renderer(fb, camera);
    overlay = new Renderer(fb, new Camera());
  }

  const dt = lastTime < 0 || t < lastTime ? 1 / 60 : Math.min(0.1, t - lastTime);
  lastTime = t;

  world.update(dt, t);
  const env = world.environment;

  fb.clear(env.palette.skyBottom);
  drawBackdrop(fb, env);
  world.draw(renderer);
  world.drawOverlay(overlay);
}
