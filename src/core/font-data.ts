/**
 * Font bitmap nền cho cảnh — trích từ **Terminus Bold 8×16**.
 *
 * Bản quyền font gốc:
 *   Copyright (C) 2020 Dimitar Toshkov Zhekov
 *   Licensed under the SIL Open Font License, Version 1.1.
 *   Nguồn: https://sourceforge.net/projects/terminus-font/
 *
 * Nhóm chỉ lấy từ font gốc: glyph **chữ cơ sở không dấu** (ASCII + `Đ`/`đ`)
 * và hình các dấu sắc, huyền, ngã, mũ, breve (trích từ các glyph dựng sẵn).
 * Dấu hỏi, dấu nặng và móc `ơ`/`ư` do nhóm vẽ thêm. Toàn bộ phần ghép dấu
 * (chọn chữ cơ sở + xếp chồng dấu) là của nhóm, không dùng glyph dựng sẵn.
 *
 * Ô ký tự: rộng **8**, cao **22**. Glyph 8×16 đặt tại hàng `BASE_TOP = 4`;
 * vùng phía trên dành cho dấu (xếp chồng tối đa 2 dấu, cách 1 hàng trống),
 * vùng dưới dành cho đuôi chữ và dấu nặng.
 */

/** Chiều rộng bitmap glyph gốc. */
export const GLYPH_W = 8;

/** Chiều cao bitmap glyph gốc (Terminus 16). */
export const GLYPH_H = 16;

/** Chiều rộng một ô ký tự (Terminus vốn monospace 8px). */
export const CELL_W = 8;

/** Chiều cao một ô ký tự, đủ chỗ dấu trên/dưới và đuôi chữ. */
export const CELL_H = 22;

/** Hàng bắt đầu của glyph gốc trong ô. */
export const BASE_TOP = 4;

/** Dấu thanh. `dot` (nặng) nằm dưới chân chữ. */
export type ToneName = 'acute' | 'grave' | 'hook' | 'tilde' | 'dot';

/** Dấu phụ biến đổi chữ cơ sở. */
export type ModifierName = 'circumflex' | 'breve' | 'horn';

/** Một ký tự sau khi tách thành chữ cơ sở + dấu. */
export interface DecomposedGlyph {
  /** Khoá trong {@link GLYPHS}. */
  base: string;
  tone: ToneName | null;
  modifier: ModifierName | null;
}

/** Bitmap dấu thanh, mỗi dấu 2 hàng × 8 cột. */
export const TONE_ROWS: Readonly<Record<ToneName, readonly string[]>> = {
  acute: ['...##...', '..##....'],
  grave: ['..##....', '...##...'],
  hook: ['..##....', '.#......'],
  tilde: ['.###.##.', '##.###..'],
  dot: ['..##....', '..##....'],
};

/** Bitmap dấu phụ, mỗi dấu 2 hàng × 8 cột. */
export const MODIFIER_ROWS: Readonly<Record<ModifierName, readonly string[]>> = {
  circumflex: ['..###...', '.##.##..'],
  breve: ['.##.##..', '..###...'],
  horn: ['......#.', '.....##.'],
};

/** Ký tự thay thế khi gặp glyph chưa hỗ trợ. */
export const FALLBACK_CHAR = '?';

/**
 * Bitmap glyph gốc, mỗi glyph 16 byte (mỗi hàng 1 byte, bit cao là cột trái).
 * `ı` là `i` không chấm, dùng khi `i` mang dấu thanh.
 */
