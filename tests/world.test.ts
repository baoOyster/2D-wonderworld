import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { DAY } from '../src/core/palette.ts';
import type { Renderer } from '../src/core/renderer-types.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import { DayNightCycle } from '../src/scene/theme.ts';
import type { Env, SceneObject, WorldCallbacks } from '../src/scene/types.ts';
import { World } from '../src/scene/world.ts';

const square = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  vec2(x0, y0),
  vec2(x1, y0),
  vec2(x1, y1),
  vec2(x0, y1),
];

interface FakeOptions {
  layer: number;
  interactive?: boolean;
  polygons?: Vec2[][];
  onClick?: SceneObject['onClick'];
}

function makeObject(id: string, opts: FakeOptions): SceneObject {
  return {
    id,
    name: id,
    description: `mô tả ${id}`,
    algorithms: ['test'],
    layer: opts.layer,
    interactive: opts.interactive ?? false,
    draw: () => {
      drawLog.push(id);
    },
    hitPolygons: opts.polygons ? () => opts.polygons! : undefined,
    onClick: opts.onClick,
  };
}

let drawLog: string[] = [];

function screenOf(camera: Camera, world: Vec2): Vec2 {
  return camera.worldToScreen(world);
}

describe('World construction', () => {
  it('sort object theo layer một lần, giữ thứ tự cùng layer', () => {
    const camera = new Camera();
    const world = new World(camera, [
      makeObject('top-a', { layer: 10 }),
      makeObject('low', { layer: 5 }),
      makeObject('top-b', { layer: 10 }),
    ], new DayNightCycle());

    expect(world.sceneObjects.map((o) => o.id)).toEqual(['low', 'top-a', 'top-b']);
  });
});

describe('World pick', () => {
  it('chọn vật trên cùng theo layer, bỏ qua vật không interactive', () => {
    const camera = new Camera();
    const world = new World(camera, [
      makeObject('low', { layer: 1, interactive: true, polygons: [square(0, 0, 100, 100)] }),
      makeObject('top', { layer: 9, interactive: true, polygons: [square(50, 50, 150, 150)] }),
      makeObject('deco', { layer: 20, interactive: false, polygons: [square(0, 0, 200, 200)] }),
    ], new DayNightCycle());

    expect(world.pickAt(vec2(75, 75))?.id).toBe('top');
    expect(world.pickAt(vec2(20, 20))?.id).toBe('low');
    expect(world.pickAt(vec2(190, 190))).toBeNull();
  });

  it('broad phase AABB rồi point-in-polygon: không chọn nhầm phần khuyết', () => {
    const camera = new Camera();
    const concave: Vec2[] = [
      vec2(0, 0), vec2(100, 0), vec2(100, 20),
      vec2(20, 20), vec2(20, 100), vec2(0, 100),
    ];
    const world = new World(camera, [
      makeObject('under', { layer: 1, interactive: true, polygons: [square(0, 0, 100, 100)] }),
      makeObject('cutout', { layer: 9, interactive: true, polygons: [concave] }),
    ], new DayNightCycle());

    expect(world.pickAt(vec2(80, 50))?.id).toBe('under');
    expect(world.pickAt(vec2(50, 10))?.id).toBe('cutout');
  });

  it('pickFromScreen đảo camera về world', () => {
    const camera = new Camera();
    camera.zoom = 2;
    camera.panX = -100;
    camera.panY = -50;
    const world = new World(camera, [
      makeObject('obj', { layer: 1, interactive: true, polygons: [square(90, 40, 130, 80)] }),
    ], new DayNightCycle());

    const screen = screenOf(camera, vec2(100, 60));
    expect(world.pickFromScreen(screen)?.id).toBe('obj');
    expect(world.pickFromScreen(vec2(0, 0))).toBeNull();
  });
});

