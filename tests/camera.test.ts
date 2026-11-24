import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { RENDER_SCALE, WORLD_H, WORLD_W } from '../src/core/config.ts';
import { mat3Apply, mat3Invert } from '../src/core/mat3.ts';

const FB_W = WORLD_W * RENDER_SCALE;
const FB_H = WORLD_H * RENDER_SCALE;

function expectVec(actual: { x: number; y: number }, x: number, y: number): void {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
}

describe('Camera', () => {
  it('mặc định là 1×, phủ đúng world 1280×720 lên framebuffer', () => {
    const camera = new Camera();
    expect(camera.zoom).toBe(1);
    expect(camera.panX).toBe(0);
    expect(camera.panY).toBe(0);

    expectVec(camera.worldToScreen({ x: 10, y: 20 }), 15, 30);
    expectVec(camera.worldToScreen({ x: WORLD_W, y: WORLD_H }), FB_W, FB_H);
  });

  it('ma trận đúng công thức scale(RENDER_SCALE) · translate(pan) · scale(zoom)', () => {
    const camera = new Camera();
    camera.zoom = 2;
    camera.panX = -100;
    camera.panY = -50;

    expectVec(camera.worldToScreen({ x: 10, y: 20 }), -120, -15);
  });

  it('screenToWorld khớp nghịch đảo ma trận và round-trip', () => {
    const camera = new Camera();
    camera.zoom = 1.7;
    camera.panX = -210;
    camera.panY = -96;

    const inverse = mat3Invert(camera.matrix());
    for (const point of [{ x: 0, y: 0 }, { x: 123.25, y: 456.75 }]) {
      const screen = camera.worldToScreen(point);
      expectVec(camera.screenToWorld(screen), point.x, point.y);
      expectVec(mat3Apply(inverse, screen), point.x, point.y);
    }
  });

  it('zoomAt giữ nguyên điểm world dưới con trỏ ở hai vị trí khác nhau', () => {
    const camera = new Camera();

    const first = { x: 300, y: 200 };
    camera.zoomAt(first, 1.6);
    expect(camera.zoom).toBeCloseTo(1.6, 9);
    expectVec(camera.screenToWorld(first), 200, 200 / 1.5);

    const second = { x: 1200, y: 800 };
    const worldBefore = camera.screenToWorld(second);
    camera.zoomAt(second, 1.25);
    expect(camera.zoom).toBeCloseTo(2, 9);
    expectVec(camera.screenToWorld(second), worldBefore.x, worldBefore.y);
  });

  it('kẹp zoom trong 1..3', () => {
    const camera = new Camera();
    camera.zoom = 99;
    expect(camera.zoom).toBe(3);
    camera.zoom = 0.2;
    expect(camera.zoom).toBe(1);
  });

  it('kẹp pan để không lộ ngoài world khi zoom > 1', () => {
    const camera = new Camera();
    camera.zoom = 2;
    camera.panX = -99999;
    camera.panY = 99999;
    expect(camera.panX).toBe(WORLD_W * (1 - 2));
    expect(camera.panY).toBe(0);

    camera.panX = 50;
    expect(camera.panX).toBe(0);

    camera.zoom = 1;
    expect(camera.panX).toBe(0);
    expect(camera.panY).toBe(0);
  });

  it('zoomAt ở góc world vẫn giữ điểm dưới con trỏ khi pan còn trong biên', () => {
    const camera = new Camera();
    const corner = { x: FB_W, y: FB_H };

    camera.zoomAt(corner, 3);

    expect(camera.zoom).toBe(3);
    expect(camera.panX).toBe(WORLD_W * (1 - 3));
    expect(camera.panY).toBe(WORLD_H * (1 - 3));
    expectVec(camera.worldToScreen({ x: WORLD_W, y: WORLD_H }), FB_W, FB_H);
  });

  it('reset trở về 1×, không pan', () => {
    const camera = new Camera();
    camera.zoom = 2.5;
    camera.panX = -200;
    camera.panY = -100;
    camera.reset();

    expect(camera.zoom).toBe(1);
    expect(camera.panX).toBe(0);
    expect(camera.panY).toBe(0);
    expectVec(camera.worldToScreen({ x: 5, y: 6 }), 7.5, 9);
  });
});
