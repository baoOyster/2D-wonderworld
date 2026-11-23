import { describe, expect, it } from 'vitest';
import { Framebuffer } from '../src/core/framebuffer.ts';
import {
  drawText,
  decompose,
  hasGlyph,
  measureText,
  normalizeText,
} from '../src/core/font.ts';
import {
  CELL_H,
  CELL_W,
  GLYPHS,
  MODIFIER_ROWS,
  TONE_ROWS,
} from '../src/core/font-data.ts';

const REQUIRED = [
  'Thế giới cổ tích',
  'Cây cổ thụ',
  'Nhà nấm',
  'Hồ nước',
  'Cầu gỗ',
  'Mặt trời',
  'Mặt trăng',
  'Đom đóm',
  'Hàng rào',
  'Đường đá',
  'Bông hoa',
  'Cỏ',
  'Nấm nhỏ',
  'Bướm',
  'Cá',
  'Tảng đá',
  'Bầu trời',
  'Mây',
  'Núi',
  'Rừng',
  'Chuyển ngày/đêm',
  'Thu phóng',
  'Đặt lại',
  'Nhấn vào vật thể để xem thông tin',
  'Đóng',
];

const WHITE = 0xffffffff;
const RED = 0xff0000ff;

function litPixels(fb: Framebuffer): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      if ((fb.getPixel(x, y) & 0xff) !== 0) out.push({ x, y });
    }
  }
  return out;
}

function render(text: string, scale = 1): Framebuffer {
  const fb = new Framebuffer(240, 60);
  drawText(fb, text, 2, 2, WHITE, { scale });
  return fb;
}

function toAscii(text: string, scale = 1): string[] {
  const size = measureText(text, scale);
  const fb = new Framebuffer(size.width, size.height);
  drawText(fb, text, 0, 0, WHITE, { scale });
  const rows: string[] = [];
  for (let y = 0; y < fb.height; y++) {
    let line = '';
    for (let x = 0; x < fb.width; x++) {
      line += (fb.getPixel(x, y) & 0xff) !== 0 ? '#' : '.';
    }
    rows.push(line);
  }
  return rows;
}

