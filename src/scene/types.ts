import type { Camera } from '../core/camera.ts';
import type { Palette } from '../core/palette.ts';
import type { Renderer } from '../core/renderer-types.ts';
import type { Vec2 } from '../core/vec2.ts';

/**
 * Môi trường dùng chung mà `World` tạo lại mỗi khung hình rồi truyền cho
 * `update`/`draw` của mọi vật thể.
 *
 * Vật thể **không** giữ tham chiếu tới `Env` giữa các khung: mỗi lần gọi là
 * một ảnh chụp trạng thái của khung đó.
 */
export interface Env {
  /** Thời gian chạy luỹ kế, tính bằng giây. */
  time: number;
  /** Thời gian một khung, tính bằng giây (fixed 1/60). */
  dt: number;
  /** Pha ngày/đêm, `0` = ngày, `1` = đêm. */
  dayPhase: number;
  /** Bảng màu hiện tại; vật thể chỉ được lấy màu từ đây. */
  palette: Palette;
  /** Camera world → screen dùng chung của cảnh. */
  camera: Camera;
  /**
   * Vị trí con trỏ trong toạ độ world (SPEC #1, cập nhật 25/11), `null` khi
   * chuột ra ngoài khung; `undefined` khi chưa có lớp input (#9).
   *
   * Vật **không** `interactive` (lau sậy, cỏ, cá…) chỉ phản ứng theo trường này:
   * phản ứng phải tắt dần và trở về trạng thái cũ, không hiện nhãn hay panel.
   */
  pointer?: Vec2 | null;
}

/**
 * Hành động UI mà vật thể được phép gọi (do `World` cài đặt).
 *
 * Tách khỏi DOM để vật thể không phụ thuộc giao diện; panel/toolbar thật do
 * lớp UI đảm nhiệm.
 */
export interface UiActions {
  /** Chuyển ngày ↔ đêm (có hiệu ứng chuyển màu). */
  toggleDayNight(): void;
  /** Chọn một vật thể, hoặc bỏ chọn khi truyền `null`. */
  select(obj: SceneObject | null): void;
  /** Vật thể đang được chọn, nếu có. */
  getSelected(): SceneObject | null;
}

/** Ngữ cảnh truyền vào `SceneObject.onClick`. */
export interface ClickContext {
  env: Env;
  ui: UiActions;
}

/**
 * Một vật thể trong cảnh.
 *
 * Toạ độ trong `hitPolygons` là world-space (1280×720). Vật thể tự vẽ mọi thứ
 * của mình trong `draw`, kể cả bóng/nền, và phải tôn trọng `layer`.
 */
export interface SceneObject {
  /** Định danh ổn định, duy nhất trong cảnh. */
  readonly id: string;
  /** Tên tiếng Việt hiển thị trong panel. */
  readonly name: string;
  /** Mô tả 1–2 câu hiển thị trong panel. */
  readonly description: string;
  /** Tên các thuật toán dùng để hiển thị trong panel. */
  readonly algorithms: readonly string[];
  /** Thứ tự vẽ (xem `Layer`); sort tăng dần. */
  readonly layer: number;
  /** `true` nếu chọn được bằng chuột; khi đó bắt buộc có `hitPolygons`. */
  readonly interactive: boolean;
  /** Cập nhật trạng thái theo thời gian (không dùng `Math.random`). */
  update?(env: Env): void;
  /** Vẽ vật thể lên framebuffer qua `Renderer` (không dùng API Canvas). */
  draw(r: Renderer, env: Env): void;
  /** Đa giác world-space để hit-test; bắt buộc khi `interactive: true`. */
  hitPolygons?(env: Env): readonly Vec2[][];
  /** Xử lý khi vật thể được bấm. */
  onClick?(ctx: ClickContext): void;
}

/** Callback `World` gọi khi lựa chọn / hover thay đổi, để UI cập nhật. */
export interface WorldCallbacks {
  onSelectionChange?(selected: SceneObject | null): void;
  onHoverChange?(hovered: SceneObject | null): void;
}
