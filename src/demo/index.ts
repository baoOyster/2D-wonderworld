import type { Framebuffer } from '../core/framebuffer.ts';

/** Một trang demo: vẽ toàn bộ framebuffer từ thời gian `t` (giây). */
export type Demo = (fb: Framebuffer, t: number) => void;

/**
 * Tự nạp mọi file `src/demo/*.ts` (trừ `index.ts`).
 *
 * Ai viết demo chỉ cần thêm file export default `(fb, t) => void`, không sửa
 * file này. Chọn demo bằng `?demo=<tên-file>`; không có tham số thì dùng
 * `gradient` làm cảnh tạm tới khi scene chung (#34/#9) hoàn tất.
 */
const modules = import.meta.glob<{ default?: Demo }>(['./*.ts', '!./index.ts'], {
  eager: true,
});

const demos: Record<string, Demo> = {};

for (const [path, module] of Object.entries(modules)) {
  const name = path.replace(/^\.\//, '').replace(/\.ts$/, '');
  if (typeof module.default === 'function') demos[name] = module.default;
}

/** Tên demo có sẵn, đã sắp xếp. */
export const demoNames: readonly string[] = Object.keys(demos).sort();

/** Demo đã chọn; tên không hợp lệ hoặc thiếu đều rơi về `gradient`. */
export function resolveDemo(name: string | null): Demo {
  const selected = name ? demos[name] : undefined;
  const fallback = demos.gradient;
  if (selected) return selected;
  if (fallback) return fallback;

  return (fb: Framebuffer): void => {
    fb.clear(0x0b1016ff);
  };
}
