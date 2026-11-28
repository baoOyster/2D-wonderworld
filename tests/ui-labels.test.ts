import { describe, expect, it } from 'vitest';
import { dayNightLabel, formatZoom, SHORTCUT_HINTS } from '../src/ui/labels.ts';

describe('UI labels', () => {
  it('nhãn ngày/đêm theo ngưỡng 0.5', () => {
    expect(dayNightLabel(0)).toBe('Ngày');
    expect(dayNightLabel(0.49)).toBe('Ngày');
    expect(dayNightLabel(0.5)).toBe('Đêm');
    expect(dayNightLabel(1)).toBe('Đêm');
  });

  it('zoom hiển thị phần trăm làm tròn', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(1.2)).toBe('120%');
    expect(formatZoom(0.83)).toBe('83%');
    expect(formatZoom(1.235)).toBe('124%');
  });

  it('gợi ý phím tắt có đủ phím chính', () => {
    for (const key of ['N', '+', '−', '0', 'Esc']) {
      expect(SHORTCUT_HINTS).toContain(key);
    }
  });
});
