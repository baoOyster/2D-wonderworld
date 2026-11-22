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

Người viết: Nguyệt · File `src/core/raster.ts` · Test `tests/raster.test.ts` · Demo `?demo=raster`

Mọi hàm nhận một bề mặt tối thiểu `RasterTarget` (`width`, `height`, `setPixel`, `blendPixel`); `Framebuffer` khớp interface này. Pixel ngoài biên bị bỏ qua (clip), bán kính âm không vẽ gì, không hàm nào throw.

Với màu trong suốt (alpha < 255), mỗi pixel chỉ được trộn **một lần**: hình đặc tô theo dòng quét (mỗi dòng đúng một lần); viền và nét dày có điểm trùng nên được lọc trùng trước khi trộn.

### DDA — `lineDDA`

Bước 1 pixel theo trục dài; trục còn lại cộng dần một số thực rồi làm tròn.

```
steps = max(|x1 - x0|, |y1 - y0|)
xi = (x1 - x0) / steps,  yi = (y1 - y0) / steps
x = x0, y = y0
lặp steps + 1 lần: plot(round(x), round(y)); x += xi; y += yi
```

- Độ phức tạp O(max(|dx|, |dy|)); mỗi bước có phép cộng và làm tròn số thực.
- Dùng cho: ván cầu, gợn sóng hồ, cọng cỏ.

### Bresenham — `lineBresenham`, `bresenhamPoints`

Chỉ dùng số nguyên. Khi |dy| ≤ |dx| (trục x là trục dài), tham số quyết định p cho biết điểm giữa hai ứng viên nằm trên hay dưới đường thẳng thật:

```
p0 = 2dy - dx
mỗi bước x += sx:
  p < 0  → giữ y,        p += 2dy
  p ≥ 0  → y += sy,      p += 2(dy - dx)
```

- |dy| > |dx|: đổi vai trò x và y. sx, sy = ±1 cho phép đi theo mọi hướng, nên phủ đủ 8 octant mà không phải đổi chỗ hai đầu mút.
- Vì sao số nguyên: p là sai số đã nhân 2dx, nên mọi phép tính là cộng/trừ số nguyên, không có làm tròn và không tích luỹ sai số như DDA.
- Độ phức tạp O(max(|dx|, |dy|)).
- Test kiểm tra: luôn tô hai đầu mút; đúng max(|dx|,|dy|)+1 pixel; liền mạch; trùng với DDA trên các đoạn không có điểm "đúng nửa pixel"; đảo chiều cho cùng kết quả.
- Dùng cho: hàng rào, cành cây, râu bướm, viền phiến đá lối đi, chế độ khung dây.

### Nét dày — `thickLine`

Đặt (stamp) một hình tròn đặc đường kính `width` tại mỗi điểm Bresenham. Đầu nét tròn, bề dày đều theo mọi hướng. Độ phức tạp O(L·w²), chấp nhận được vì w nhỏ (cành, cọc, lan can).

### Midpoint đường tròn — `circleMidpoint`, `circleSpans`

Chỉ tính 1/8 cung (0 ≤ x ≤ y), suy ra 7 phần còn lại nhờ đối xứng. d là giá trị hàm f(x, y) = x² + y² − r² tại điểm giữa hai ứng viên E (x+1, y) và SE (x+1, y−1):

```
x = 0, y = r, d = 1 - r
while x ≤ y:
  plot 8 điểm (±x, ±y), (±y, ±x)
  d < 0  → chọn E:   d += 2x + 3
  d ≥ 0  → chọn SE:  d += 2(x - y) + 5; y -= 1
  x += 1
```

- Hình đặc: từ 8 octant lấy nửa bề rộng lớn nhất ở mỗi độ lệch dọc, rồi tô mỗi dòng quét đúng một lần.
- Độ phức tạp: viền O(r), đặc O(r²).
- Dùng cho: mặt trời, mặt trăng, đốm nấm, nhụy hoa, đom đóm, quầng sáng (nhiều vòng đặc trong suốt).

### Midpoint elip — `ellipseMidpoint`, `ellipseSpans`

Tính 1/4 elip, suy ra 3 phần còn lại. Chia hai vùng theo độ dốc: vùng 1 bước theo x (độ dốc > −1, tức 2ry²x < 2rx²y), vùng 2 bước theo y. Tham số được nhân 4 để chỉ dùng số nguyên.

```
Vùng 1: x = 0, y = ry
  p1 = ry² - rx²·ry + rx²/4
  x += 1;  p1 < 0 → p1 += 2ry²x + ry²
           p1 ≥ 0 → y -= 1; p1 += 2ry²x - 2rx²y + ry²
Vùng 2:
  p2 = ry²(x + ½)² + rx²(y - 1)² - rx²ry²
  y -= 1;  p2 > 0 → p2 += rx² - 2rx²y
           p2 ≤ 0 → x += 1; p2 += 2ry²x - 2rx²y + rx²
```

