/**
 * Demo `?demo=scene`: toàn cảnh, ghép mọi vật thể đã merge vào `main`.
 *
 * Tự nạp mọi file `src/scene/<vùng>/index.ts` và gọi các hàm `create…()` mà file
 * đó export (`createMidground`, `createForeground`, `createRocks`…). Vùng mới
 * merge là tự có mặt, không ai phải sửa file này. Vật thể vẽ theo `layer` tăng
 * dần; cùng layer giữ thứ tự nạp.
 *
 * Tới khi có `World` (#9), demo tự làm phần tối thiểu để xem và thử:
 * - Ngày ↔ đêm tự đổi mỗi 8 giây; bấm phím `N` để tự đổi (tắt chế độ tự động).
 *   `?demo=scene&phase=day` hoặc `&phase=night` để đứng yên một pha.
 * - Bấm chuột vào vật `interactive`: gọi `onClick` của vật trên cùng tại điểm đó
 *   (ví dụ bấm nhà nấm để mở cửa).
 * - Vị trí chuột (toạ độ world) truyền qua `env.pointer` cho vật nào cần phản ứng.
 *
 * Nền trời và đất bên dưới chỉ là nền tạm; khi #10/#12/#13 merge thì vật thể
 * nền vẽ đè lên.
 */
import { Camera } from '../core/camera.ts';
import { lerpColor } from '../core/color.ts';
import type { Framebuffer } from '../core/framebuffer.ts';
import { Renderer } from '../core/renderer.ts';
import { vec2, type Vec2 } from '../core/vec2.ts';
import { DayNightCycle } from '../scene/theme.ts';
import type { ClickContext, Env, SceneObject, UiActions } from '../scene/types.ts';

type RegionModule = Record<string, unknown>;

/** Mọi vùng cảnh: `src/scene/<vùng>/index.ts`. */
const regions = import.meta.glob<RegionModule>('../scene/*/index.ts', { eager: true });

/** Gọi mọi hàm `create…()` của từng vùng, gom vật thể, sắp theo layer. */
export function collectSceneObjects(mods: Record<string, RegionModule> = regions): SceneObject[] {
  const objects: SceneObject[] = [];
  for (const path of Object.keys(mods).sort()) {
    for (const [name, value] of Object.entries(mods[path])) {
      if (!name.startsWith('create') || typeof value !== 'function') continue;
      const made = (value as () => unknown)();
      if (Array.isArray(made)) objects.push(...(made as SceneObject[]));
    }
  }
  // Array.prototype.sort ổn định: cùng layer giữ thứ tự nạp
  return objects.sort((a, b) => a.layer - b.layer);
}

/** Điểm trong đa giác (even-odd). */
function inside(p: Vec2, poly: readonly Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Vật `interactive` nằm trên cùng tại điểm world `p`, hoặc `null`. */
export function pickObject(objects: readonly SceneObject[], p: Vec2, env: Env): SceneObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (!o.interactive || !o.hitPolygons) continue;
    if (o.hitPolygons(env).some((poly) => inside(p, poly))) return o;
  }
  return null;
}

let objects: SceneObject[] = [];
const theme = new DayNightCycle();
let auto = true;
let started = false;

let renderer: Renderer | null = null;
let camera: Camera | null = null;
let target: Framebuffer | null = null;
let lastTime = -1;
let lastCycle = 0;
let pointer: Vec2 | null = null;
let pendingClick: Vec2 | null = null;
let selected: SceneObject | null = null;

const ui: UiActions = {
  toggleDayNight: () => theme.toggle(),
  select: (obj) => { selected = obj; },
  getSelected: () => selected,
};

/** Toạ độ chuột trên canvas → toạ độ world. */
function toWorld(canvas: HTMLCanvasElement, event: MouseEvent): Vec2 | null {
  if (!camera) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return camera.screenToWorld(vec2(
    ((event.clientX - rect.left) / rect.width) * canvas.width,
    ((event.clientY - rect.top) / rect.height) * canvas.height,
  ));
}

/**
 * Khởi tạo lần đầu demo chạy (không làm lúc nạp file, vì `src/demo/index.ts` nạp
 * mọi demo cho mọi trang): tạo vật thể, đọc `?phase=`, gắn sự kiện chuột/phím.
 */
function start(): void {
  started = true;
  objects = collectSceneObjects();
  // Chạy ngoài trình duyệt (test, script chụp ảnh) thì bỏ qua URL và sự kiện
  if (typeof document === 'undefined') return;
  const fixedPhase = new URLSearchParams(location.search).get('phase');
  auto = fixedPhase !== 'day' && fixedPhase !== 'night';
  if (fixedPhase === 'night') {
    theme.toggle();
    theme.update(10);
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  canvas?.addEventListener('pointermove', (e) => { pointer = toWorld(canvas, e); });
  canvas?.addEventListener('pointerleave', () => { pointer = null; });
  canvas?.addEventListener('click', (e) => { pendingClick = toWorld(canvas, e); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n' || e.key === 'N') {
      auto = false;
      theme.toggle();
    }
  });
}

/** Nền tạm: trời gradient, đất từ y = 450 (world). */
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

export default function sceneDemo(fb: Framebuffer, t: number): void {
  if (!started) start();
  if (target !== fb || !renderer || !camera) {
    camera = new Camera();
    renderer = new Renderer(fb, camera);
    target = fb;
  }
  const dt = lastTime < 0 || t < lastTime ? 1 / 60 : Math.min(0.1, t - lastTime);
  lastTime = t;

  // Tự đổi ngày ↔ đêm mỗi 8 giây (ngày 0–8 s, đêm 8–16 s…)
  const cycle = Math.floor(t / 8);
  if (auto && cycle !== lastCycle) theme.toggle();
  lastCycle = cycle;
  theme.update(dt);

  const env = { time: t, dt, dayPhase: theme.phase, palette: theme.palette(), camera, pointer } as Env;

  if (pendingClick) {
    const hit = pickObject(objects, pendingClick, env);
    ui.select(hit);
    if (hit?.onClick) hit.onClick({ env, ui } satisfies ClickContext);
    pendingClick = null;
  }

  for (const o of objects) o.update?.(env);
  renderer.begin(env.palette.skyBottom);
  drawBackdrop(fb, env);
  for (const o of objects) o.draw(renderer, env);
}
