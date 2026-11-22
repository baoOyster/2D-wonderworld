/**
 * RNG có seed (mulberry32).
 *
 * Không dùng `Math.random()` trong `draw`/`update`: cùng seed phải cho cùng
 * dãy số để cảnh và animation tái lập được giữa các lần chạy.
 *
 * @param seed Số nguyên 32 bit; mọi giá trị đều được chấp nhận.
 * @returns Hàm trả số thực trong khoảng [0, 1).
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;

  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
