import { Camera } from './camera.ts';
import type { RGBA } from './color.ts';
import { FB_H, FB_W } from './config.ts';
import { Framebuffer } from './framebuffer.ts';
import { Presenter } from './presenter.ts';
import type { Renderer } from './renderer-types.ts';

/** Cảnh mà engine điều khiển; khớp SPEC #1 mục 3.7. */
export interface Scene {
  update(dt: number, time: number): void;
  draw(renderer: Renderer): void;
  drawOverlay?(renderer: Renderer): void;
}

/** Tạo renderer cho framebuffer; `overlay = true` là lớp UI không zoom/pan. */
export type RendererFactory = (fb: Framebuffer, camera: Camera, overlay: boolean) => Renderer;

const FIXED_STEP = 1 / 60;
const MAX_FRAME_DT = 0.25;
const MAX_UPDATES_PER_FRAME = 5;
const FPS_SMOOTHING = 0.1;

/**
 * Vòng lặp renderer + fixed timestep.
 *
 * Mỗi frame:
 *
 * ```
 * accumulator += min(frameDt, 250ms)
 * update(1/60) tối đa 5 lần
 * world.begin → scene.draw(world) → scene.drawOverlay(overlay) → present
 * ```
 *
 * `overlay` dùng camera `scale(RENDER_SCALE)` (zoom 1, pan 0) nên chữ/viền UI
 * không bị phóng theo camera của thế giới.
 */
export class Engine {
  readonly camera: Camera;
  readonly framebuffer: Framebuffer;
  readonly world: Renderer;
  readonly overlay: Renderer;

  private readonly presenter: Presenter;
  private readonly clearColor: RGBA;
  private scene: Scene | null = null;
  private running = false;
  private frameHandle = 0;
  private lastFrameTime = 0;
  private accumulator = 0;
  private elapsed = 0;
  private currentFps = 0;
  private lastRenderTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    makeRenderer: RendererFactory,
    clearColor: RGBA = 0x000000ff,
  ) {
    this.framebuffer = new Framebuffer(FB_W, FB_H);
    this.camera = new Camera();
    this.overlay = makeRenderer(this.framebuffer, new Camera(), true);
    this.world = makeRenderer(this.framebuffer, this.camera, false);
    this.presenter = new Presenter(canvas);
    this.clearColor = clearColor;
  }

  mount(scene: Scene): void {
    this.scene = scene;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  /** Thời gian mô phỏng đã trôi (giây, chỉ tăng theo bước 1/60). */
  get time(): number {
    return this.elapsed;
  }

  /** FPS làm mượt bằng EMA. */
  get fps(): number {
    return this.currentFps;
  }

  /** Thời gian vẽ của khung gần nhất (ms, làm mượt EMA). */
  get renderTime(): number {
    return this.lastRenderTime;
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;

    const rawDt = Math.max(0, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (rawDt > 0) {
      const instantFps = 1 / rawDt;
      this.currentFps = this.currentFps === 0
        ? instantFps
        : this.currentFps + (instantFps - this.currentFps) * FPS_SMOOTHING;
    }

    this.accumulator += Math.min(rawDt, MAX_FRAME_DT);

    let updates = 0;
    while (this.accumulator >= FIXED_STEP && updates < MAX_UPDATES_PER_FRAME) {
      this.scene?.update(FIXED_STEP, this.elapsed);
      this.elapsed += FIXED_STEP;
      this.accumulator -= FIXED_STEP;
      updates++;
    }
    // Tab quay lại sau thời gian dài: bỏ phần dư, không để dồn vô hạn.
    if (updates === MAX_UPDATES_PER_FRAME) this.accumulator = 0;

    const startedAt = performance.now();
    this.world.begin(this.clearColor);
    if (this.scene) {
      this.scene.draw(this.world);
      this.scene.drawOverlay?.(this.overlay);
    }
    const drawMs = performance.now() - startedAt;
    this.lastRenderTime = this.lastRenderTime === 0
      ? drawMs
      : this.lastRenderTime + (drawMs - this.lastRenderTime) * FPS_SMOOTHING;

    this.presenter.present(this.framebuffer);
    this.frameHandle = requestAnimationFrame(this.tick);
  };
}
