import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { DAY } from '../src/core/palette.ts';
import type { Renderer } from '../src/core/renderer-types.ts';
import { Layer } from '../src/scene/layers.ts';
import type {
  ClickContext,
  Env,
  SceneObject,
  UiActions,
  WorldCallbacks,
} from '../src/scene/types.ts';

const ENV: Env = {
  time: 1.5,
  dt: 1 / 60,
  dayPhase: 0,
  palette: DAY,
  camera: new Camera(),
};

describe('Layer', () => {
  it('khớp đúng giá trị SPEC #1', () => {
    expect(Layer).toEqual({
      SKY: 0,
      STARS: 1,
      CELESTIAL: 2,
      CLOUD: 3,
      MOUNTAIN_FAR: 4,
      MOUNTAIN_NEAR: 5,
      FOREST_FAR: 6,
      FOREST_NEAR: 7,
      GROUND: 8,
      LAKE: 9,
      FISH: 10,
      ROCK: 12,
      BRIDGE: 13,
      TREE: 20,
      HOUSE: 21,
      FENCE: 22,
      PATH: 23,
      FLOWER: 30,
      GRASS: 31,
      SMALL_DECOR: 32,
      RABBIT: 33,
      LEAF_FG: 34,
      BUTTERFLY: 40,
      FIREFLY: 41,
      BIRD: 42,
      OVERLAY: 100,
    });
  });

  it('giá trị tăng dần và không trùng', () => {
    const values = Object.values(Layer);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('nhóm thứ tự quan trọng đúng z-order', () => {
    expect(Layer.LAKE).toBeLessThan(Layer.FISH);
    expect(Layer.FISH).toBeLessThan(Layer.BRIDGE);
    expect(Layer.TREE).toBeLessThan(Layer.HOUSE);
    expect(Layer.HOUSE).toBeLessThan(Layer.FENCE);
    expect(Layer.LEAF_FG).toBeLessThan(Layer.BUTTERFLY);
    expect(Layer.BUTTERFLY).toBeLessThan(Layer.OVERLAY);
  });
});

describe('SceneObject', () => {
  it('dùng được đúng hợp đồng: update, draw, hitPolygons, onClick', () => {
    let drawn = 0;
    let updates = 0;
    const selected: Array<SceneObject | null> = [];
    const ui: UiActions = {
      toggleDayNight: () => undefined,
      select: (obj) => selected.push(obj),
      getSelected: () => selected.at(-1) ?? null,
    };
    const renderer = {} as Renderer;

    const obj: SceneObject = {
      id: 'co-thu',
      name: 'Cây cổ thụ',
      description: 'Cây lớn ở giữa cảnh.',
      algorithms: ['Bresenham', 'ellipse', 'flood fill'],
      layer: Layer.TREE,
      interactive: true,
      update: (env) => {
        expect(env.dt).toBeCloseTo(1 / 60);
        updates++;
      },
      draw: (r, env) => {
        expect(r).toBe(renderer);
        expect(env.palette).toBe(DAY);
        drawn++;
      },
      hitPolygons: () => [
        [
          { x: 190, y: 440 },
          { x: 360, y: 440 },
          { x: 360, y: 40 },
        ],
      ],
      onClick: (ctx) => ctx.ui.select(obj),
    };

    obj.update?.(ENV);
    obj.draw(renderer, ENV);
    obj.onClick?.({ env: ENV, ui });

    expect(updates).toBe(1);
    expect(drawn).toBe(1);
    expect(obj.hitPolygons?.(ENV)).toHaveLength(1);
    expect(selected).toEqual([obj]);
    expect(ui.getSelected()).toBe(obj);
  });

  it('ClickContext ghép Env và UiActions', () => {
    const ui: UiActions = {
      toggleDayNight: () => undefined,
      select: () => undefined,
      getSelected: () => null,
    };
    const ctx: ClickContext = { env: ENV, ui };
    expect(ctx.env.time).toBe(1.5);
    expect(ctx.ui.getSelected()).toBeNull();
  });
});

describe('WorldCallbacks', () => {
  it('nhận lựa chọn và hover', () => {
    const events: Array<SceneObject | null> = [];
    const callbacks: WorldCallbacks = {
      onSelectionChange: (selected) => events.push(selected),
      onHoverChange: (hovered) => events.push(hovered),
    };
    const obj: SceneObject = {
      id: 'nha-nam',
      name: 'Nhà nấm',
      description: 'Nhà nhỏ nép trong rễ cây.',
      algorithms: ['ellipse'],
      layer: Layer.HOUSE,
      interactive: true,
      draw: () => undefined,
      hitPolygons: () => [],
    };

    callbacks.onSelectionChange?.(obj);
    callbacks.onHoverChange?.(null);
    expect(events).toEqual([obj, null]);
  });
});