const GLYPH_HEX: Readonly<Record<string, string>> = {
  ' ': '00000000000000000000000000000000',
  '!': '00001818181818181800181800000000',
  '"': '00666666000000000000000000000000',
  '#': '00006C6C6CFE6C6CFE6C6C6C00000000',
  '$': '0010107CD6D0D07C1616D67C10100000',
  '%': '000066D66C0C181830366B6600000000',
  '&': '0000386C6C3876DCCCCCDC7600000000',
  "'": '00181818000000000000000000000000',
  '(': '00000C18303030303030180C00000000',
  ')': '000030180C0C0C0C0C0C183000000000',
  '*': '00000000006C38FE386C000000000000',
  '+': '000000000018187E1818000000000000',
  ',': '00000000000000000000181830000000',
  '-': '00000000000000FE0000000000000000',
  '.': '00000000000000000000181800000000',
  '/': '000006060C0C18183030606000000000',
  '0': '00007CC6C6CEDEF6E6C6C67C00000000',
  '1': '00001838781818181818187E00000000',
  '2': '00007CC6C6060C183060C0FE00000000',
  '3': '00007CC6C6063C0606C6C67C00000000',
  '4': '0000060E1E3666C6FE06060600000000',
  '5': '0000FEC0C0C0FC060606C67C00000000',
  '6': '00003C60C0C0FCC6C6C6C67C00000000',
  '7': '0000FE06060C0C181830303000000000',
  '8': '00007CC6C6C67CC6C6C6C67C00000000',
  '9': '00007CC6C6C6C67E06060C7800000000',
  ':': '00000000001818000000181800000000',
  ';': '00000000001818000000181830000000',
  '<': '000000060C18306030180C0600000000',
  '=': '0000000000FE0000FE00000000000000',
  '>': '0000006030180C060C18306000000000',
  '?': '00007CC6C6C60C181800181800000000',
  '@': '00007CC6CED6D6D6D6CEC07E00000000',
  A: '00007CC6C6C6C6FEC6C6C6C600000000',
  B: '0000FCC6C6C6FCC6C6C6C6FC00000000',
  C: '00007CC6C6C0C0C0C0C6C67C00000000',
  D: '0000F8CCC6C6C6C6C6C6CCF800000000',
  E: '0000FEC0C0C0F8C0C0C0C0FE00000000',
  F: '0000FEC0C0C0F8C0C0C0C0C000000000',
  G: '00007CC6C6C0C0DEC6C6C67C00000000',
  H: '0000C6C6C6C6FEC6C6C6C6C600000000',
  I: '00003C18181818181818183C00000000',
  J: '00001E0C0C0C0C0C0CCCCC7800000000',
  K: '0000C6C6CCD8F0F0D8CCC6C600000000',
  L: '0000C0C0C0C0C0C0C0C0C0FE00000000',
  M: '000082C6EEFED6C6C6C6C6C600000000',
  N: '0000C6C6C6E6F6DECEC6C6C600000000',
  O: '00007CC6C6C6C6C6C6C6C67C00000000',
  P: '0000FCC6C6C6C6FCC0C0C0C000000000',
  Q: '00007CC6C6C6C6C6C6C6DE7C06000000',
  R: '0000FCC6C6C6C6FCF0D8CCC600000000',
  S: '00007CC6C0C07C0606C6C67C00000000',
  T: '0000FF18181818181818181800000000',
  U: '0000C6C6C6C6C6C6C6C6C67C00000000',
  V: '0000C6C6C6C6C66C6C6C383800000000',
  W: '0000C6C6C6C6C6D6FEEEC68200000000',
  X: '0000C6C66C6C38386C6CC6C600000000',
  Y: '0000C3C366663C181818181800000000',
  Z: '0000FE06060C183060C0C0FE00000000',
  '[': '00003C30303030303030303C00000000',
  '\\': '00006060303018180C0C060600000000',
  ']': '00003C0C0C0C0C0C0C0C0C3C00000000',
  '^': '00183C66000000000000000000000000',
  _: '00000000000000000000000000FE0000',
  '`': '30180000000000000000000000000000',
  a: '00000000007C067EC6C6C67E00000000',
  b: '0000C0C0C0FCC6C6C6C6C6FC00000000',
  c: '00000000007CC6C0C0C0C67C00000000',
  d: '00000606067EC6C6C6C6C67E00000000',
  e: '00000000007CC6C6FEC0C07C00000000',
  f: '00001E3030FC30303030303000000000',
  g: '00000000007EC6C6C6C6C67E06067C00',
  h: '0000C0C0C0FCC6C6C6C6C6C600000000',
  i: '00001818003818181818183C00000000',
  j: '00000606000E06060606060666663C00',
  k: '0000C0C0C0C6CCD8F0D8CCC600000000',
  l: '00003818181818181818183C00000000',
  m: '0000000000FCD6D6D6D6D6D600000000',
  n: '0000000000FCC6C6C6C6C6C600000000',
  o: '00000000007CC6C6C6C6C67C00000000',
  p: '0000000000FCC6C6C6C6C6FCC0C0C000',
  q: '00000000007EC6C6C6C6C67E06060600',
  r: '0000000000DEF0E0C0C0C0C000000000',
  s: '00000000007EC0C07C0606FC00000000',
  t: '0000303030FC30303030301E00000000',
  u: '0000000000C6C6C6C6C6C67E00000000',
  v: '0000000000C6C6C66C6C383800000000',
  w: '0000000000C6C6D6D6D6D67C00000000',
  x: '0000000000C6C66C386CC6C600000000',
  y: '0000000000C6C6C6C6C6C67E06067C00',
  z: '0000000000FE0C183060C0FE00000000',
  '{': '00001C30303060303030301C00000000',
  '|': '00001818181818181818181800000000',
  '}': '0000701818180C181818187000000000',
  '~': '0073DBCE000000000000000000000000',
  'Đ': '0000786C6666F66666666C7800000000',
  'đ': '0000061F067EC6C6C6C6C67E00000000',
  'ı': '00000000003818181818183C00000000',
};

