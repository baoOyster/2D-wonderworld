
import { describe, it, expect } from 'vitest';
import { Framebuffer } from '../src/core/framebuffer.ts';
import { rgba } from '../src/core/color.ts';
import {
  polygonFill,
  strokePolygon,
  floodFill,
   fillMask,
    outlineMask
} from '../src/core/fill.ts';
import { rgb } from '../src/core/color.ts';
import type { RasterTarget } from '../src/core/raster.ts';
import type { FloodTarget } from '../src/core/fill.ts';
import {
  Mask,
  maskEllipse,
  maskUnion
} from '../src/core/mask.ts';
function makeTarget(width: number, height: number) {
  const pixels = new Uint32Array(width * height);

  const fb: RasterTarget = {
    width,
    height,

    setPixel(x, y, color) {
      if (x >= 0 && y >= 0 && x < width && y < height) {
        pixels[y * width + x] = color;
      }
    },

    blendPixel(x, y, color) {
      this.setPixel(x, y, color);
    }
  };

  return {
    fb,
    get: (x: number, y: number) => pixels[y * width + x]
  };
}

describe('polygonFill', () => {
  const red = rgb('#ff0000');

  it('fills a square', () => {
    const { fb, get } = makeTarget(30, 30);

    polygonFill(fb, [
      { x: 5, y: 5 },
      { x: 20, y: 5 },
      { x: 20, y: 20 },
      { x: 5, y: 20 }
    ], red);

    expect(get(10, 10)).toBe(red);
    expect(get(0, 0)).toBe(0);
    expect(get(25, 25)).toBe(0);
  });

  it('fills a triangle', () => {
    const { fb, get } = makeTarget(30, 30);

    polygonFill(fb, [
      { x: 15, y: 2 },
      { x: 25, y: 25 },
      { x: 5, y: 25 }
    ], red);

    expect(get(15, 15)).toBe(red);
    expect(get(0, 0)).toBe(0);
  });

  it('ignores polygons with fewer than 3 points', () => {
    const { fb, get } = makeTarget(30, 30);

    polygonFill(fb, [
      { x: 5, y: 5 },
      { x: 20, y: 20 }
    ], red);

    expect(get(10, 10)).toBe(0);
  });

  it('clips polygons outside framebuffer', () => {
    const { fb, get } = makeTarget(20, 20);

    polygonFill(fb, [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ], red);

    expect(get(0, 0)).toBe(red);
    expect(get(15, 15)).toBe(0);
  });
});


describe('strokePolygon', () => {
  const red = rgb('#ff0000');

  it('draws a closed square border', () => {
    const { fb, get } = makeTarget(30, 30);

    strokePolygon(fb, [
      { x: 5, y: 5 },
      { x: 20, y: 5 },
      { x: 20, y: 20 },
      { x: 5, y: 20 }
    ], red);

    // Kiểm tra bốn cạnh
    expect(get(10, 5)).toBe(red);
    expect(get(20, 10)).toBe(red);
    expect(get(10, 20)).toBe(red);
    expect(get(5, 10)).toBe(red);

    // Bên trong không được tô
    expect(get(10, 10)).toBe(0);

    // Bên ngoài không được tô
    expect(get(25, 25)).toBe(0);
  });

  it('draws a triangle border', () => {
    const { fb, get } = makeTarget(30, 30);

    strokePolygon(fb, [
      { x: 15, y: 5 },
      { x: 25, y: 20 },
      { x: 5, y: 20 }
    ], red);

    expect(get(15, 5)).toBe(red);
    expect(get(15, 20)).toBe(red);
    expect(get(0, 0)).toBe(0);
  });

  it('supports thick borders', () => {
    const { fb, get } = makeTarget(40, 40);

    strokePolygon(fb, [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
      { x: 10, y: 30 }
    ], red, 5);

    expect(get(20, 10)).toBe(red);
    expect(get(20, 11)).toBe(red);
    expect(get(20, 20)).toBe(0);
  });

  it('handles degenerate polygons', () => {
    const { fb, get } = makeTarget(30, 30);

    strokePolygon(fb, [], red);
    strokePolygon(fb, [{ x: 5, y: 5 }], red);

    expect(get(5, 5)).toBe(0);
  });

  it('clips borders outside framebuffer', () => {
    const { fb, get } = makeTarget(20, 20);

    strokePolygon(fb, [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 }
    ], red);

    expect(get(10, 5)).toBe(red);
    expect(get(5, 10)).toBe(red);
    expect(get(0, 0)).toBe(0);
  });
});


