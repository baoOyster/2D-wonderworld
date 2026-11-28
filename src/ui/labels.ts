/**
 * Nhãn chữ thuần cho panel/toolbar — tách khỏi DOM để test được bằng Node.
 */

/** Nhãn trạng thái theo pha ngày/đêm (`0` = ngày, `1` = đêm). */
export function dayNightLabel(dayPhase: number): string {
  return dayPhase >= 0.5 ? 'Đêm' : 'Ngày';
}

/** Mức zoom dạng phần trăm, làm tròn. */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Gợi ý phím tắt hiển thị cạnh toolbar. */
export const SHORTCUT_HINTS = 'N ngày/đêm · + − zoom · 0 đặt lại · Esc đóng';