describe('font-data toàn vẹn', () => {
  it('mọi glyph đúng 7 hàng × 5 cột, chỉ chứa . và #', () => {
    for (const [char, rows] of Object.entries(GLYPHS)) {
      expect(rows, `glyph "${char}"`).toHaveLength(7);
      for (const row of rows) {
        expect(row, `glyph "${char}"`).toHaveLength(5);
        expect(/^[.#]+$/.test(row), `glyph "${char}" chứa ký tự lạ: ${row}`).toBe(true);
      }
    }
  });

  it('mọi bitmap dấu thanh / dấu phụ đúng 5 cột', () => {
    for (const rows of Object.values(TONE_ROWS)) {
      for (const row of rows) expect(row).toHaveLength(5);
    }
    for (const rows of Object.values(MODIFIER_ROWS)) {
      for (const row of rows) expect(row).toHaveLength(5);
    }
  });
});

describe('ghép dấu tiếng Việt', () => {
  it('tách đúng dấu thanh và dấu phụ', () => {
    expect(decompose('ế')).toEqual({ base: 'e', tone: 'acute', modifier: 'circumflex' });
    expect(decompose('ể')).toEqual({ base: 'e', tone: 'hook', modifier: 'circumflex' });
    expect(decompose('ặ')).toEqual({ base: 'a', tone: 'dot', modifier: 'breve' });
    expect(decompose('ờ')).toEqual({ base: 'o', tone: 'grave', modifier: 'horn' });
    expect(decompose('ự')).toEqual({ base: 'u', tone: 'dot', modifier: 'horn' });
    expect(decompose('ỵ')).toEqual({ base: 'y', tone: 'dot', modifier: null });
    expect(decompose('đ')).toEqual({ base: 'đ', tone: null, modifier: null });
    expect(decompose('Đ')).toEqual({ base: 'Đ', tone: null, modifier: null });
  });

  it('mọi ký tự trong danh sách bắt buộc đều có glyph', () => {
    const missing = new Set<string>();
    for (const line of REQUIRED) {
      for (const char of normalizeText(line)) {
        if (char === ' ') continue;
        if (!hasGlyph(char)) missing.add(char);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('chuỗi NFD được chuẩn hoá NFC khi vẽ', () => {
    const composed = render('ế');
    const decomposed = render('e\u0302\u0301');
    expect(litPixels(decomposed)).toEqual(litPixels(composed));
    expect(normalizeText('e\u0302\u0301')).toBe('ế');
  });
});

describe('measureText', () => {
  it('đo theo ô 6×11 nhân scale', () => {
    expect(measureText('abc')).toEqual({ width: 3 * CELL_W, height: CELL_H });
    expect(measureText('abc', 2)).toEqual({ width: 3 * CELL_W * 2, height: CELL_H * 2 });
    expect(measureText('Thế giới cổ tích')).toEqual({
      width: normalizeText('Thế giới cổ tích').length * CELL_W,
      height: CELL_H,
    });
  });

  it('chuỗi rỗng rộng 0, vẫn có chiều cao', () => {
    expect(measureText('')).toEqual({ width: 0, height: CELL_H });
  });
});

describe('drawText', () => {
  it('vẽ ra pixel', () => {
    const pixels = litPixels(render('A'));
    expect(pixels.length).toBeGreaterThan(0);
  });

  it('chuỗi rỗng không vẽ gì', () => {
    const fb = new Framebuffer(40, 40);
    const size = drawText(fb, '', 5, 5, WHITE);
    expect(size.width).toBe(0);
    expect(litPixels(fb)).toEqual([]);
  });

  it('không lệch baseline giữa chữ có dấu và không dấu', () => {
    const plain = litPixels(render('a'));
    const marked = litPixels(render('á'));
    const plainBottom = Math.max(...plain.map((p) => p.y));
    const markedBottom = Math.max(...marked.map((p) => p.y));
    expect(markedBottom).toBe(plainBottom);

    const plainTop = Math.min(...plain.map((p) => p.y));
    const markedTop = Math.min(...marked.map((p) => p.y));
    expect(markedTop).toBeLessThan(plainTop);
  });

  it('dấu nặng nằm dưới chân chữ', () => {
    const plain = litPixels(render('a'));
    const dot = litPixels(render('ạ'));
    const plainBottom = Math.max(...plain.map((p) => p.y));
    const dotBottom = Math.max(...dot.map((p) => p.y));
    expect(dotBottom).toBeGreaterThan(plainBottom);
  });

  it('scale 1/2/3 cho số pixel tăng theo bình phương', () => {
    const c1 = litPixels(render('O', 1)).length;
    const c2 = litPixels(render('O', 2)).length;
    const c3 = litPixels(render('O', 3)).length;
    expect(c2).toBe(c1 * 4);
    expect(c3).toBe(c1 * 9);
  });

  it('glyph lạ fallback bằng ?', () => {
    expect(litPixels(render('€'))).toEqual(litPixels(render('?')));
  });

  it('không crash với emoji / dấu cách', () => {
    expect(() => render('😀 a')).not.toThrow();
  });

  it('đ có thêm gạch ngang so với d', () => {
    const d = litPixels(render('d')).length;
    const dBar = litPixels(render('đ')).length;
    expect(dBar).toBeGreaterThan(d);
  });

  it('shadow vẽ thêm bóng lệch phải-xuống', () => {
    const fb = new Framebuffer(60, 40);
    drawText(fb, 'A', 4, 4, WHITE, { shadow: RED });
    const pixels = litPixels(fb);
    const red = pixels.filter((p) => {
      const c = fb.getPixel(p.x, p.y);
      return ((c >>> 24) & 0xff) === 0xff && ((c >>> 8) & 0xff) === 0;
    });
    expect(red.length).toBeGreaterThan(0);
  });

  it('căn lề trái / giữa / phải thay đổi vị trí bắt đầu', () => {
    const fbLeft = new Framebuffer(100, 40);
    const fbCenter = new Framebuffer(100, 40);
    const fbRight = new Framebuffer(100, 40);
    drawText(fbLeft, 'M', 60, 4, WHITE, { align: 'left' });
    drawText(fbCenter, 'M', 60, 4, WHITE, { align: 'center' });
    drawText(fbRight, 'M', 60, 4, WHITE, { align: 'right' });

    const left = Math.min(...litPixels(fbLeft).map((p) => p.x));
    const center = Math.min(...litPixels(fbCenter).map((p) => p.x));
    const right = Math.min(...litPixels(fbRight).map((p) => p.x));
    expect(center).toBeLessThan(left);
    expect(right).toBeLessThan(center);
  });
});

describe('preview ASCII (xem trong log test)', () => {
  it('render "Thế giới cổ tích"', () => {
    const art = toAscii('Thế giới cổ tích');
    // eslint-disable-next-line no-console
    console.log(['', 'Thế giới cổ tích:', ...art, ''].join('\n'));
    expect(art.length).toBe(CELL_H);
  });

  it('render "Đường đá" và "Đom đóm"', () => {
    const art = toAscii('Đường đá / Đom đóm');
    // eslint-disable-next-line no-console
    console.log(['', 'Đường đá / Đom đóm:', ...art, ''].join('\n'));
    expect(art.length).toBe(CELL_H);
  });
});