function makeFloodTarget(width: number, height: number) {
  const pixels = new Uint32Array(width * height);

  const fb: FloodTarget = {
    width,
    height,

    getPixel(x, y) {
      if (x < 0 || y < 0 ||
          x >= width || y >= height) return 0;

      return pixels[y * width + x];
    },

    setPixel(x, y, color) {
      if (x < 0 || y < 0 ||
          x >= width || y >= height) return;

      pixels[y * width + x] = color >>> 0;
    },

    blendPixel(x, y, color) {
      // Các test sau sử dụng màu đục.
      this.setPixel(x, y, color);
    }
  };

  return { fb };
}

describe('floodFill', () => {
  const red = rgb('#ff0000');
  const blue = rgb('#0000ff');
  const black = rgb('#000000');
  const white = rgb('#ffffff');

  it('fills an area with the same target color', () => {
    const { fb } = makeFloodTarget(20, 20);

    // Tạo nền màu trắng
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        fb.setPixel(x, y, white);
      }
    }

    const count = floodFill(fb, 10, 10, blue);

    expect(count).toBe(400);
    expect(fb.getPixel(10, 10)).toBe(blue);
    expect(fb.getPixel(0, 0)).toBe(blue);
  });

  it('fills only inside a closed boundary', () => {
    const { fb } = makeFloodTarget(10, 10);

    // Tạo đường biên hình vuông
    for (let x = 2; x <= 7; x++) {
      fb.setPixel(x, 2, black);
      fb.setPixel(x, 7, black);
    }

    for (let y = 2; y <= 7; y++) {
      fb.setPixel(2, y, black);
      fb.setPixel(7, y, black);
    }

    const count = floodFill(fb, 4, 4, red);

    expect(count).toBe(16);
    expect(fb.getPixel(4, 4)).toBe(red);
    expect(fb.getPixel(2, 4)).toBe(black);
    expect(fb.getPixel(0, 0)).toBe(0);
  });

  it('supports boundary mode', () => {
    const { fb } = makeFloodTarget(7, 7);

    // Biên ngoài cùng có màu đen
    for (let i = 0; i < 7; i++) {
      fb.setPixel(i, 0, black);
      fb.setPixel(i, 6, black);
      fb.setPixel(0, i, black);
      fb.setPixel(6, i, black);
    }

    const count = floodFill(fb, 3, 3, blue, {
      mode: 'boundary',
      boundary: black
    });

    expect(count).toBe(25);
    expect(fb.getPixel(3, 3)).toBe(blue);
    expect(fb.getPixel(0, 0)).toBe(black);
  });

  it('respects maxPixels on open areas', () => {
    const { fb } = makeFloodTarget(100, 100);

    const count = floodFill(fb, 50, 50, red, {
      maxPixels: 100
    });

    expect(count).toBe(100);
  });

  it('uses four-connected neighbors', () => {
    const { fb } = makeFloodTarget(3, 3);

    fb.setPixel(0, 0, white);
    fb.setPixel(1, 1, white);

    const count = floodFill(fb, 0, 0, blue);

    expect(count).toBe(1);
    expect(fb.getPixel(1, 1)).toBe(white);
  });

  it('does nothing outside the framebuffer', () => {
    const { fb } = makeFloodTarget(10, 10);

    const count = floodFill(fb, -1, -1, red);

    expect(count).toBe(0);
  });

  it('does nothing if the color is unchanged', () => {
    const { fb } = makeFloodTarget(10, 10);

    fb.setPixel(5, 5, red);

    const count = floodFill(fb, 5, 5, red);

    expect(count).toBe(0);
  });
});


