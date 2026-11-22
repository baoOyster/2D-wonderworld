# Thuật toán & cách cài đặt

Tài liệu này ghi lại thuật toán thật sự dùng trong code, chi phí và các quy ước
chung. Mỗi issue cập nhật phần tương ứng ngay trong PR của mình.

- [#2 — Framebuffer, màu, RNG](#2--framebuffer-màu-rng)
- [#3 — Raster đường, tròn, ellipse](#3--raster-đường-tròn-ellipse)
- [#4 — Tô vùng & mask](#4--tô-vùng--mask)
- [#6 — Biến đổi 2D](#6--biến-đổi-2d)
- [#7 — Font bitmap tiếng Việt](#7--font-bitmap-tiếng-việt)
- [#8 — Camera & vòng lặp engine](#8--camera--vòng-lặp-engine)

---

## #2 — Framebuffer, màu, RNG

### Màu packed `0xRRGGBBAA`

Mỗi màu là một số nguyên 32 bit không dấu:

```
0xRRGGBBAA
  ││││││││
  │││└┴┴┴┴─ alpha (00 = trong suốt, ff = đục)
  └┴┴────── đỏ, lục, lam
```

Ví dụ: `0xff0000ff` = đỏ đục, `0xff000080` = đỏ alpha 50%.

Ưu điểm so với `Uint32Array`:

- Không phụ thuộc endian của CPU.
- Dễ so sánh, test và log bằng hex.
- Alpha nằm ở byte thấp nên `withAlpha` chỉ cần sửa 8 bit cuối.

API trong `src/core/color.ts`:

| Hàm | Việc |
|---|---|
| `pack(r, g, b, a)` | Ghép 4 kênh 0…255, kẹp và làm tròn |
| `unpack(c)` | Tách thành `{ r, g, b, a }` |
| `rgb(hex)` | `#rgb`, `#rrggbb`, `#rrggbbaa` → màu đục |
| `rgba(hex, alpha)` | Như `rgb` với alpha 0…1 |
| `withAlpha(c, alpha)` | Giữ RGB, thay alpha |
| `lerpColor(a, b, t)` | Nội suy từng kênh, kể cả alpha |

Các phép bitwise trong JavaScript trả về số có dấu, nên mọi kết quả đều được
`>>> 0` để giữ dạng không dấu.

### Cấu trúc framebuffer

`Framebuffer` giữ một `Uint8ClampedArray` dài `width × height × 4` byte theo
thứ tự R, G, B, A. `ImageData` được tạo **một lần** và dùng chung vùng nhớ:

```ts
this.data = new Uint8ClampedArray(width * height * 4);
this.image = new ImageData(this.data, width, height);
```

Nhờ vậy mỗi frame chỉ cần vẽ vào `fb.data` rồi gọi
`ctx.putImageData(fb.image, 0, 0)`, không cấp phát lại `ImageData`.

Chi phí bộ nhớ (một framebuffer):

| `RENDER_SCALE` | Kích thước | Byte | MiB |
|---|---|---|---|
| `1` | 1280×720 | 3.686.400 | 3,52 |
| `1.5` (mặc định) | 1920×1080 | 8.294.400 | 7,91 |
| `2` | 2560×1440 | 14.745.600 | 14,06 |

`clear()` là một lượt quét toàn bộ 8,3 triệu byte ở Full HD. Các lớp tĩnh sẽ
được cache ở #8/#26 để không phải tô lại mỗi frame.

Mọi thao tác pixel đều kiểm tra biên và bỏ qua pixel ngoài framebuffer, không
throw. `getPixel()` ngoài biên trả `0` (trong suốt).

### Alpha blending source-over

`blendPixel()` cài đặt công thức source-over với alpha thường (không
premultiplied):

```
outA = srcA + dstA · (1 − srcA)

        srcC · srcA + dstC · dstA · (1 − srcA)
outC = ─────────────────────────────────────────
                      outA
```

Trong đó `srcA`, `dstA`, `outA` là alpha chuẩn hoá 0…1; `srcC`, `dstC` là kênh
màu 0…255. Kết quả được làm tròn về byte.

Các trường hợp nhanh:

- `srcA = 0` → không làm gì.
- `srcA = 255` → ghi đè thẳng, không chia.
- `dstA = 0` → chép nguyên màu nguồn (kể cả alpha).

Ví dụ: đỏ 50% (`#ff000080`) trộn lên xanh đục (`#0000ffff`) cho
`rgb(128, 0, 127)` — đúng phần đóng góp 50/50 của hai màu.

### RNG có seed

`createRng(seed)` dùng **mulberry32**:

```ts
state = (state + 0x6d2b79f5) | 0;
let t = state;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
```

- Trạng thái 32 bit, cùng seed → cùng dãy số.
- Kết quả luôn nằm trong `[0, 1)`.
- Không dùng `Math.random()` trong `draw`/`update`; mọi vị trí ngẫu nhiên
  (sao, đom đóm, hoa, sỏi…) lấy từ RNG đã seed để cảnh tái lập được.

### Kiểm thử

`npm test` chạy Vitest với `tests/setup.ts` polyfill `ImageData` cho Node.
Các test hiện có:

- `tests/color.test.ts` — pack/unpack, parse hex, alpha, nội suy màu.
- `tests/framebuffer.test.ts` — clear, set/get, clip biên, source-over.
- `tests/rng.test.ts` — cùng seed, khác seed, khoảng giá trị, snapshot.
- `tests/vec2.test.ts` — `vec2`, `clamp`, `lerp`.

---

## #3 — Raster đường, tròn, ellipse

> Nguyệt cập nhật: DDA, Bresenham, Midpoint circle/ellipse, cách clip và chi phí.

## #4 — Tô vùng & mask

> Thụ cập nhật: scanline even-odd, stroke polygon, flood fill, `Mask`, phép
> hợp/giao/hiệu/dịch, `fillMask`, `outlineMask`.

## #6 — Biến đổi 2D

> Quang Anh cập nhật: ma trận column-major, nhân ma trận, nghịch đảo, cây `Node`.

## #7 — Font bitmap tiếng Việt

> Quang Anh cập nhật: bảng glyph, ghép dấu, cách vẽ chữ lên framebuffer.

## #8 — Camera & vòng lặp engine

> Bảo cập nhật: world → screen, zoom/pan, `requestAnimationFrame`, đo FPS,
> cache lớp tĩnh.
