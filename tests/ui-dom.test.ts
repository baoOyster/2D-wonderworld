/**
 * Test DOM tối giản cho panel/toolbar/mountUi.
 *
 * Dự án chưa cài jsdom/happy-dom nên dùng stub đủ API mà lớp UI gọi tới
 * (`createElement`, `append`, `setAttribute`, listener, rAF). Không nhằm thay
 * thế kiểm thử trình duyệt thật — vẫn cần xem `?demo=world`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera } from '../src/core/camera.ts';
import type { SceneObject } from '../src/scene/types.ts';
import type { World } from '../src/scene/world.ts';
import { mountUi } from '../src/ui/index.ts';
import { createInfoPanel } from '../src/ui/panel.ts';
import { createToolbar } from '../src/ui/toolbar.ts';

interface FakeEvent {
  type: string;
  key?: string;
  preventDefault: () => void;
}

type Listener = (event: FakeEvent) => void;

class FakeElement {
  readonly tagName: string;
  className = '';
  id = '';
  title = '';
  type = '';
  hidden = false;
  textContent = '';
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private parent: FakeElement | null = null;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node: FakeElement): FakeElement {
    node.parent?.detach(node);
    this.children.push(node);
    node.parent = this;
    return node;
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.length = 0;
    this.append(...nodes);
  }

  remove(): void {
    this.parent?.detach(this);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): void {
    const event: FakeEvent = { type, preventDefault: vi.fn(), ...init };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  private detach(node: FakeElement): void {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
  }
}

function makeFakeDocument() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    createElement: (tag: string): FakeElement => new FakeElement(tag),
    addEventListener(type: string, listener: Listener): void {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener): void {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string, init: Partial<FakeEvent> = {}): void {
      const event: FakeEvent = { type, preventDefault: vi.fn(), ...init };
      for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
    },
  };
}

let doc: ReturnType<typeof makeFakeDocument>;
let frames: Array<{ id: number; cb: FrameRequestCallback }>;
let nextFrameId: number;

beforeEach(() => {
  doc = makeFakeDocument();
  frames = [];
  nextFrameId = 1;
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrameId++;
    frames.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runFrame(): void {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame.cb(0);
}

const object = (id: string, name: string): SceneObject => ({
  id,
  name,
  description: `Mô tả ${name}`,
  algorithms: ['DDA', 'Polygon Fill'],
  layer: 2,
  interactive: true,
  draw() {},
});

function fakeCamera() {
  const camera = {
    zoom: 1,
    zoomAt: vi.fn(),
    reset: vi.fn(),
  };
  return camera;
}

function fakeWorld(initial: SceneObject | null, dayPhase = 0) {
  const environment = { dayPhase };
  let selected = initial;
  const world = {
    environment,
    toggleDayNight: vi.fn(() => {
      environment.dayPhase = environment.dayPhase >= 0.5 ? 0 : 1;
    }),
    select: vi.fn((obj: SceneObject | null) => {
      selected = obj;
    }),
    getSelected: () => selected,
  };
  return {
    world: world as unknown as World,
    select: world.select,
    setSelected: (obj: SceneObject | null) => {
      selected = obj;
    },
  };
}

function asElement(value: unknown): FakeElement {
  return value as FakeElement;
}

describe('info panel', () => {
  it('hiện/ẩn theo vật và đóng bằng nút hoặc Esc', () => {
    const root = asElement(doc.createElement('div'));
    const onClose = vi.fn();
    const panel = createInfoPanel(root as unknown as HTMLElement, { onClose });
    const element = asElement(panel.element);

    expect(element.hidden).toBe(true);

    const obj = object('den', 'Đèn lồng');
    panel.setObject(obj);
    expect(element.hidden).toBe(false);
    expect(asElement(element.children[1]).textContent).toBe('Đèn lồng');
    expect(asElement(element.children[2]).textContent).toBe('Mô tả Đèn lồng');

    const chips = asElement(element.children[3]).children;
    expect(chips.map((chip) => chip.textContent)).toEqual(['DDA', 'Polygon Fill']);

    asElement(element.children[0]).dispatch('click');
    expect(element.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    panel.setObject(obj);
    doc.dispatch('keydown', { key: 'Escape' });
    expect(element.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(2);

    panel.destroy();
    expect(root.children).toHaveLength(0);
  });

  it('bỏ qua Esc khi panel đang ẩn', () => {
    const root = asElement(doc.createElement('div'));
    const onClose = vi.fn();
    createInfoPanel(root as unknown as HTMLElement, { onClose });

    doc.dispatch('keydown', { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('toolbar', () => {
  it('gọi camera/world và đồng bộ nhãn', () => {
    const root = asElement(doc.createElement('div'));
    const camera = fakeCamera();
    const { world } = fakeWorld(null, 0);
    const toolbar = createToolbar(root as unknown as HTMLElement, {
      engine: {
        camera: camera as unknown as Camera,
        framebuffer: { width: 1920, height: 1080 },
      },
      world,
    });

    const element = asElement(toolbar.element);
    const [zoomIn, zoomOut, reset, readout, dayNight] = element.children.map(asElement);

    expect(dayNight.textContent).toBe('Ngày');
    expect(dayNight.getAttribute('aria-pressed')).toBe('false');
    expect(readout.textContent).toBe('100%');

    dayNight.dispatch('click');
    expect(world.toggleDayNight).toHaveBeenCalledTimes(1);
    toolbar.sync();
    expect(dayNight.textContent).toBe('Đêm');
    expect(dayNight.getAttribute('aria-pressed')).toBe('true');

    camera.zoom = 1.5;
    toolbar.sync();
    expect(readout.textContent).toBe('150%');

    zoomIn.dispatch('click');
    expect(camera.zoomAt).toHaveBeenLastCalledWith({ x: 960, y: 540 }, 1.2);
    zoomOut.dispatch('click');
    expect(camera.zoomAt).toHaveBeenLastCalledWith({ x: 960, y: 540 }, 1 / 1.2);
    reset.dispatch('click');
    expect(camera.reset).toHaveBeenCalledTimes(1);

    toolbar.destroy();
    expect(root.children).toHaveLength(0);
  });
});

describe('mountUi', () => {
  it('gắn panel/toolbar, đồng bộ theo vòng lặp và cleanup', () => {
    const container = asElement(doc.createElement('div'));
    const camera = fakeCamera();
    const obj = object('cau', 'Cầu gỗ');
    const { world, select, setSelected } = fakeWorld(obj);

    const cleanup = mountUi(
      container as unknown as HTMLElement,
      {
        camera: camera as unknown as Camera,
        framebuffer: { width: 1920, height: 1080 },
      },
      world,
    );

    expect(container.children).toHaveLength(1);
    const shell = asElement(container.children[0]);
    const toolbar = asElement(asElement(shell.children[0]).children[0]);
    const panel = asElement(asElement(shell.children[1]).children[0]);

    expect(panel.hidden).toBe(false);
    expect(asElement(panel.children[1]).textContent).toBe('Cầu gỗ');
    expect(asElement(toolbar.children[4]).textContent).toBe('Ngày');

    asElement(panel.children[0]).dispatch('click');
    expect(select).toHaveBeenCalledWith(null);
    runFrame();
    expect(panel.hidden).toBe(true);

    setSelected(object('hoa', 'Hoa'));
    runFrame();
    expect(panel.hidden).toBe(false);
    expect(asElement(panel.children[1]).textContent).toBe('Hoa');

    cleanup();
    expect(container.children).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });
});