describe('fillMask', () => {
  const red = rgb('#ff0000');
  const blue = rgb('#0000ff');

  it('fills only pixels inside the mask', () => {
    const { fb, get } = makeTarget(20, 20);
    const m = new Mask(20, 20);

    for (let y = 5; y <= 10; y++) {
      for (let x = 5; x <= 10; x++) {
        m.set(x, y);
      }
    }

    fillMask(fb, m, red);

    expect(get(7, 7)).toBe(red);
    expect(get(5, 5)).toBe(red);
    expect(get(0, 0)).toBe(0);
    expect(get(15, 15)).toBe(0);
  });

  it('respects a clipping mask', () => {
    const { fb, get } = makeTarget(20, 20);

    const m = new Mask(20, 20);
    const clip = new Mask(20, 20);

    // Mask gốc: hình vuông lớn
    for (let y = 2; y <= 15; y++) {
      for (let x = 2; x <= 15; x++) {
        m.set(x, y);
      }
    }

    // Clip: hình vuông nhỏ
    for (let y = 6; y <= 10; y++) {
      for (let x = 6; x <= 10; x++) {
        clip.set(x, y);
      }
    }

    fillMask(fb, m, blue, clip);

    expect(get(8, 8)).toBe(blue);
    expect(get(3, 3)).toBe(0);
    expect(get(15, 15)).toBe(0);
  });

  it('does nothing for an empty mask', () => {
    const { fb, get } = makeTarget(20, 20);
    const m = new Mask(20, 20);

    fillMask(fb, m, red);

    expect(get(10, 10)).toBe(0);
  });

  it('clips correctly to framebuffer size', () => {
    const { fb, get } = makeTarget(10, 10);
    const m = new Mask(20, 20);

    m.set(5, 5);
    m.set(15, 15);

    fillMask(fb, m, red);

    expect(get(5, 5)).toBe(red);
    expect(get(0, 0)).toBe(0);
  });

  it('rejects mismatched clipping dimensions', () => {
    const { fb } = makeTarget(20, 20);

    const m = new Mask(20, 20);
    const clip = new Mask(10, 10);

    expect(() => fillMask(fb, m, red, clip))
      .toThrow(RangeError);
  });
});


describe('outlineMask', () => {
  const red = rgb('#ff0000');

  it('draws the correct square perimeter', () => {
    const { fb, get } = makeTarget(20, 20);
    const m = new Mask(20, 20);

    // Hình vuông 5 x 5
    for (let y = 5; y <= 9; y++) {
      for (let x = 5; x <= 9; x++) {
        m.set(x, y);
      }
    }

    outlineMask(fb, m, red, 1);

    expect(get(5, 5)).toBe(red);
    expect(get(7, 5)).toBe(red);
    expect(get(9, 7)).toBe(red);

    // Tâm phải rỗng với viền 1 pixel
    expect(get(7, 7)).toBe(0);

    let count = 0;

    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (get(x, y) === red) count++;
      }
    }

    expect(count).toBe(16);
  });

  it('supports outline width greater than one', () => {
    const { fb, get } = makeTarget(20, 20);
    const m = new Mask(20, 20);

    for (let y = 5; y <= 13; y++) {
      for (let x = 5; x <= 13; x++) {
        m.set(x, y);
      }
    }

    outlineMask(fb, m, red, 2);

    expect(get(5, 9)).toBe(red);
    expect(get(6, 9)).toBe(red);
    expect(get(7, 9)).toBe(0);
    expect(get(9, 9)).toBe(0);
  });

  it('does not draw an internal overlap border', () => {
    const { fb, get } = makeTarget(100, 100);

    const a = new Mask(100, 100);
    const b = new Mask(100, 100);

    maskEllipse(a, 40, 50, 20, 15);
    maskEllipse(b, 60, 50, 20, 15);

    // Hợp Mask trước khi tạo viền
    const merged = maskUnion(a, b);

    outlineMask(fb, merged, red, 1);

    // Vùng chồng nhau ở giữa không có viền
    expect(get(50, 50)).toBe(0);
  });

  it('does not add a false border at the image edge', () => {
    const { fb, get } = makeTarget(20, 20);
    const m = new Mask(20, 20);

    // Hình chữ nhật chạm mép trái
    for (let y = 4; y <= 15; y++) {
      for (let x = 0; x <= 10; x++) {
        m.set(x, y);
      }
    }

    outlineMask(fb, m, red, 1);

    // Điểm ở giữa mép trái không là viền
    expect(get(0, 10)).toBe(0);

    // Mép bên phải của vùng vẫn là viền
    expect(get(10, 10)).toBe(red);
  });
});


