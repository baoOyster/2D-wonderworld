/**
 * Vùng đất trống cho tiền cảnh (#17): kiểm tra một điểm có nằm trên mặt cỏ
 * hay không, tránh lối đi, gò đất nhà nấm, bộ rễ cây cổ thụ và phần đất bên
 * phải chừa cho hồ/suối (#13), cầu (#19) và lá to tiền cảnh (#18).
 */
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { HOUSE_DROP, HOUSE_SHIFT, MOUND } from '../midground/mushroom-house.ts';
import { pathPolygon } from '../midground/path.ts';

/** Mặt đất bắt đầu từ đường chân trời (world y). */
export const GROUND_TOP = 450;

/** Gò đất nhà nấm theo toạ độ world. */
const MOUND_WORLD: readonly Vec2[] = MOUND.map((p) => vec2(p.x + HOUSE_SHIFT, p.y + HOUSE_DROP));
const PATH = pathPolygon();

/** Vùng rễ cây cổ thụ (hình chữ nhật xấp xỉ): chỉ đặt bụi cỏ riêng ở đây. */
export const ROOT_ZONE = { x0: 0, x1: 520, y0: 440, y1: 515 } as const;

/**
 * Phần đất bên phải lối đi để trống cho hồ/suối, cầu và lá tiền cảnh
 * (layout.md: hồ x 710…1310, cầu x 860…1120, lá x 900…1280).
 */
export const RESERVED_RIGHT_X = 700;

/** Điểm trong đa giác (even-odd, tia ngang). */
export function pointInPolygon(x: number, y: number, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * `true` nếu cả hình vuông cạnh 2·margin quanh (x, y) nằm trên cỏ trống:
 * dưới chân trời, ngoài lối đi, ngoài gò đất, ngoài vùng rễ, ngoài phần đất
 * chừa bên phải.
 */
export function isFreeGround(x: number, y: number, margin = 0): boolean {
  if (y - margin < GROUND_TOP + 20) return false;
  if (x + margin > RESERVED_RIGHT_X) return false;
  if (x + margin > ROOT_ZONE.x0 && x - margin < ROOT_ZONE.x1 && y - margin < ROOT_ZONE.y1 && y + margin > ROOT_ZONE.y0) return false;
  for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const px = x + dx * margin, py = y + dy * margin;
    if (pointInPolygon(px, py, PATH) || pointInPolygon(px, py, MOUND_WORLD)) return false;
  }
  return true;
}
