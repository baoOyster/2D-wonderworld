import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import type { RGBA } from '../src/core/color.ts';
import { Engine, type Scene } from '../src/core/engine.ts';
import type { Framebuffer } from '../src/core/framebuffer.ts';
import type { Renderer } from '../src/core/renderer-types.ts';

const FIXED_STEP = 1 / 60;
const FRAME_MS = 1000 / 60;

/** Đồng hồ giả: điều khiển cả `performance.now` lẫn rAF nên test tất định. */
let clock = 0;
let frames: ((now: number) => void)[] = [];
let nextHandle = 1;
let cancelled: number[] = [];
let presented: ImageData[] = [];

const realNow = performance.now.bind(performance);

function installStubs(): void {
  clock = 0;
  frames = [];
  nextHandle = 1;
  cancelled = [];
  presented = [];

  performance.now = () => clock;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (cb: (now: number) => void) => {
      frames.push(cb);
      return nextHandle++;
    },
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => cancelled.push(handle),
  });
}

afterEach(() => {
  performance.now = realNow;
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function fakeCanvas(): HTMLCanvasElement {
  const context = {
    putImageData: (image: ImageData) => presented.push(image),
  };
  return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
}

/** Renderer giả (#8): xoá bằng `begin`, vẽ bằng `setPixel` của framebuffer. */
class FakeRenderer implements Renderer {
  beginCount = 0;

  constructor(
    readonly framebuffer: Framebuffer,
    readonly camera: Camera,
    readonly overlay: boolean,
  ) {}

  begin(clearColor: RGBA): void {
    this.beginCount++;
    this.framebuffer.clear(clearColor);
  }

  mark(x: number, y: number, color: RGBA): void {
    this.framebuffer.setPixel(x, y, color);
  }

  line(): void {}
  polyline(): void {}
  circle(): void {}
  ellipse(): void {}
  polygon(): void {}
  floodFill(): void {}
  text(): void {}
  mask(): never {
    throw new Error('Renderer giả không dùng mask');
  }
  shape(): void {}
}

interface Harness {
  engine: Engine;
  renders: FakeRenderer[];
  updates: { dt: number; time: number }[];
  overlayDraws: number[];
}

function harness(): Harness {
  installStubs();
  const renders: FakeRenderer[] = [];
  const updates: { dt: number; time: number }[] = [];
  const overlayDraws: number[] = [];

  const engine = new Engine(fakeCanvas(), (fb, camera, overlay) => {
    const renderer = new FakeRenderer(fb, camera, overlay);
    renders.push(renderer);
    return renderer;
  });

  engine.mount({
    update(dt, time) {
      updates.push({ dt, time });
    },
    draw(renderer) {
      (renderer as FakeRenderer).mark(1, 1, 0x00ff00ff);
    },
    drawOverlay(renderer) {
      overlayDraws.push(engine.time);
      (renderer as FakeRenderer).mark(0, 0, 0xffffffff);
    },
  } satisfies Scene);

  return { engine, renders, updates, overlayDraws };
}

/** Chạy một frame: đồng hồ tiến thêm `ms` rồi bấm callback rAF đang chờ. */
function frame(ms = FRAME_MS): void {
  clock += ms;
  const pending = frames;
  frames = [];
  for (const cb of pending) cb(clock);
}

describe('Engine', () => {
  beforeEach(() => installStubs());

  it('dựng framebuffer 1920×1080 và camera overlay riêng, không zoom/pan', () => {
    const { engine, renders } = harness();

    expect(engine.framebuffer.width).toBe(1920);
    expect(engine.framebuffer.height).toBe(1080);
    // Overlay tạo trước, world tạo sau (camera thế giới).
    expect(renders[0]!.overlay).toBe(true);
    expect(renders[1]!.overlay).toBe(false);
    expect(engine.overlay).toBe(renders[0]);
    expect(engine.world).toBe(renders[1]);
    expect(renders[0]!.camera).not.toBe(engine.camera);

    engine.camera.zoom = 3;
    engine.camera.panX = -640;

    expect(renders[0]!.camera.zoom).toBe(1);
    expect(renders[0]!.camera.panX).toBe(0);
    // Overlay chỉ nhân RENDER_SCALE: 15/1.5 = 10.
    expect(renders[0]!.camera.worldToScreen({ x: 10, y: 20 })).toEqual({ x: 15, y: 30 });
  });

  it('mỗi frame: clear → draw → overlay → present, update cố định 1/60', () => {
    const { engine, updates, overlayDraws } = harness();
    engine.start();

    frame();
    expect(updates).toEqual([{ dt: FIXED_STEP, time: 0 }]);
    expect(engine.time).toBeCloseTo(FIXED_STEP, 9);
    expect(overlayDraws).toHaveLength(1);
    expect(presented).toHaveLength(1);

    frame();
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ dt: FIXED_STEP, time: FIXED_STEP });
    expect(engine.framebuffer.getPixel(1, 1)).toBe(0x00ff00ff);
    expect(engine.framebuffer.getPixel(0, 0)).toBe(0xffffffff);

    engine.stop();
    expect(cancelled).toHaveLength(1);
    frame();
    expect(presented).toHaveLength(2);
  });

  it('kẹp accumulator: tối đa 5 update/frame và bỏ phần dư khi tab quay lại', () => {
    const { engine, updates } = harness();
    engine.start();

    frame();
    updates.length = 0;

    // Tab nằm nền 5 giây: chỉ 250 ms được tính, tối đa 5 update.
    frame(5000);
    expect(updates).toHaveLength(5);
    expect(engine.time).toBeCloseTo(6 * FIXED_STEP, 9);

    // Frame sau chỉ có đúng 1 update: phần dư đã bị bỏ, không dồn.
    updates.length = 0;
    frame();
    expect(updates).toHaveLength(1);
    expect(engine.time).toBeCloseTo(7 * FIXED_STEP, 9);
  });

  it('fps/renderTime dùng EMA nên một frame dài không làm sập số đo', () => {
    const { engine } = harness();
    engine.start();

    frame();
    expect(engine.fps).toBeCloseTo(60, 4);

    frame(200);
    expect(engine.fps).toBeGreaterThan(50);
    expect(engine.fps).toBeLessThan(60);
    expect(engine.renderTime).toBe(0);
  });
});