describe('Advanced Scanline Even-Odd tests', () => {
  const red = rgb('#ff0000');

  it('fills a concave U-shaped polygon', () => {
    const { fb, get } = makeTarget(25, 25);

    polygonFill(fb, [
      { x: 2, y: 2 },
      { x: 18, y: 2 },
      { x: 18, y: 18 },
      { x: 13, y: 18 },
      { x: 13, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 18 },
      { x: 2, y: 18 }
    ], red);

    // Phần phía trên được tô
    expect(get(10, 4)).toBe(red);

    // Hai cạnh bên được tô
    expect(get(4, 12)).toBe(red);
    expect(get(16, 12)).toBe(red);

    // Phần khoét lõm phải rỗng
    expect(get(10, 12)).toBe(0);

    // Ngoài đa giác không được tô
    expect(get(22, 22)).toBe(0);
  });

  it('fills a self-intersecting star with even-odd', () => {
    const { fb, get } = makeTarget(120, 120);

    // Tạo ngôi sao 5 đỉnh tự cắt
    const outer = Array.from(
      { length: 5 },
      (_, i) => {
        const angle =
          -Math.PI / 2 + i * 2 * Math.PI / 5;

        return {
          x: 60 + 45 * Math.cos(angle),
          y: 60 + 45 * Math.sin(angle)
        };
      }
    );

    const star = [0, 2, 4, 1, 3].map(i => outer[i]);

    polygonFill(fb, star, red);

    // Phần đỉnh phía trên
    expect(get(60, 25)).toBe(red);

    // Tâm ngôi sao phải rỗng theo Even-Odd
    expect(get(60, 60)).toBe(0);

    // Góc ngoài hình
    expect(get(5, 5)).toBe(0);
  });

  it('does not fill a degenerate polygon', () => {
    const { fb, get } = makeTarget(30, 30);

    polygonFill(fb, [
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 15, y: 15 }
    ], red);

    expect(get(10, 10)).toBe(0);
  });
});


describe('Flood Fill safety tests', () => {
  it('stops at maxPixels in a large open area', () => {
    const { fb } = makeFloodTarget(300, 300);
    const red = rgb('#ff0000');

    const count = floodFill(fb, 150, 150, red, {
      maxPixels: 500
    });

    expect(count).toBe(500);
  }, 2000);

  it('does not modify pixels outside the target area', () => {
    const { fb } = makeFloodTarget(20, 20);

    const white = rgb('#ffffff');
    const blue = rgb('#0000ff');

    fb.setPixel(3, 3, white);
    fb.setPixel(4, 3, white);
    fb.setPixel(15, 15, white);

    const count = floodFill(fb, 3, 3, blue);

    expect(count).toBe(2);
    expect(fb.getPixel(3, 3)).toBe(blue);
    expect(fb.getPixel(4, 3)).toBe(blue);
    expect(fb.getPixel(15, 15)).toBe(white);
  });
});


describe('FillMask with real Framebuffer', () => {
  it('blends transparent red over blue', () => {
    const fb = new Framebuffer(10, 10);

    const blue = rgb('#0000ff');
    const red50 = rgba('#ff0000', 0.5);

    fb.clear(blue);

    const mask = new Mask(10, 10);
    mask.set(5, 5);

    fillMask(fb, mask, red50);

    // Source-over: 50% red on opaque blue
    expect(fb.getPixel(5, 5))
      .toBe(0x80007fff);

    // Pixel ngoài Mask vẫn giữ màu nền
    expect(fb.getPixel(0, 0))
      .toBe(blue);
  });

  it('does not paint outside clipping mask', () => {
    const fb = new Framebuffer(10, 10);

    fb.clear(rgb('#000000'));

    const mask = new Mask(10, 10);
    const clip = new Mask(10, 10);

    mask.set(3, 3);
    mask.set(4, 4);
    clip.set(3, 3);

    const white = rgb('#ffffff');

    fillMask(fb, mask, white, clip);

    expect(fb.getPixel(3, 3)).toBe(white);
    expect(fb.getPixel(4, 4))
      .toBe(rgb('#000000'));
  });
});
