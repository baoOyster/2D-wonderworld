import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { Framebuffer } from '../src/core/framebuffer.ts';
import { Renderer } from '../src/core/renderer.ts';

const BG = 0x000000ff;
const FILL = 0x22aa44ff;
const OUTLINE = 0x000000ff;
const CLIP_FILL = 0xffd166ff;

function setup(): { fb: Framebuffer; renderer: Renderer } {
  const fb = new Framebuffer(500, 500);
  return { fb, renderer: new Renderer(fb, new Camera()) };
}

describe('Renderer', () => {
  it('biến đổi toạ độ world → screen khi vẽ line', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);
    renderer.line(0, 0, 10, 10, 0xff0000ff);

    expect(fb.getPixel(0, 0)).toBe(0xff0000ff);
    expect(fb.getPixel(15, 15)).toBe(0xff0000ff);
  });

  it('nhân bán kính hình tròn với RENDER_SCALE', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);
    renderer.circle(100, 100, 10, 0x00ff00ff, true);

    expect(fb.getPixel(150, 150)).toBe(0x00ff00ff);
    expect(fb.getPixel(150, 164)).toBe(0x00ff00ff);
    expect(fb.getPixel(150, 167)).toBe(BG);
  });

  it('shape hợp nhiều elip chỉ có một viền ngoài, không có viền ở mối nối', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);

    const canopy = renderer.mask();
    canopy.circle(100, 100, 30);
    canopy.circle(140, 100, 30);
    renderer.shape(canopy, { fill: FILL, outline: OUTLINE, outlineWidth: 2 });

    // Mối nối hai hình tròn nằm sâu trong khối: phải là màu tô, không phải viền.
    expect(fb.getPixel(180, 150)).toBe(FILL);
    // Mép ngoài cùng bên trái: viền.
    expect(fb.getPixel(105, 150)).toBe(OUTLINE);
  });

  it('shape tôn trọng clip của mask cha', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);

    const parent = renderer.mask();
    parent.circle(100, 100, 20);
    renderer.shape(parent, { fill: 0x333333ff });

    const spots = renderer.mask();
    spots.circle(130, 100, 30);
    renderer.shape(spots, { fill: CLIP_FILL, clip: parent });

    // Trong cả hai mask → có đốm.
    expect(fb.getPixel(170, 150)).toBe(CLIP_FILL);
    // Trong mask đốm nhưng ngoài mask cha → giữ nền.
    expect(fb.getPixel(195, 150)).toBe(BG);
  });

  it('tô 3 tông: tối ở dưới-trái, sáng ở trên-phải', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);

    const shade = 0xaa2222ff;
    const highlight = 0xffdd88ff;
    const block = renderer.mask();
    block.circle(100, 100, 30);
    renderer.shape(block, { fill: FILL, shade, highlight });

    // Vùng tô chính ở giữa.
    expect(fb.getPixel(150, 150)).toBe(FILL);
    // Mép dưới-trái có tông tối, mép trên-phải có tông sáng.
    const colors = new Set<number>();
    for (let x = 105; x <= 195; x++) {
      for (let y = 105; y <= 195; y++) colors.add(fb.getPixel(x, y));
    }
    expect(colors.has(shade)).toBe(true);
    expect(colors.has(highlight)).toBe(true);
  });

  it('vật bị khung cắt không có dải tối/sáng dọc mép ảnh', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);

    const shade = 0xaa2222ff;
    const highlight = 0xffdd88ff;
    // Hình vuông thò ra ngoài mép trái và mép trên của framebuffer
    const block = renderer.mask();
    block.polygon([
      { x: -50, y: -50 },
      { x: 100, y: -50 },
      { x: 100, y: 100 },
      { x: -50, y: 100 },
    ]);
    renderer.shape(block, { fill: FILL, shade, highlight });

    // Mép trái và mép trên của ảnh: vẫn là màu nền khối
    expect(fb.getPixel(0, 75)).toBe(FILL);
    expect(fb.getPixel(75, 0)).toBe(FILL);
    // Mép thật của khối vẫn có 3 tông: dưới có tông tối, phải có tông sáng
    expect(fb.getPixel(75, 148)).toBe(shade);
    expect(fb.getPixel(148, 75)).toBe(highlight);
  });

  it('vẽ chữ bằng font bitmap, không dùng API Canvas', () => {
    const { fb, renderer } = setup();
    renderer.begin(BG);
    renderer.text('A', 10, 10, 0xffffffff);

    let painted = 0;
    for (let y = 0; y < fb.height; y++) {
      for (let x = 0; x < fb.width; x++) {
        if (fb.getPixel(x, y) === 0xffffffff) painted++;
      }
    }
    expect(painted).toBeGreaterThan(0);
  });
});