function decode(hex: string): Uint8Array {
  const rows = new Uint8Array(GLYPH_H);
  for (let r = 0; r < GLYPH_H; r++) {
    rows[r] = Number.parseInt(hex.slice(r * 2, r * 2 + 2), 16);
  }
  return rows;
}

/** Glyph đã giải mã: 16 hàng, mỗi hàng 1 byte (bit 7 = cột trái). */
export const GLYPHS: ReadonlyMap<string, Uint8Array> = new Map(
  Object.entries(GLYPH_HEX).map(([char, hex]) => [char, decode(hex)]),
);

const TONE_ORDER: ReadonlyArray<ToneName | null> = [
  null,
  'acute',
  'grave',
  'hook',
  'tilde',
  'dot',
];

interface VowelGroup {
  /** 6 biến thể theo thứ tự: không dấu, sắc, huyền, hỏi, ngã, nặng. */
  chars: readonly string[];
  base: string;
  modifier: ModifierName | null;
}

const VOWEL_GROUPS: readonly VowelGroup[] = [
  { chars: ['a', 'á', 'à', 'ả', 'ã', 'ạ'], base: 'a', modifier: null },
  { chars: ['ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ'], base: 'a', modifier: 'breve' },
  { chars: ['â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ'], base: 'a', modifier: 'circumflex' },
  { chars: ['e', 'é', 'è', 'ẻ', 'ẽ', 'ẹ'], base: 'e', modifier: null },
  { chars: ['ê', 'ế', 'ề', 'ể', 'ễ', 'ệ'], base: 'e', modifier: 'circumflex' },
  { chars: ['i', 'í', 'ì', 'ỉ', 'ĩ', 'ị'], base: 'i', modifier: null },
  { chars: ['o', 'ó', 'ò', 'ỏ', 'õ', 'ọ'], base: 'o', modifier: null },
  { chars: ['ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ'], base: 'o', modifier: 'circumflex' },
  { chars: ['ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ'], base: 'o', modifier: 'horn' },
  { chars: ['u', 'ú', 'ù', 'ủ', 'ũ', 'ụ'], base: 'u', modifier: null },
  { chars: ['ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự'], base: 'u', modifier: 'horn' },
  { chars: ['y', 'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ'], base: 'y', modifier: null },
  { chars: ['A', 'Á', 'À', 'Ả', 'Ã', 'Ạ'], base: 'A', modifier: null },
  { chars: ['Ă', 'Ắ', 'Ằ', 'Ẳ', 'Ẵ', 'Ặ'], base: 'A', modifier: 'breve' },
  { chars: ['Â', 'Ấ', 'Ầ', 'Ẩ', 'Ẫ', 'Ậ'], base: 'A', modifier: 'circumflex' },
  { chars: ['E', 'É', 'È', 'Ẻ', 'Ẽ', 'Ẹ'], base: 'E', modifier: null },
  { chars: ['Ê', 'Ế', 'Ề', 'Ể', 'Ễ', 'Ệ'], base: 'E', modifier: 'circumflex' },
  { chars: ['I', 'Í', 'Ì', 'Ỉ', 'Ĩ', 'Ị'], base: 'I', modifier: null },
  { chars: ['O', 'Ó', 'Ò', 'Ỏ', 'Õ', 'Ọ'], base: 'O', modifier: null },
  { chars: ['Ô', 'Ố', 'Ồ', 'Ổ', 'Ỗ', 'Ộ'], base: 'O', modifier: 'circumflex' },
  { chars: ['Ơ', 'Ớ', 'Ờ', 'Ở', 'Ỡ', 'Ợ'], base: 'O', modifier: 'horn' },
  { chars: ['U', 'Ú', 'Ù', 'Ủ', 'Ũ', 'Ụ'], base: 'U', modifier: null },
  { chars: ['Ư', 'Ứ', 'Ừ', 'Ử', 'Ữ', 'Ự'], base: 'U', modifier: 'horn' },
  { chars: ['Y', 'Ý', 'Ỳ', 'Ỷ', 'Ỹ', 'Ỵ'], base: 'Y', modifier: null },
];

/** Bảng ghép dấu: ký tự dựng sẵn → (chữ cơ sở, dấu thanh, dấu phụ). */
export const COMPOSED: ReadonlyMap<string, DecomposedGlyph> = (() => {
  const map = new Map<string, DecomposedGlyph>();
  for (const group of VOWEL_GROUPS) {
    group.chars.forEach((char, i) => {
      if (!map.has(char)) {
        map.set(char, { base: group.base, tone: TONE_ORDER[i], modifier: group.modifier });
      }
    });
  }
  return map;
})();
