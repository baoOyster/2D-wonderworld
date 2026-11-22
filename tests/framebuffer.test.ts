import { describe, expect, it } from 'vitest';
import { FB_H, FB_W } from '../src/core/config.ts';
import { pack, rgba } from '../src/core/color.ts';
import { Framebuffer } from '../src/core/framebuffer.ts';

describe('Framebuffer', () => {
  it('mặc định là Full HD 1920×1080', () => {
    expect(FB_W).toBe(1920);
    expect(FB_H).toBe(1080);

    const fb = new Framebuffer();
    expect(fb.width).toBe(FB_W);
    expect(fb.height).toBe(FB_H);
    expect(fb.data.length).toBe(FB_W * FB_H * 4);
  });

  it('image dùng chung vùng nhớ với data', () => {
    const fb = new Framebuffer(8, 4);
    expect(fb.image.data).toBe(fb.data);
    expect(fb.image.width).toBe(8);
    expect(fb.image.height).toBe(4);
  });

  it('clear tô đều toàn bộ framebuffer', () => {
    const fb = new Framebuffer(4, 3);
    const color = pack(17, 34, 51, 68);
    fb.clear(color);

    expect(fb.getPixel(0, 0)).toBe(color);
    expect(fb.getPixel(3, 2)).toBe(color);
    expect(fb.data[0]).toBe(17);
    expect(fb.data[1]).toBe(34);
    expect(fb.data[2]).toBe(51);
    expect(fb.data[3]).toBe(68);
  });

  it('setPixel/getPixel ghi đúng vị trí', () => {
    const fb = new Framebuffer(5, 5);
    const color = pack(10, 20, 30, 40);
    fb.setPixel(2, 3, color);

    expect(fb.getPixel(2, 3)).toBe(color);
    expect(fb.getPixel(1, 3)).toBe(0);
    expect(fb.data[(3 * 5 + 2) * 4 + 3]).toBe(40);
  });

  it('clip biên, không throw', () => {
    const fb = new Framebuffer(3, 3);
    expect(() => {
      fb.setPixel(-1, 0, 0xffffffff);
      fb.setPixel(0, -1, 0xffffffff);
      fb.setPixel(3, 0, 0xffffffff);
      fb.setPixel(0, 3, 0xffffffff);
      fb.blendPixel(-1, -1, 0xffffffff);
      fb.blendPixel(99, 99, 0xffffffff);
    }).not.toThrow();

    expect(fb.getPixel(-1, 0)).toBe(0);
    expect(fb.getPixel(3, 3)).toBe(0);
    expect(fb.data.every((v) => v === 0)).toBe(true);
  });

  it('blendPixel source-over: nguồn đục ghi đè hoàn toàn', () => {
    const fb = new Framebuffer(2, 2);
    fb.clear(pack(0, 0, 255, 255));
    fb.blendPixel(0, 0, pack(255, 0, 0, 255));
    expect(fb.getPixel(0, 0)).toBe(pack(255, 0, 0, 255));
  });

  it('blendPixel: nguồn trong suốt không đổi gì', () => {
    const fb = new Framebuffer(2, 2);
    const before = pack(1, 2, 3, 4);
    fb.clear(before);
    fb.blendPixel(1, 1, pack(255, 0, 0, 0));
    expect(fb.getPixel(1, 1)).toBe(before);
  });

  it('blendPixel: 50% đỏ lên nền xanh đục', () => {
    const fb = new Framebuffer(2, 2);
    fb.clear(pack(0, 0, 255, 255));
    fb.blendPixel(0, 0, rgba('#ff0000', 0.5));

    const [r, g, b, a] = [
      (fb.getPixel(0, 0) >>> 24) & 0xff,
      (fb.getPixel(0, 0) >>> 16) & 0xff,
      (fb.getPixel(0, 0) >>> 8) & 0xff,
      fb.getPixel(0, 0) & 0xff,
    ];
    expect(r).toBe(128);
    expect(g).toBe(0);
    expect(b).toBe(127);
    expect(a).toBe(255);
  });

  it('blendPixel: 50% đỏ lên nền trong suốt giữ alpha nguồn', () => {
    const fb = new Framebuffer(2, 2);
    fb.blendPixel(0, 0, rgba('#ff0000', 0.5));
    expect(fb.getPixel(0, 0)).toBe(pack(255, 0, 0, 128));
  });

  it('blendPixel: chồng hai lớp 50% cho alpha ~191', () => {
    const fb = new Framebuffer(2, 2);
    fb.blendPixel(0, 0, rgba('#ff0000', 0.5));
    fb.blendPixel(0, 0, rgba('#ff0000', 0.5));

    const pixel = fb.getPixel(0, 0);
    expect((pixel >>> 24) & 0xff).toBe(255);
    expect(pixel & 0xff).toBe(192);
  });

  it('từ chối kích thước không hợp lệ', () => {
    expect(() => new Framebuffer(0, 10)).toThrow(RangeError);
    expect(() => new Framebuffer(10, 0)).toThrow(RangeError);
    expect(() => new Framebuffer(1.5, 10)).toThrow(RangeError);
  });
});
