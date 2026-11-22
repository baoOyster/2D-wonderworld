import { describe, expect, it } from 'vitest';
import { lerpColor, pack, rgba, rgb, unpack, withAlpha } from '../src/core/color.ts';

describe('color', () => {
  it('pack/unpack giữ đúng cả 4 kênh, kể cả alpha', () => {
    const color = pack(18, 52, 86, 120);
    expect(color).toBe(0x12345678);
    expect(unpack(color)).toEqual({ r: 18, g: 52, b: 86, a: 120 });
  });

  it('pack kẹp giá trị ngoài 0…255', () => {
    expect(unpack(pack(-10, 300, 12.6, 255.4))).toEqual({ r: 0, g: 255, b: 13, a: 255 });
  });

  it('rgb nhận #rgb, #rrggbb và luôn đục', () => {
    expect(rgb('#ff8800')).toBe(0xff8800ff);
    expect(rgb('f80')).toBe(0xff8800ff);
    expect(rgb('#FF8800')).toBe(0xff8800ff);
    // 8 chữ số: alpha bị bỏ qua vì đây là rgb()
    expect(rgb('#ff880080')).toBe(0xff8800ff);
  });

  it('rgb báo lỗi với chuỗi không hợp lệ', () => {
    expect(() => rgb('#12345')).toThrow(/không hợp lệ/);
    expect(() => rgb('red')).toThrow(/không hợp lệ/);
  });

  it('rgba đặt alpha 0…1 và kẹp ngoài khoảng', () => {
    expect(rgba('#ff0000', 0)).toBe(0xff000000);
    expect(rgba('#ff0000', 0.5)).toBe(0xff000080);
    expect(rgba('#ff0000', 1)).toBe(0xff0000ff);
    expect(rgba('#ff0000', -1)).toBe(0xff000000);
    expect(rgba('#ff0000', 2)).toBe(0xff0000ff);
  });

  it('withAlpha chỉ đổi byte alpha', () => {
    expect(withAlpha(0x11223344, 1)).toBe(0x112233ff);
    expect(withAlpha(0x11223344, 0)).toBe(0x11223300);
  });

  it('lerpColor nội suy từng kênh và giữ đúng hai đầu mút', () => {
    const a = pack(0, 0, 0, 0);
    const b = pack(255, 100, 50, 255);

    expect(lerpColor(a, b, 0)).toBe(a);
    expect(lerpColor(a, b, 1)).toBe(b);
    expect(lerpColor(a, b, 0.5)).toBe(pack(128, 50, 25, 128));
    expect(lerpColor(a, b, -1)).toBe(a);
    expect(lerpColor(a, b, 2)).toBe(b);
  });
});
