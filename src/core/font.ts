import type { RGBA } from './color.ts';
import type { Framebuffer } from './framebuffer.ts';
import {
  BASE_TOP,
  CELL_H,
  CELL_W,
  COMPOSED,
  FALLBACK_CHAR,
  GLYPHS,
  MODIFIER_ROWS,
  TONE_ROWS,
  type DecomposedGlyph,
} from './font-data.ts';

/** Tuỳ chọn khi vẽ chữ. */
export interface DrawTextOptions {
  /** Hệ số phóng, số nguyên ≥ 1 (mặc định 1). */
  scale?: number;
  /** Căn lề theo `x` (mặc định `left`). */
  align?: 'left' | 'center' | 'right';
  /** Màu bóng đổ; bóng lệch 1 pixel cell (× scale) xuống phải. */
  shadow?: RGBA;
  /** Khoảng cách thêm giữa các ô, tính bằng pixel font (mặc định 0). */
  spacing?: number;
}

/** Hàng đặt dấu thanh trên (không có dấu phụ). */
const TONE_TOP = 1;
/** Hàng đặt dấu thanh trên khi đã có dấu phụ (mũ/breve/horn). */
const TONE_TOP_STACKED = 0;
/** Hàng đặt dấu phụ. */
const MODIFIER_TOP = 2;
/** Hàng đặt dấu nặng (dưới chân chữ). */
const DOT_BELOW_TOP = 9;

/** Chuẩn hoá văn bản về NFC để các ký tự tiếng Việt dựng sẵn khớp bảng ghép dấu. */
export function normalizeText(text: string): string {
  return text.normalize('NFC');
}

/** Tách một ký tự thành chữ cơ sở + dấu; `null` nếu chưa hỗ trợ. */
export function decompose(char: string): DecomposedGlyph | null {
  const composed = COMPOSED.get(char);
  if (composed) return composed;
  if (Object.prototype.hasOwnProperty.call(GLYPHS, char)) {
    return { base: char, tone: null, modifier: null };
  }
  return null;
}

/** Kiểm tra ký tự có glyph để vẽ hay không (không tính fallback). */
export function hasGlyph(char: string): boolean {
  return decompose(char) !== null;
}

function toChars(text: string): string[] {
  return Array.from(normalizeText(text));
}

/** Đo kích thước chuỗi khi vẽ ở `scale`. Toạ độ trả về theo pixel framebuffer. */
export function measureText(text: string, scale = 1): { width: number; height: number } {
  const s = Math.max(1, Math.floor(scale));
  const count = toChars(text).length;
  return { width: count * CELL_W * s, height: CELL_H * s };
}

function blit(
  fb: Framebuffer,
  rows: readonly string[],
  x0: number,
  y0: number,
  color: RGBA,
  scale: number,
): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row.charCodeAt(c) !== 35 /* '#' */) continue;
      const px = x0 + c * scale;
      const py = y0 + r * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          fb.blendPixel(px + dx, py + dy, color);
        }
      }
    }
  }
}

function drawGlyph(
  fb: Framebuffer,
  glyph: DecomposedGlyph,
  x: number,
  y: number,
  color: RGBA,
  scale: number,
): void {
  const base = GLYPHS[glyph.base] ?? GLYPHS[FALLBACK_CHAR];
  blit(fb, base, x, y + BASE_TOP * scale, color, scale);

  if (glyph.modifier) {
    const top = glyph.modifier === 'horn' ? MODIFIER_TOP + 1 : MODIFIER_TOP;
    blit(fb, MODIFIER_ROWS[glyph.modifier], x, y + top * scale, color, scale);
  }

  if (glyph.tone === 'dot') {
    blit(fb, TONE_ROWS.dot, x, y + DOT_BELOW_TOP * scale, color, scale);
  } else if (glyph.tone) {
    const top = glyph.modifier ? TONE_TOP_STACKED : TONE_TOP;
    blit(fb, TONE_ROWS[glyph.tone], x, y + top * scale, color, scale);
  }
}

function pass(
  fb: Framebuffer,
  chars: readonly string[],
  startX: number,
  y: number,
  color: RGBA,
  scale: number,
  advance: number,
): void {
  let x = startX;
  for (const char of chars) {
    const glyph = decompose(char) ?? { base: FALLBACK_CHAR, tone: null, modifier: null };
    drawGlyph(fb, glyph, x, y, color, scale);
    x += advance;
  }
}

/**
 * Vẽ chữ lên framebuffer bằng pixel (không dùng `ctx.fillText`).
 *
 * `x, y` là góc trên-trái của ô ký tự đầu tiên. Với `align` khác `left`, `x`
 * được hiểu là mép trái / tâm / mép phải của cả chuỗi. Trả về bề rộng đã vẽ.
 */
export function drawText(
  fb: Framebuffer,
  text: string,
  x: number,
  y: number,
  color: RGBA,
  opts: DrawTextOptions = {},
): { width: number; height: number } {
  const scale = Math.max(1, Math.floor(opts.scale ?? 1));
  const spacing = opts.spacing ?? 0;
  const chars = toChars(text);
  const size = measureText(text, scale);
  const advance = (CELL_W + spacing) * scale;

  let startX = x;
  if (chars.length > 0) {
    if (opts.align === 'center') startX = x - size.width / 2;
    else if (opts.align === 'right') startX = x - size.width;
  }
  startX = Math.round(startX);
  const top = Math.round(y);

  if (opts.shadow !== undefined && chars.length > 0) {
    pass(fb, chars, startX + scale, top + scale, opts.shadow, scale, advance);
  }
  pass(fb, chars, startX, top, color, scale, advance);

  return size;
}
