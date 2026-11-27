import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import {
  attachInput,
  canvasPointToLogical,
  wheelZoomFactor,
  type InputWorld,
} from '../src/core/input.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import type { SceneObject } from '../src/scene/types.ts';

type Handler = (event: unknown) => void;

class FakeView {
  private readonly listeners = new Map<string, Handler[]>();

  addEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(type, list.filter((h) => h !== handler));
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  count(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

class FakeCanvas {
  width = 1600;
  height = 900;
  readonly style = { cursor: '' };
  readonly ownerDocument: { defaultView: FakeView | null };
  private readonly listeners = new Map<string, Handler[]>();

  constructor(view: FakeView | null) {
    this.ownerDocument = { defaultView: view };
  }

  addEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(type, list.filter((h) => h !== handler));
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  count(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 800, height: 450 } as DOMRect;
  }

  setPointerCapture(): void {}

  releasePointerCapture(): void {}
}

function eventOf(partial: Record<string, unknown>): Record<string, unknown> {
  let prevented = false;
  return {
    pointerId: 1,
    button: 0,
    clientX: 0,
    clientY: 0,
    deltaY: 0,
    target: null,
    preventDefault: () => { prevented = true; },
    get prevented() { return prevented; },
    ...partial,
  };
}

const OBJECT = { id: 'obj' } as SceneObject;

interface Harness {
  canvas: FakeCanvas;
  view: FakeView;
  camera: Camera;
  hovered: Array<SceneObject | null>;
  clicked: Vec2[];
  toggles: number;
  selected: SceneObject | null;
  world: InputWorld;
  dispose: () => void;
}

function harness(): Harness {
  const view = new FakeView();
  const canvas = new FakeCanvas(view);
  const camera = new Camera();
  let nextHit: SceneObject | null = null;
  const hovered: Array<SceneObject | null> = [];
  const clicked: Vec2[] = [];
  let toggles = 0;

  const world: InputWorld = {
    pickFromScreen: () => nextHit,
    setHover: (obj) => hovered.push(obj),
    clickFromScreen: (p) => {
      clicked.push(p);
      return nextHit;
    },
    toggleDayNight: () => { toggles++; },
    select: () => {},
  };

  (world as unknown as { setNextHit: (o: SceneObject | null) => void }).setNextHit = (o) => {
    nextHit = o;
  };

  const dispose = attachInput(canvas as unknown as HTMLCanvasElement, { camera }, world);
  const h: Harness = {
    canvas, view, camera, hovered, clicked, toggles: 0, selected: null, world, dispose,
  };
  Object.defineProperty(h, 'toggles', { get: () => toggles });
  return h;
}

describe('canvasPointToLogical', () => {
  it('bù CSS scale về pixel canvas (backing store)', () => {
    const p = canvasPointToLogical(
      { clientX: 210, clientY: 245 },
      { left: 10, top: 20, width: 800, height: 450 },
      1600,
      900,
    );
    expect(p).toEqual({ x: 400, y: 450 });
  });

  it('rect rỗng trả gốc toạ độ, không chia cho 0', () => {
    expect(canvasPointToLogical(
      { clientX: 50, clientY: 50 },
      { left: 0, top: 0, width: 0, height: 0 },
      1600,
      900,
    )).toEqual({ x: 0, y: 0 });
  });
});

describe('wheelZoomFactor', () => {
  it('cuộn lên phóng to, cuộn xuống thu nhỏ, delta 0 trung tính', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(Number.NaN)).toBe(1);
  });
});

describe('attachInput', () => {
  it('hover đổi cursor theo vật dưới con trỏ', () => {
    const h = harness();
    const setNextHit = (h.world as unknown as { setNextHit: (o: SceneObject | null) => void }).setNextHit;

    setNextHit(OBJECT);
    h.canvas.dispatch('pointermove', eventOf({ clientX: 100, clientY: 100 }));
    expect(h.hovered.at(-1)).toBe(OBJECT);
    expect(h.canvas.style.cursor).toBe('pointer');

    setNextHit(null);
    h.canvas.dispatch('pointermove', eventOf({ clientX: 120, clientY: 120 }));
    expect(h.hovered.at(-1)).toBeNull();
    expect(h.canvas.style.cursor).toBe('default');
    h.dispose();
  });

  it('nhấn-thả chuột trái là click, kéo xa thì không', () => {
    const h = harness();
    h.canvas.dispatch('pointerdown', eventOf({ button: 0, clientX: 100, clientY: 100 }));
    h.canvas.dispatch('pointerup', eventOf({ button: 0, clientX: 101, clientY: 100 }));
    expect(h.clicked).toEqual([{ x: 202, y: 200 }]);

    h.canvas.dispatch('pointerdown', eventOf({ button: 0, clientX: 100, clientY: 100 }));
    h.canvas.dispatch('pointerup', eventOf({ button: 0, clientX: 160, clientY: 100 }));
    expect(h.clicked).toHaveLength(1);
    h.dispose();
  });

  it('chuột giữa + kéo pan theo delta màn hình, camera tự clamp', () => {
    const h = harness();
    h.camera.zoom = 2;

    h.canvas.dispatch('pointerdown', eventOf({ button: 1, clientX: 400, clientY: 225 }));
    h.canvas.dispatch('pointermove', eventOf({ button: 1, clientX: 320, clientY: 225 }));
    h.canvas.dispatch('pointerup', eventOf({ button: 1, clientX: 320, clientY: 225 }));

    // dx CSS = -80 → dx screen = -160 → /RENDER_SCALE(1.5) ≈ -106.67
    expect(h.camera.panX).toBeCloseTo(-160 / 1.5);
    expect(h.camera.panY).toBeCloseTo(0);
    h.dispose();
  });

  it('wheel zoom quanh con trỏ', () => {
    const h = harness();
    h.canvas.dispatch('wheel', eventOf({ clientX: 400, clientY: 225, deltaY: -100 }));
    expect(h.camera.zoom).toBeGreaterThan(1);
    h.dispose();
  });

  it('phím N/+/0/Escape điều khiển world và camera, bỏ qua khi đang gõ', () => {
    const h = harness();
    h.view.dispatch('keydown', eventOf({ key: 'n' }));
    expect(h.toggles).toBe(1);

    h.view.dispatch('keydown', eventOf({ key: '+' }));
    expect(h.camera.zoom).toBeGreaterThan(1);

    h.view.dispatch('keydown', eventOf({ key: '0' }));
    expect(h.camera.zoom).toBe(1);

    h.view.dispatch('keydown', eventOf({ key: 'n', target: { tagName: 'INPUT' } }));
    expect(h.toggles).toBe(1);
    h.dispose();
  });

  it('cleanup gỡ listener', () => {
    const h = harness();
    expect(h.canvas.count('wheel')).toBe(1);
    expect(h.view.count('keydown')).toBe(1);

    h.dispose();
    expect(h.canvas.count('wheel')).toBe(0);
    expect(h.view.count('keydown')).toBe(0);

    h.canvas.dispatch('wheel', eventOf({ clientX: 400, clientY: 225, deltaY: -100 }));
    expect(h.camera.zoom).toBe(1);
  });
});
