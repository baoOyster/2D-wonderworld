import type { RGBA } from './color.ts';
import type { Framebuffer } from './framebuffer.ts';
import {
  BASE_TOP,
  CELL_H,
  CELL_W,
  COMPOSED,
  FALLBACK_CHAR,
  GLYPH_H,
  GLYPH_W,
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

/** Chữ `i` mất chấm khi mang dấu thanh, tránh chạm dấu. */
const DOTLESS_I = 'ı';

/** Chuẩn hoá văn bản về NFC để các ký tự tiếng Việt dựng sẵn khớp bảng ghép dấu. */
export function normalizeText(text: string): string {
  return text.normalize('NFC');
}

/** Tách một ký tự thành chữ cơ sở + dấu; `null` nếu chưa hỗ trợ. */
export function decompose(char: string): DecomposedGlyph | null {
  const composed = COMPOSED.get(char);
  if (composed) return composed;
  if (GLYPHS.has(char)) {
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

function normalizeScale(scale: number): number {
  return Math.max(1, Math.floor(scale));
}

/**
 * Đo kích thước chuỗi khi vẽ ở `scale`, tính cả `spacing` giữa các ô.
 * Toạ độ trả về theo pixel framebuffer.
 */
export function measureText(
  text: string,
  scale = 1,
  spacing = 0,
): { width: number; height: number } {
  const s = normalizeScale(scale);
  const gap = Math.max(0, Math.floor(spacing));
  const count = toChars(text).length;
  const width = count === 0 ? 0 : (count * CELL_W + (count - 1) * gap) * s;
  return { width, height: CELL_H * s };
}

interface GlyphBounds {
  /** Hàng nội dung trên cùng của glyph gốc (0..15). */
  top: number;
  /** Hàng nội dung dưới cùng của glyph gốc (0..15). */
  bottom: number;
}

const boundsCache = new Map<string, GlyphBounds>();

function glyphRows(key: string): Uint8Array {
  return GLYPHS.get(key) ?? GLYPHS.get(FALLBACK_CHAR)!;
}

function glyphBounds(key: string): GlyphBounds {
  const cached = boundsCache.get(key);
  if (cached) return cached;
  const rows = glyphRows(key);
  let top = GLYPH_H;
  let bottom = -1;
  for (let r = 0; r < GLYPH_H; r++) {
    if (rows[r] !== 0) {
      if (top === GLYPH_H) top = r;
      bottom = r;
    }
  }
  if (bottom < 0) {
    top = 0;
    bottom = 0;
  }
  const bounds = { top, bottom };
  boundsCache.set(key, bounds);
  return bounds;
}

/** Điền một khối `scale × scale` pixel. */
function block(
  fb: Framebuffer,
  px: number,
  py: number,
  color: RGBA,
  scale: number,
): void {
  for (let dy = 0; dy < scale; dy++) {
    for (let dx = 0; dx < scale; dx++) {
      fb.blendPixel(px + dx, py + dy, color);
    }
  }
}

function blitGlyph(
  fb: Framebuffer,
  rows: Uint8Array,
  x0: number,
  y0: number,
  color: RGBA,
  scale: number,
): void {
  for (let r = 0; r < GLYPH_H; r++) {
    const byte = rows[r];
    if (byte === 0) continue;
    for (let c = 0; c < GLYPH_W; c++) {
      if ((byte & (1 << (GLYPH_W - 1 - c))) === 0) continue;
      block(fb, x0 + c * scale, y0 + r * scale, color, scale);
    }
  }
}

/** Vẽ bitmap dấu; `topRow` là hàng ô (tuyệt đối trong cell) của hàng dấu đầu. */
function blitMark(
  fb: Framebuffer,
  rows: readonly string[],
  x0: number,
  textY: number,
  topRow: number,
  color: RGBA,
  scale: number,
): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row.charCodeAt(c) !== 35 /* '#' */) continue;
      block(fb, x0 + c * scale, textY + (topRow + r) * scale, color, scale);
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
  const key = glyph.base === 'i' && glyph.tone !== null ? DOTLESS_I : glyph.base;
  const rows = glyphRows(key);
  const bounds = glyphBounds(key);
  const textY = y + BASE_TOP * scale;
  blitGlyph(fb, rows, x, textY, color, scale);

  let modifierTop: number | null = null;
  if (glyph.modifier) {
    const contentTop = BASE_TOP + bounds.top;
    const bottom = glyph.modifier === 'horn' ? contentTop - 1 : contentTop - 2;
    modifierTop = bottom - 1;
    blitMark(fb, MODIFIER_ROWS[glyph.modifier], x, y, modifierTop, color, scale);
  }

  if (glyph.tone === 'dot') {
    const topRow = BASE_TOP + bounds.bottom + 1;
    blitMark(fb, TONE_ROWS.dot, x, y, topRow, color, scale);
  } else if (glyph.tone) {
    const bottom = modifierTop === null ? BASE_TOP + bounds.top - 2 : modifierTop - 2;
    blitMark(fb, TONE_ROWS[glyph.tone], x, y, bottom - 1, color, scale);
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
 * được hiểu là mép trái / tâm / mép phải của cả chuỗi. Trả về kích thước đã vẽ
 * (đã tính `spacing`).
 */
export function drawText(
  fb: Framebuffer,
  text: string,
  x: number,
  y: number,
  color: RGBA,
  opts: DrawTextOptions = {},
): { width: number; height: number } {
  const scale = normalizeScale(opts.scale ?? 1);
  const spacing = Math.max(0, Math.floor(opts.spacing ?? 0));
  const chars = toChars(text);
  const size = measureText(text, scale, spacing);
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