describe('World selection & callbacks', () => {
  it('select/click gọi onClick và callback chỉ khi đổi lựa chọn', () => {
    const camera = new Camera();
    const events: Array<SceneObject | null> = [];
    const clicked: Array<SceneObject | null> = [];
    const callbacks: WorldCallbacks = {
      onSelectionChange: (obj) => events.push(obj),
    };
    const obj = makeObject('obj', {
      layer: 1,
      interactive: true,
      polygons: [square(0, 0, 100, 100)],
      onClick: (ctx) => clicked.push(ctx.ui.getSelected()),
    });
    const world = new World(camera, [obj], new DayNightCycle(), callbacks);

    world.clickFromScreen(screenOf(camera, vec2(50, 50)));
    expect(world.getSelected()).toBe(obj);
    expect(clicked).toEqual([obj]);
    expect(events).toEqual([obj]);

    // Click lại cùng vật: không lặp callback selection.
    world.clickFromScreen(screenOf(camera, vec2(50, 50)));
    expect(events).toEqual([obj]);

    world.clickFromScreen(screenOf(camera, vec2(300, 300)));
    expect(world.getSelected()).toBeNull();
    expect(events).toEqual([obj, null]);
  });

  it('hover callback chỉ chạy khi hover đổi', () => {
    const camera = new Camera();
    const hovered: Array<SceneObject | null> = [];
    const obj = makeObject('obj', {
      layer: 1,
      interactive: true,
      polygons: [square(0, 0, 100, 100)],
    });
    const world = new World(camera, [obj], new DayNightCycle(), {
      onHoverChange: (o) => hovered.push(o),
    });

    expect(world.hoverFromScreen(screenOf(camera, vec2(50, 50)))).toBe(obj);
    expect(world.hoverFromScreen(screenOf(camera, vec2(60, 60)))).toBe(obj);
    expect(world.hoverFromScreen(screenOf(camera, vec2(500, 500)))).toBeNull();
    expect(hovered).toEqual([obj, null]);
    expect(world.getHovered()).toBeNull();
  });
});

describe('World update / draw', () => {
  it('update theme rồi tạo Env và gọi update từng vật', () => {
    const camera = new Camera();
    const seen: Env[] = [];
    const obj = makeObject('obj', { layer: 1 });
    obj.update = (env) => seen.push(env);
    const world = new World(camera, [obj], new DayNightCycle());

    world.update(1 / 60, 2.5);

    expect(seen).toHaveLength(1);
    expect(seen[0].time).toBe(2.5);
    expect(seen[0].dt).toBeCloseTo(1 / 60);
    expect(seen[0].palette).toBe(DAY);
    expect(seen[0].camera).toBe(camera);
    expect(world.environment).toBe(seen[0]);
  });

  it('draw đúng thứ tự layer', () => {
    drawLog = [];
    const camera = new Camera();
    const world = new World(camera, [
      makeObject('top-a', { layer: 10 }),
      makeObject('low', { layer: 5 }),
      makeObject('top-b', { layer: 10 }),
    ], new DayNightCycle());

    world.draw({} as Renderer);
    expect(drawLog).toEqual(['low', 'top-a', 'top-b']);
  });

  it('drawOverlay vẽ viền polygon của vật đang chọn', () => {
    const camera = new Camera();
    const obj = makeObject('obj', {
      layer: 1,
      interactive: true,
      polygons: [square(0, 0, 10, 10), square(20, 20, 30, 30)],
    });
    const world = new World(camera, [obj], new DayNightCycle());
    world.select(obj);

    const calls: Array<{ points: readonly Vec2[]; color: number; filled: boolean }> = [];
    const fake = {
      polygon: (points: readonly Vec2[], color: number, filled?: boolean) => {
        calls.push({ points, color, filled: filled ?? true });
      },
    } as unknown as Renderer;

    world.drawOverlay(fake);
    expect(calls).toHaveLength(2);
    expect(calls[0].color).toBe(DAY.selection);
    expect(calls[0].filled).toBe(false);
  });

  it('drawOverlay không làm gì khi chưa chọn', () => {
    const camera = new Camera();
    const world = new World(camera, [], new DayNightCycle());
    let called = 0;
    const fake = { polygon: () => { called++; } } as unknown as Renderer;
    world.drawOverlay(fake);
    expect(called).toBe(0);
  });

  it('toggleDayNight chuyển theme sang đêm sau transition', () => {
    const camera = new Camera();
    const world = new World(camera, [], new DayNightCycle());
    expect(world.environment.dayPhase).toBe(0);

    world.toggleDayNight();
    world.update(10, 10);
    expect(world.environment.dayPhase).toBeCloseTo(1);
    expect(world.environment.palette).not.toBe(DAY);
  });
});
