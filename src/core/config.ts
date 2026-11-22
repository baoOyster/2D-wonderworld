/**
 * Hằng số chung của toàn dự án.
 *
 * Toạ độ world luôn là 1280×720; framebuffer mới là thứ đổi theo độ phân giải.
 * Camera chịu trách nhiệm nhân `RENDER_SCALE`, object không cần biết.
 */

/** Chiều rộng vùng vẽ (toạ độ world). */
export const WORLD_W = 1280;

/** Chiều cao vùng vẽ (toạ độ world). */
export const WORLD_H = 720;

/**
 * Tỉ lệ framebuffer / world.
 * - `1`   → 1280×720  (máy yếu)
 * - `1.5` → 1920×1080 (mặc định, Full HD)
 * - `2`   → 2560×1440 (màn hình lớn)
 */
export const RENDER_SCALE = 1.5;

/** Chiều rộng framebuffer tính bằng pixel. */
export const FB_W = Math.round(WORLD_W * RENDER_SCALE);

/** Chiều cao framebuffer tính bằng pixel. */
export const FB_H = Math.round(WORLD_H * RENDER_SCALE);
