import { describe, expect, it } from 'vitest';
import { vec2 } from '../src/core/vec2.ts';
import { collectSceneObjects, pickObject } from '../src/demo/scene.ts';
import type { Env, SceneObject } from '../src/scene/types.ts';

const obj = (id: string, layer: number, interactive = false, box?: [number, number, number, number]): SceneObject => ({
  id, name: id, description: '', algorithms: [], layer, interactive,
  draw: () => {},
  hitPolygons: box ? () => [[vec2(box[0], box[1]), vec2(box[2], box[1]), vec2(box[2], box[3]), vec2(box[0], box[3])]] : undefined,
});

const env = {} as Env;

describe('demo toàn cảnh (scene.ts)', () => {
  it('gom mọi hàm create… của các vùng, bỏ export khác, sắp theo layer', () => {
    const objs = collectSceneObjects({
      '../scene/b/index.ts': { createB: () => [obj('b1', 30), obj('b2', 5)], B: 1 },
      '../scene/a/index.ts': { createA: () => [obj('a1', 30)], helper: () => [obj('x', 0)] },
    });
    // a nạp trước b; cùng layer 30 giữ thứ tự nạp
    expect(objs.map((o) => o.id)).toEqual(['b2', 'a1', 'b1']);
  });

  it('nạp được các vùng đã merge trong repo', () => {
    const ids = collectSceneObjects().map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([
      'tree', 'house', 'fence', 'path', 'meadow',
      // vùng đá ven hồ (#20) cũng tự hiện nhờ `createRocks()`
      'pebbles', 'boulders', 'reeds',
    ]));
  });

  it('bấm chọn vật interactive nằm trên cùng, bỏ qua vật không interactive', () => {
    const objs = [obj('low', 1, true, [0, 0, 100, 100]), obj('top', 9, true, [50, 50, 150, 150]), obj('deco', 20, false, [0, 0, 200, 200])];
    expect(pickObject(objs, vec2(75, 75), env)?.id).toBe('top');
    expect(pickObject(objs, vec2(20, 20), env)?.id).toBe('low');
    expect(pickObject(objs, vec2(190, 190), env)).toBeNull();
  });
});