- rx hoặc ry bằng 0 thì elip suy biến thành đoạn thẳng; bán kính rất nhỏ (rx = 1, ry = 60) vẫn kết thúc vì mỗi vòng lặp luôn tiến một bước theo x hoặc y.
- Hình đặc: tô mỗi dòng quét một lần theo nửa bề rộng lớn nhất của dòng đó.
- Độ phức tạp: viền O(rx + ry), đặc O(rx·ry).
- Dùng cho: mây, tán cây, hồ nước, mũ nấm, thân cá, cánh bướm.

### Dùng chung với người khác

- `circleSpans`, `ellipseSpans` trả về từng dòng quét của hình đặc. Thụ dùng để ghi hình tròn/elip vào `Mask` (#4) mà không phải viết lại thuật toán.
- `bresenhamPoints` trả về từng điểm của đoạn thẳng, dùng cho `strokePolygon` (#4).

## #4 — Tô vùng & mask

> Thụ cập nhật: scanline even-odd, stroke polygon, flood fill, `Mask`, phép
> hợp/giao/hiệu/dịch, `fillMask`, `outlineMask`.

## #6 — Biến đổi 2D

### Ma trận column-major `Mat3`

9 phần tử, mỗi cột 3 số (đúng SPEC):

```
| m0 m3 m6 |   x' = m0*x + m3*y + m6
| m1 m4 m7 |   y' = m1*x + m4*y + m7
| m2 m5 m8 |   affine: m2 = m5 = 0, m8 = 1
```

- `mat3Translate(x, y)` → cột cuối `(x, y, 1)`.
- `mat3Rotate(rad)` → `[[cos, -sin], [sin, cos]]` theo cột; hệ world có `y`
  hướng xuống nên góc dương xoay theo chiều kim đồng hồ trên màn hình.
- `mat3Scale(sx, sy)` → nhân hai phần tử chéo.

### Thứ tự nhân

`mat3Multiply(a, b)` = `a * b` — **áp dụng `b` trước rồi `a`**.
Ví dụ: `multiply(translate, rotate)` = dịch-xoay-quanh-tâm-gốc;
`multiply(multiply(T, R), S)` chính là `localMatrix()` của `Node` (`T * R * S`).

Nhân không giao hoán (có test chứng minh), nên thứ tự trong SPEC phải giữ nguyên.

### Nghịch đảo

`mat3Invert` dùng adjugate (phụ thức cửu triệu / định thức) trên ma trận
đại số 3×3 đọc theo hàng từ bộ nhớ column-major. `|det| < 1e-12` → ném lỗi
(ma trận suy biến, ví dụ `scale(0, 1)`). Test kiểm tra `invert(m) * m ≈ identity`
với translate/rotate/scale đồng nhất, không đồng nhất và `T*R*S` ghép; plus
round-trip điểm qua `m` rồi `invert(m)`.

### Cây `Node`

- `localMatrix()` = `T * R * S` (dịch → xoay → tỉ lệ quay tâm gốc cục bộ).
- `worldMatrix()` = `parent.worldMatrix() * localMatrix()`; đệ quy lên gốc.
- `add()` giữ `parent` trỏ sẵn nên không cần quét cây; có chặn vòng lặp
  (thử thêm ông vào con → lỗi) và tự gỡ khỏi cha cũ nếu `add` lại.

### Elip xoay

Không viết lại thuật toán midpoint cho elip xoay: `ellipsePolygon(cx, cy, rx,
ry, segments)` sample thành đa giác đều (mặc định 32 điểm) → `transformPoints`
bằng ma trận xoay/dịch → đưa vào `polygonFill`. Test quay elip 60° rồi kiểm
tra mọi điểm vẫn thỏa `(x/rx)² + (y/ry)² = 1` khi áp nghịch đảo ma trận.

### File

`src/core/mat3.ts`, `src/core/node.ts`; test `tests/mat3.test.ts`,
`tests/node.test.ts` (theo mẫu `tests/` hiện có — vitest config chỉ include
`tests/**/*.test.ts`).

## #7 — Font bitmap tiếng Việt

> Quang Anh cập nhật: bảng glyph, ghép dấu, cách vẽ chữ lên framebuffer.

## #8 — Camera & vòng lặp engine

> Bảo cập nhật: world → screen, zoom/pan, `requestAnimationFrame`, đo FPS,
> cache lớp tĩnh.
