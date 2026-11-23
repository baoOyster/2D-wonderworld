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
  GLYPH_H,
  GLYPH_W,
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

const ACCENTED = [
  'Ế',
  'Ậ',
  'Ổ',
  'Ộ',
  'Ả',
  'Ạ',
  'Ề',
  'Ệ',
  'Ố',
  'Ợ',
  'Ứ',
  'Ự',
  'Ắ',
  'Ặ',
  'Đ',
  'đ',
  'ơ',
  'ư',
  'ă',
  'â',
  'ê',
  'ô',
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
  const size = measureText(text, scale);
  const fb = new Framebuffer(Math.max(1, size.width + 4), Math.max(1, size.height + 4));
  drawText(fb, text, 2, 2, WHITE, { scale });
  return fb;
}

function toAscii(text: string, scale = 1): string[] {
  const size = measureText(text, scale);
  const fb = new Framebuffer(Math.max(1, size.width), Math.max(1, size.height));
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

function minY(pixels: Array<{ y: number }>): number {
  return Math.min(...pixels.map((p) => p.y));
}

function maxY(pixels: Array<{ y: number }>): number {
  return Math.max(...pixels.map((p) => p.y));
}

describe('font-data toàn vẹn', () => {
  it('glyph gốc 8×16, mỗi hàng một byte', () => {
    expect(GLYPH_W).toBe(8);
    expect(GLYPH_H).toBe(16);
    expect(CELL_W).toBe(8);
    expect(CELL_H).toBe(22);
    for (const [char, rows] of GLYPHS) {
      expect(rows, `glyph "${char}"`).toBeInstanceOf(Uint8Array);
      expect(rows, `glyph "${char}"`).toHaveLength(GLYPH_H);
    }
  });

  it('mọi bitmap dấu rộng 8 cột và không chứa ký tự lạ', () => {
    for (const rows of Object.values(TONE_ROWS)) {
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toHaveLength(8);
        expect(/^[.#]+$/.test(row), `dấu lạ: ${row}`).toBe(true);
      }
    }
    for (const rows of Object.values(MODIFIER_ROWS)) {
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toHaveLength(8);
        expect(/^[.#]+$/.test(row), `dấu lạ: ${row}`).toBe(true);
      }
    }
  });

  it('có glyph chữ i không chấm và nó không có chấm', () => {
    const dotless = GLYPHS.get('ı');
    expect(dotless).toBeDefined();
    for (let r = 0; r <= 4; r++) expect(dotless![r], `hàng ${r}`).toBe(0);
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

  it('đủ cả chữ hoa có dấu (không còn rơi về ?)', () => {
    expect(decompose('Ế')).toEqual({ base: 'E', tone: 'acute', modifier: 'circumflex' });
    expect(decompose('Ậ')).toEqual({ base: 'A', tone: 'dot', modifier: 'circumflex' });
    expect(decompose('Ổ')).toEqual({ base: 'O', tone: 'hook', modifier: 'circumflex' });
    expect(decompose('Ộ')).toEqual({ base: 'O', tone: 'dot', modifier: 'circumflex' });
    expect(decompose('Ứ')).toEqual({ base: 'U', tone: 'acute', modifier: 'horn' });
    for (const char of ACCENTED) expect(hasGlyph(char), `"${char}"`).toBe(true);
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
  it('đo theo ô 8×22 nhân scale', () => {
    expect(measureText('abc')).toEqual({ width: 3 * CELL_W, height: CELL_H });
    expect(measureText('abc', 2)).toEqual({ width: 3 * CELL_W * 2, height: CELL_H * 2 });
    expect(measureText('Thế giới cổ tích')).toEqual({
      width: normalizeText('Thế giới cổ tích').length * CELL_W,
      height: CELL_H,
    });
  });

  it('tính cả spacing vào bề rộng', () => {
    expect(measureText('AB', 1, 2).width).toBe(2 * CELL_W + 2);
    expect(measureText('AB', 2, 2).width).toBe((2 * CELL_W + 2) * 2);
    expect(measureText('A', 1, 2).width).toBe(CELL_W);
    expect(measureText('', 1, 2).width).toBe(0);
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
    expect(maxY(marked)).toBe(maxY(plain));
    expect(minY(marked)).toBeLessThan(minY(plain));
  });

  it('dấu nặng nằm dưới chân chữ', () => {
    const plain = litPixels(render('a'));
    const dot = litPixels(render('ạ'));
    expect(maxY(dot)).toBeGreaterThan(maxY(plain));
  });

  it('dấu nặng vẫn hiện khi đi kèm dấu phụ', () => {
    const breve = litPixels(render('ă'));
    const both = litPixels(render('ặ'));
    expect(minY(both)).toBe(minY(breve));
    expect(maxY(both)).toBeGreaterThan(maxY(breve));
    const art = toAscii('ặ');
    expect(art[6]).toContain('#');
    expect(art[16]).toContain('#');
  });

  it('hai dấu xếp chồng cách nhau một hàng trống', () => {
    const art = toAscii('ế');
    expect(art[3]).toContain('#');
    expect(art[6]).toContain('#');
    expect(art[5]).not.toContain('#');
    expect(art[8]).not.toContain('#');
  });

  it('dấu của chữ hoa có dấu vẫn nằm trong ô', () => {
    const art = toAscii('Ế');
    expect(art[0]).toContain('#');
    expect(art.length).toBe(CELL_H);
  });

  it('móc ơ/ư nằm trên chữ cái', () => {
    expect(minY(litPixels(render('ơ')))).toBeLessThan(minY(litPixels(render('o'))));
    expect(minY(litPixels(render('ư')))).toBeLessThan(minY(litPixels(render('u'))));
  });

  it('Đ khác D, đ khác d (không còn giống nhau)', () => {
    expect(litPixels(render('Đ'))).not.toEqual(litPixels(render('D')));
    expect(litPixels(render('đ'))).not.toEqual(litPixels(render('d')));
    expect(litPixels(render('Đ'))).not.toEqual(litPixels(render('?')));
    expect(litPixels(render('đ'))).not.toEqual(litPixels(render('?')));
  });

  it('chữ có đuôi g/p/q/y xuống dưới đường chân', () => {
    const base = maxY(litPixels(render('a')));
    for (const char of ['g', 'p', 'q', 'y']) {
      expect(maxY(litPixels(render(char))), `"${char}"`).toBeGreaterThan(base);
    }
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

  it('shadow vẽ thêm bóng lệch phải-xuống', () => {
    const fb = new Framebuffer(60, 40);
    drawText(fb, 'A', 4, 4, WHITE, { shadow: RED });
    const red = litPixels(fb).filter((p) => {
      const c = fb.getPixel(p.x, p.y);
      return ((c >>> 24) & 0xff) === 0xff && ((c >>> 8) & 0xff) === 0;
    });
    expect(red.length).toBeGreaterThan(0);
  });

  it('căn lề trái / giữa / phải thay đổi vị trí bắt đầu', () => {
    const fbLeft = new Framebuffer(140, 40);
    const fbCenter = new Framebuffer(140, 40);
    const fbRight = new Framebuffer(140, 40);
    drawText(fbLeft, 'MM', 90, 4, WHITE, { align: 'left' });
    drawText(fbCenter, 'MM', 90, 4, WHITE, { align: 'center' });
    drawText(fbRight, 'MM', 90, 4, WHITE, { align: 'right' });

    const left = minY(litPixels(fbLeft)); // chỉ để chắc có vẽ
    const startOf = (fb: Framebuffer): number => Math.min(...litPixels(fb).map((p) => p.x));
    expect(left).toBeGreaterThanOrEqual(0);
    expect(startOf(fbCenter)).toBeLessThan(startOf(fbLeft));
    expect(startOf(fbRight)).toBeLessThan(startOf(fbCenter));
  });

  it('căn lề tính cả spacing', () => {
    const fbA = new Framebuffer(200, 40);
    const fbB = new Framebuffer(200, 40);
    drawText(fbA, 'MM', 120, 4, WHITE, { align: 'center', spacing: 0 });
    drawText(fbB, 'MM', 120, 4, WHITE, { align: 'center', spacing: 8 });
    const startA = Math.min(...litPixels(fbA).map((p) => p.x));
    const startB = Math.min(...litPixels(fbB).map((p) => p.x));
    expect(startB).toBe(startA - 4);
  });

  it('trả về kích thước đã tính spacing', () => {
    const fb = new Framebuffer(60, 40);
    const size = drawText(fb, 'AB', 1, 1, WHITE, { spacing: 3 });
    expect(size.width).toBe(measureText('AB', 1, 3).width);
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
