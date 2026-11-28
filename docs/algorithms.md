# Thuật toán & cách cài đặt

Tài liệu này ghi lại thuật toán thật sự dùng trong code, chi phí và các quy ước
chung. Mỗi issue cập nhật phần tương ứng ngay trong PR của mình.

- [#2 — Framebuffer, màu, RNG](#2--framebuffer-màu-rng)
- [#32 — Presenter & trang demo](#32--presenter--trang-demo)
- [#3 — Raster đường, tròn, ellipse](#3--raster-đường-tròn-ellipse)
- [#4 — Tô vùng & mask](#4--tô-vùng--mask)
- [#6 — Biến đổi 2D](#6--biến-đổi-2d)
- [#7 — Font bitmap tiếng Việt](#7--font-bitmap-tiếng-việt)
- [#33 — Scene types & layers](#33--scene-types--layers)
- [#8 — Camera & vòng lặp engine](#8--camera--vòng-lặp-engine)
- [#34 — Renderer hoàn chỉnh](#34--renderer-hoàn-chỉnh)
- [#9 — Input, hit-test & World](#9--input-hit-test--world)
- [#5 — Palette ngày/đêm](#5--palette-ngàyđêm)

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

## #32 — Presenter & trang demo

Mã nguồn: `src/core/presenter.ts`, `src/demo/index.ts`, `src/demo/gradient.ts`
Trang chạy: `?demo=<tên>`, `?debug=1`

### Presenter

`Presenter` gắn với một canvas, đặt backing store đúng `FB_W × FB_H` (1920×1080
ở `RENDER_SCALE = 1.5`) và chỉ dùng **một** lệnh:

```ts
ctx.putImageData(fb.image, 0, 0);
```

`ImageData` do `Framebuffer` tạo một lần, dùng chung vùng nhớ với `fb.data`, nên
mỗi frame không cấp phát thêm. Không dùng `ctx.drawImage`, `fillRect`, `arc`…

CSS trong `style.css` giữ tỉ lệ 16:9:

```css
width: min(100vw, calc(100vh * 16 / 9));
height: min(100vh, calc(100vw * 9 / 16));
aspect-ratio: 16 / 9;
object-fit: contain;
```

Phần dư hai bên/dưới là letterbox. Không bật `image-rendering: pixelated`.

### Trang demo

`src/demo/index.ts` dùng `import.meta.glob(['./*.ts', '!./index.ts'])` để tự nạp
mọi file demo. Mỗi file export default:

```ts
(fb: Framebuffer, t: number) => void
```

`t` là thời gian mô phỏng (giây) do engine truyền. Thêm demo mới chỉ cần tạo
`src/demo/<tên>.ts`; không sửa `index.ts`. Tên file chính là `?demo=<tên>`.
Tên không tồn tại rơi về demo `gradient`.

`gradient.ts` vẽ nền bằng `fb.setPixel` theo từng dòng (mỗi dòng một màu, không
gọi `lerpColor` 2 triệu lần mỗi frame) và một ô vuông nhấp nháy theo `t`.

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

### Tổng quan

Mã nguồn: `src/core/mask.ts`, `src/core/fill.ts`
Kiểm thử: `tests/mask.test.ts`, `tests/fill.test.ts`
Demo: `src/demo/fill.ts`

Module cung cấp các thuật toán tô vùng và xử lý
Mask cho các vật thể 2D trong thế giới cổ tích.

### 1. Scanline Even-Odd – polygonFill

Thuật toán tô đa giác theo từng dòng quét ngang.

Các bước:
1. Xác định khoảng y của đa giác.
2. Bỏ qua các cạnh nằm ngang.
3. Tính giao điểm với từng cạnh còn lại.
4. Sử dụng khoảng half-open để tránh đếm
   trùng giao điểm tại đỉnh.
5. Sắp xếp giao điểm theo tọa độ x.
6. Ghép từng cặp giao điểm và tô các pixel.

Công thức giao điểm:

x = x1 + (ys - y1) * (x2 - x1) / (y2 - y1)

Trong đó ys = y + 0.5 là tọa độ dòng quét
đi qua tâm pixel.

Hỗ trợ đa giác lồi, lõm và tự cắt theo
quy tắc Even-Odd.

Độ phức tạp của cách quét trực tiếp:
O(H * E * log E + P)

H: số dòng quét.
E: số cạnh.
P: số pixel được tô.

### 2. Stroke Polygon

Sử dụng lineBresenham cho nét mảnh và
thickLine cho nét dày.

Các đỉnh được nối lần lượt và đỉnh cuối
được nối về đỉnh đầu để khép kín đa giác.

Đường viền không tô phần bên trong hình.

### 3. Flood Fill

Sử dụng Stack thay cho đệ quy để tránh
tràn ngăn xếp lời gọi hàm.

Mỗi pixel được xét theo 4 hướng:
trái, phải, trên và dưới.

Hai chế độ:
- target: tô các pixel có cùng màu gốc.
- boundary: tô đến khi gặp màu biên.

Sử dụng visited để tránh xử lý lặp.

maxPixels giới hạn số pixel được tô,
ngăn việc tô toàn bộ vùng hở ngoài ý muốn.

Độ phức tạp: O(W * H) trong trường hợp
xét toàn bộ framebuffer.

### 4. Mask

Mask lưu dữ liệu pixel bằng Uint8Array.

Mỗi phần tử biểu diễn:
- 0: pixel không thuộc vùng.
- 1: pixel thuộc vùng.

Các chức năng:
- maskPolygon: tạo vùng đa giác.
- maskEllipse: tạo vùng elip bằng Midpoint.
- maskUnion: hợp hai vùng.
- maskIntersect: giao hai vùng.
- maskSubtract: hiệu hai vùng.
- maskShift: dịch chuyển vùng.
- maskOutline: tạo đường viền bên trong.

### 5. Fill Mask và Outline Mask

fillMask:
- Duyệt vùng giới hạn bởi bounds().
- Chỉ tô các pixel thuộc Mask.
- Hỗ trợ clip bằng Mask cha.
- Ghi trực tiếp màu đục hoặc blend alpha.

outlineMask:
- Tạo đường viền bằng maskOutline.
- Hỗ trợ độ dày lớn hơn 1 pixel.
- Không tạo viền giả tại mép ảnh.

Hợp các Mask trước khi tạo viền giúp tránh
đường viền bên trong vùng chồng nhau.

### 6. So sánh Scanline và Flood Fill

| Tiêu chí | Scanline | Flood Fill |
|---|---|---|
| Đầu vào | Đỉnh đa giác | Pixel bắt đầu |
| Cách tô | Theo dòng ngang | Lan theo 4 hướng |
| Vùng thích hợp | Đa giác | Vùng liên thông |
| Dữ liệu hỗ trợ | Giao điểm | Stack, visited |
| Ứng dụng | Núi, nhà nấm | Hốc cây |

### 7. Kiểm thử

Sử dụng Vitest.

Các trường hợp:
- Hình vuông, tam giác.
- Đa giác lõm, ngôi sao tự cắt.
- Đa giác suy biến.
- Flood Fill trong vùng kín và vùng hở.
- Giới hạn maxPixels.
- Hợp, giao, hiệu và dịch Mask.
- Viền nhiều lớp, vùng chồng nhau.
- Clipping tại biên framebuffer.

Lệnh kiểm tra:

`npx vitest run tests/fill.test.ts`
`npx vitest run tests/mask.test.ts`
`npm test`
`npm run build`

### 8. Demo

`src/demo/fill.ts` minh họa:
- Núi được tô bằng Scanline.
- Ngôi sao theo quy tắc Even-Odd.
- Vùng tròn được tô bằng Flood Fill.
- So sánh viền riêng từng elip với
  viền chung của Mask hợp.

Demo được tích hợp vào `?demo=fill` qua trang demo của #32.


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

### Nguồn & giấy phép

Glyph cơ sở trích từ **Terminus Bold 8×16** — Copyright (C) 2020
Dimitar Toshkov Zhekov, phát hành theo **SIL Open Font License 1.1**
(ghi rõ trong header `font-data.ts`). Nhóm chỉ lấy glyph **không dấu**
(ASCII + `Đ`/`đ`) và hình các dấu sắc/huyền/ngã/mũ/breve; dấu hỏi, dấu nặng,
móc `ơ`/`ư` và **toàn bộ thuật toán ghép dấu** là của nhóm.

### Cấu trúc ô ký tự

- Ô (cell) **8×22**: glyph gốc **8×16** đặt ở hàng 4…19 (`BASE_TOP = 4`).
- Vùng trên (hàng 0…3) cho dấu; vùng dưới (hàng 20…21) cho dấu nặng của
  chữ có đuôi.
- Dấu được xếp theo **hàng nội dung thực** của chữ cơ sở (quét bitmap tìm
  `top`/`bottom`), không dùng hằng số cố định:
  - dấu phụ (mũ/breve) đặt trên `top`, cách 1 hàng trống; móc horn sát `top`;
  - dấu thanh đặt trên dấu phụ **cách 1 hàng trống**, hoặc trên `top` − 1 hàng
    trống nếu không có dấu phụ;
  - dấu nặng đặt dưới `bottom` + 1 hàng, độc lập với dấu phụ nên `ặ ậ ộ …`
    vừa có dấu trên vừa có dấu dưới.
- Khi `i` mang dấu thanh, dùng glyph **`ı` (i không chấm)** để dấu không chạm
  chấm.

Glyph gốc lưu dạng **16 byte** (mỗi hàng 1 byte, bit cao là cột trái) trong
`GLYPH_HEX`, giải mã một lần thành `Uint8Array`; test kiểm tra đúng 16 hàng,
dấu rộng 8 cột.

### Ghép dấu tiếng Việt

- `normalizeText` chuẩn hoá **NFC** để `e + ̂ + ́` → `ế`, khớp bảng dựng sẵn.
- 24 họ nguyên âm (12 thường + 12 hoa) × 6 biến thể (không dấu, sắc, huyền,
  hỏi, ngã, nặng) khai báo một lần trong `VOWEL_GROUPS`, duyệt để dựng
  `COMPOSED` (`Map<char, {base, tone, modifier}>`).
- `decompose(char)` tra `COMPOSED` trước, rồi tới `GLYPHS` (ASCII + `đ/Đ`).
  Không có → trả `null` để nơi vẽ dùng fallback `?`.
- Nhờ tách lớp, chỉ cần **glyph nguyên âm + dấu rời** là vẽ được cả chữ
  thường lẫn chữ hoa có dấu, thay vì vẽ tay từng ký tự dựng sẵn.

### Vẽ & đo

- `drawText(fb, text, x, y, color, opts)` vẽ từng pixel bằng `fb.blendPixel`
  (tôn trọng alpha), không dùng API Canvas. `x, y` là góc trên-trái ô đầu.
- `scale` nguyên ≥ 1: mỗi điểm ảnh font phóng thành khối `scale×scale`.
- `align`: `left | center | right` dịch `startX` theo bề rộng cả chuỗi;
  `spacing` cộng thêm pixel giữa các ô; `shadow` vẽ một lượt màu bóng lệch
  `1` pixel font (× scale) xuống phải **trước** lượt chữ chính.
- `measureText(text, scale, spacing)` = `{ width: (n·8 + (n−1)·spacing)·scale,
  height: 22·scale }` — **tính cả `spacing`**, nên căn giữa/phải khớp với
  `drawText` (đã sửa lỗi cũ bỏ qua `spacing`).

### Độ phức tạp

Tra glyph và ghép dấu `O(1)` mỗi ký tự (hash map). Vẽ `O(bật · scale²)` trên
mỗi ký tự, `bật` ≈ số pixel bật của glyph (khoảng 20–45 với 8×16). Đo `O(n)`.

### Thêm ký tự mới

- Ký tự thường: thêm một entry hex 32 ký tự (8×16) vào `GLYPH_HEX`.
- Nguyên âm có dấu: thêm vào họ tương ứng trong `VOWEL_GROUPS` (đúng thứ tự
  không dấu → sắc → huyền → hỏi → ngã → nặng) hoặc vào `GLYPH_HEX` nếu là
  glyph đặc biệt như `đ`/`Đ`.

### File

`src/core/font.ts`, `src/core/font-data.ts`; test `tests/font.test.ts`.

## #33 — Scene types & layers

Mã nguồn: `src/scene/types.ts`, `src/scene/layers.ts`.
Test: `tests/scene-types.test.ts`.

### Hợp đồng dùng chung

- `Env` là ảnh chụp trạng thái một khung (`time`, `dt`, `dayPhase`, `palette`,
  `camera`); `World` tạo lại mỗi khung và không cho vật thể giữ tham chiếu.
- `UiActions` (`toggleDayNight`, `select`, `getSelected`) tách vật thể khỏi DOM;
  `ClickContext = { env, ui }` là tham số của `SceneObject.onClick`.
- `SceneObject` gồm metadata để hiện panel (`id`, `name`, `description`,
  `algorithms`), `layer`, cờ `interactive`, cùng `update?`/`draw`/
  `hitPolygons?`/`onClick?`. `hitPolygons` trả polygon **world-space** và bắt
  buộc khi `interactive: true`.
- `WorldCallbacks` cho UI nhận sự kiện `onSelectionChange` / `onHoverChange`.
- Mọi phụ thuộc đều là **type-only** (`Palette`, `Camera`, `Renderer`, `Vec2`),
  nên chỉ cần `core/renderer-types.ts` (#8) mà không kéo class renderer thật,
  và không tạo vòng import với `scene/*`.

### Layer (z-order)

- `Layer` là object `as const` đúng SPEC #1; `World` sort tăng dần theo giá trị,
  cùng layer giữ thứ tự đăng ký.
- Thứ tự chính: nền trời (0–7) → đất/hồ/cá/đá/cầu (8–13) → cây/nhà/rào/lối
  (20–23) → hoa/cỏ/trang trí/thỏ/lá tiền cảnh (30–34) → bướm/đom đóm/chim
  (40–42) → overlay UI (100). Cá (10) nằm trên mặt hồ (9) nhưng dưới cầu (13).
- `LayerName` / `LayerValue` suy ra từ chính hằng, tránh gõ lại số.

### Kiểm chứng

- Test so khớp toàn bộ giá trị với SPEC, kiểm tra dãy tăng dần, không trùng và
  quan hệ z-order giữa các nhóm.
- Test dựng một `SceneObject` mẫu (kèm `UiActions`, `Renderer` giả) để chắc
  hợp đồng dùng được: `update`, `draw`, `hitPolygons`, `onClick`, callbacks.

## #9 — Input, hit-test & World

Mã nguồn: `src/core/hit-test.ts`, `src/core/input.ts`, `src/scene/world.ts`.
Test: `tests/hit-test.test.ts`, `tests/input.test.ts`, `tests/world.test.ts`.
Demo thử tay: `?demo=world`.

### Point-in-polygon & broad phase

- `pointInPolygon(p, poly)` dùng **ray casting even-odd**: bắn tia ngang sang
  phải, đếm số cạnh cắt; số lẻ là trong. Không dùng API hit-test của canvas.
- Kiểm tra **điểm trên biên trước** bằng tích chéo có chuẩn hoá sai số theo độ
  dài cạnh; nhờ vậy điểm trên cạnh/đỉnh luôn được coi là trong, tránh lỗi khi
  tia đi đúng qua đỉnh.
- `boundsOf(polygons)` gộp AABB mọi đỉnh; `boundsContain` kiểm tra nhanh. Khi
  pick: sort layer tăng dần, duyệt **ngược** (vật vẽ sau nằm trên), bỏ vật
  không `interactive`, thử AABB trước rồi mới ray cast từng polygon.

### Quy đổi toạ độ & camera

- `canvasPointToLogical(point, rect, canvasW, canvasH)` bù CSS scale/letterbox:
  `x = (clientX − rect.left) / rect.width · canvasWidth` (tương tự y), cho ra
  pixel canvas (backing store) mà `Camera.screenToWorld` chờ đợi.
- Camera đã gồm `RENDER_SCALE`; world → screen = `RS · (zoom·world + pan)`.
- Zoom quanh con trỏ: giữ nguyên điểm world dưới chuột bằng
  `pan' = screen/RS − zoom' · worldUnderCursor`, rồi clamp pan trong world.
- Pan: kéo chuột giữa/phải hoặc `Space` + kéo trái;
  `camera.pan += Δscreen / RENDER_SCALE` (camera tự clamp), không lộ ngoài world.

### Input (`attachInput`)

- `pointerdown/up`: nhấn-thả trái trong bán kính 4 px là click → pick + `onClick`;
  click nền → `select(null)`.
- `pointermove`: hover + đổi cursor `pointer`/`default`; khi pan thì cộng delta.
- `wheel` (`passive: false`): `factor = exp(−deltaY · 0.0015)`, zoom quanh con trỏ.
- Phím: `N` ngày/đêm, `+`/`-` zoom quanh tâm, `0` reset, `Esc` bỏ chọn; bỏ qua
  khi focus ở `input`/`textarea`/`contenteditable`.
- Trả hàm cleanup gỡ toàn bộ listener.

### World

- `World(camera, objects, theme, callbacks?)` sort theo `layer` **một lần**, giữ
  ổn định thứ tự cùng layer.
- `update`: `theme.update` → tạo `Env` mới (`time`, `dt`, `dayPhase`, `palette`,
  `camera`) → gọi `update` từng vật. `draw` vẽ theo đúng thứ tự đã sort.
- `pickAt/pickFromScreen`: point-in-polygon như trên; `hoverFromScreen` cập nhật
  hover; `clickFromScreen` chọn + gọi `onClick`.
- Implement `UiActions` (`toggleDayNight`, `select`, `getSelected`) và gọi
  `WorldCallbacks.onSelectionChange/onHoverChange` **chỉ khi trạng thái đổi**.
- `drawOverlay`: tạm vẽ viền polygon vật đang chọn bằng `palette.selection`
  (hiệu ứng đầy đủ ở #25).

## #24 — Info panel & toolbar

Mã nguồn: `src/ui/panel.ts`, `src/ui/toolbar.ts`, `src/ui/index.ts`,
`src/ui/labels.ts`, `src/ui/ui.css`.
Test: `tests/ui-labels.test.ts`, `tests/ui-dom.test.ts` (nhãn/zoom, panel & toolbar
với DOM stub tối giản; vẫn nên xem trực tiếp `?demo=world`).
Demo thử tay: `?demo=world`.

### Panel thông tin

- `createInfoPanel(root, { onClose })` dựng `aside` với tiêu đề, mô tả và danh
  sách chip thuật toán. Nội dung đặt qua `textContent`, không `innerHTML`.
- `setObject(obj | null)` chỉ vẽ lại khi vật đổi; `null` ẩn panel. Đóng bằng nút
  `×` hoặc `Esc` → `onClose` (lớp gọi `world.select(null)`).
- `aria-live="polite"`, tiêu đề gắn `aria-labelledby`, nút đóng có `aria-label`.
  Panel `pointer-events: auto` còn shell `none`, nên click ngoài panel vẫn xuống
  canvas; dưới 720 px chuyển thành bottom sheet cao tối đa 40vh.

### Toolbar

- Nút `+`/`−` gọi `camera.zoomAt(tâm framebuffer, 1.2)`; "Đặt lại" gọi
  `camera.reset()`; nút ngày/đêm gọi `world.toggleDayNight()`.
- `sync()` đọc lại `camera.zoom` và `world.environment.dayPhase` để nhãn zoom &
  Ngày/Đêm luôn khớp, kể cả khi đổi bằng chuột/phím tắt (`N`, `+`, `-`, `0`).
- Có `role="toolbar"`, `aria-label`, `aria-pressed` cho nút ngày/đêm, và dòng gợi
  ý phím tắt.

### Gắn UI

- `mountUi(container, engine, world)` tạo shell + toolbar + panel, chạy một vòng
  `requestAnimationFrame` đồng bộ lựa chọn/nhãn; trả hàm cleanup huỷ vòng lặp và
  gỡ DOM/listener.
- `UiEngine` chỉ cần `{ camera, framebuffer }`; `main.ts` sẽ gọi một dòng ở #26.

## #8 — Camera & vòng lặp engine

Mã nguồn: `src/core/camera.ts`, `src/core/engine.ts`, `src/core/presenter.ts`
Test: `tests/camera.test.ts`, `tests/engine.test.ts` (renderer giả vẽ bằng
`setPixel`, đồng hồ giả điều khiển rAF + `performance.now` nên tất định)

### Ma trận camera

Camera chỉ tịnh tiến + phóng đều, **không xoay**:

```
screen = scale(RENDER_SCALE) · translate(panX, panY) · scale(zoom) · world
```

Với `RENDER_SCALE = 1.5`, một điểm world `(x, y)` thành:

```
screenX = 1.5 · (zoom · x + panX)
screenY = 1.5 · (zoom · y + panY)
```

Vì không có thành phần xoay, đường thẳng vẫn là đường thẳng và hình tròn/elip
chỉ cần nhân bán kính với `RENDER_SCALE · zoom`; không phải viết lại thuật toán
raster cho hệ toạ độ màn hình.

Ma trận được cache và chỉ tính lại khi `zoom`, `panX` hoặc `panY` đổi. Các
setter đều kẹp giá trị:

- `zoom ∈ [1, 3]`.
- `panX ∈ [WORLD_W · (1 − zoom), 0]`, `panY ∈ [WORLD_H · (1 − zoom), 0]`.

Suy từ điều kiện khung nhìn không lộ ngoài world: mép trái màn hình ứng với
world `−panX / zoom ≥ 0`, mép phải `(WORLD_W − panX) / zoom ≤ WORLD_W`.

### `zoomAt(screenPoint, factor)`

1. Lưu điểm world dưới con trỏ: `p = screenToWorld(screenPoint)`.
2. Tính `zoom' = clamp(zoom · factor, 1, 3)`.
3. Giải pan để `p` vẫn nằm dưới con trỏ:

```
pan' = screenPoint / RENDER_SCALE − zoom' · p
```

4. Kẹp pan. Nhờ bước 1–3, zoom quanh con trỏ không bị trượt; ở sát biên pan bị
   kẹp nên điểm có thể xê dịch một chút, đúng quy ước không lộ ngoài world.

`screenToWorld` tính trực tiếp `(screen / RENDER_SCALE − pan) / zoom`;
test kiểm tra nó trùng với nghịch đảo ma trận và round-trip qua `worldToScreen`.

### Vòng lặp engine

- `requestAnimationFrame`, bước cập nhật cố định `1/60` giây.
- Accumulator nhận `min(frameDt, 250ms)`; tối đa **5 update/frame**. Nếu chạm
  giới hạn (tab vừa quay lại) thì bỏ phần dư để không dồn vô hạn.
- FPS đo bằng EMA hệ số 0.1; `renderTime` (ms) cũng làm mượt tương tự.
- Mỗi frame: `world.begin(clearColor)` → `scene.draw(world)` →
  `scene.drawOverlay?.(overlay)` → `Presenter.present(fb)`.
- `overlay` là renderer thứ hai dùng camera `scale(RENDER_SCALE)` (zoom 1, pan
  0), nên chữ/viền UI không bị phóng theo camera thế giới.
- Engine không import bản cài đặt `renderer.ts`; nhận `makeRenderer(fb, camera,
  overlay)` từ ngoài, nhờ vậy test có thể dùng renderer giả.

Chi phí mỗi frame chủ yếu là `putImageData` (1920×1080) và các lượt tô toàn
màn hình; clear + vẽ cảnh trùng nhau sẽ được tối ưu bằng cache lớp tĩnh ở #26.

---

## #34 — Renderer hoàn chỉnh

Mã nguồn: `src/core/renderer.ts`, `src/core/renderer-types.ts`
Demo: `?demo=primitives`

`Renderer` cài đặt `interface Renderer` của SPEC #1 mục 3.6. Mọi tham số là toạ
độ/bán kính/độ dày **world**; renderer biến đổi qua `camera` rồi gọi:

| Phương thức | Cài đặt bên dưới |
|---|---|
| `line` / `polyline` | Bresenham hoặc DDA; nét dày dùng `thickLine` |
| `circle` | Midpoint circle, bán kính `r · RENDER_SCALE · zoom` |
| `ellipse` | Midpoint ellipse |
| `polygon` | Scanline fill, hoặc `strokePolygon` khi `filled = false` |
| `floodFill` | Flood fill 4 hướng, toạ độ điểm gieo đổi qua camera |
| `text` | Font bitmap; scale pixel = `max(2, round(scale · RENDER_SCALE · zoom))` |
| `mask` | Cấp `WorldMask` từ pool, xoá sạch |
| `shape` | Tô 3 tông + viền + clip trên một mask |

### Mask theo toạ độ world

`WorldMask` bọc một `Mask` kích thước framebuffer và giữ camera:

- `polygon(pts)`: biến đổi đỉnh rồi `maskPolygon`.
- `ellipse(cx, cy, rx, ry)` / `circle`: đổi tâm và nhân bán kính với
  `RENDER_SCALE · zoom` rồi `maskEllipse`.
- `union` / `intersect` / `subtract`: OR / AND / AND-NOT trực tiếp trên
  `Uint8Array`.
- `clear`, `isEmpty`.

`Renderer.mask()` lấy mask từ pool theo thứ tự, `begin()` đặt lại con trỏ pool.
Mỗi mask chỉ dùng trong khung hiện tại; khung sau bộ đệm được xoá và tái sử
dụng nên không cấp phát `Uint8Array` mới mỗi frame.

### `shape()` — 3 tông, viền, clipping

Giả sử mask `m`:

- **Nền + tối + sáng**: một lượt quét hộp bao, mỗi pixel thuộc `m` chọn đúng
  một màu. Tối nếu pixel lệch `(+s, −s)` không thuộc `m`, tức
  `m − shift(m, +s, −s)`; ngược lại sáng nếu pixel lệch `(−h, +h)` không thuộc
  `m`; ngược lại màu nền. Renderer kiểm tra trực tiếp `m.data`, không tạo mask
  phụ và không quét ba lần.
- **Viền**: BFS từ biên vào trong. Pixel thuộc `m` có hàng xóm 4 hướng nằm ngoài
  `m` là lớp 1; hàng xóm kề nó là lớp 2… Dừng ở
  `outlineWidth · RENDER_SCALE · zoom` lớp (tối thiểu 1px, tối đa 255). Hai mảng
  đệm `Uint8Array` (độ sâu) và `Int32Array` (hàng đợi) được dùng lại, không cấp
  phát mask và không phụ thuộc diện tích hộp bao. Mép framebuffer được coi là
  "trong mask" nên vật bị khung cắt không có viền giả dọc mép ảnh. Cả lượt tìm
  lớp biên lẫn lượt mở rộng BFS đều **viết thẳng 4 hàng xóm** (không duyệt mảng
  cặp `[dx, dy]`), nhờ vậy mỗi pixel không cấp phát iterator — đo trên cảnh demo
  `?demo=primitives` (tán cây 5 elip, 1920×1080) lượt `shape()` có viền nhanh
  khoảng 3,7 lần so với bản duyệt mảng (13,1 ms → 3,5 ms).
- **Clip**: mọi lượt tô kiểm tra trực tiếp `clip.data` tại cùng chỉ số pixel.

Viền được vẽ **sau** tông tối/sáng nên đường bao luôn sạch. Vì viền tính trên
mask đã hợp, tán cây ghép nhiều elip chỉ có một viền ngoài, không lộ viền ở mối
nối (test `tests/renderer.test.ts`).

### Demo `?demo=primitives`

Vẽ cùng một cảnh hai lần: toàn cảnh camera 1× và khung 960×540 pixel (vùng
320×180 world) qua camera 2×, đặt cạnh nhau. Demo dùng lưới toạ độ, line
DDA/Bresenham, nét dày, tròn, elip, đa giác, chữ tiếng Việt, và `mask()` +
`shape()` cho tán cây, mũ nấm có đốm bị clip. Khung 2× chứng minh camera/renderer
biến đổi đúng mà không cần API Canvas.

Phần cảnh tĩnh (lưới, núi, đất, lối đi, mây, cây, nhà nấm, hoa, nhãn) vẽ **một
lần** vào một framebuffer riêng rồi mỗi frame chép sang; chỉ tia nắng quay theo
`t` được vẽ lại — đúng cách #26 sẽ cache lớp nền. Nhờ vậy frame ổn định ở
1920×1080 (đo trên Chrome headless / Apple M4: 0,65 ms cho phần vẽ lại, 79–90
FPS; chép lớp tĩnh 8 MB chỉ tốn ~0,6 ms vì là một lệnh `data.set`). Vẽ lại toàn
bộ cảnh mỗi frame tốn ~21 ms nên không đạt 60 FPS — con số này là lý do #26 bắt
buộc cache lớp tĩnh.

### Chi phí

- Line/circle/ellipse/polygon: như thuật toán gốc (#3, #4), chỉ thêm phép biến
  đổi toạ độ O(1) mỗi đỉnh/điểm.
- Mask: O(số pixel của hộp bao) cho mỗi hình; pool giữ bộ nhớ ổn định.
- Viền: quét hộp bao một lượt để tìm lớp biên + BFS tối đa `width` lớp, chi phí
  O(area + số pixel viền); hai mảng tạm tái sử dụng.
- 3 tông: chung lượt quét với nền, không cấp phát.

Số đo `?demo=primitives` (1920×1080, Chrome headless, Apple M4): `clear` 2,7 ms;
sàn + núi + lối đi ~5 ms; tán cây 5 elip `mask()`+`shape()` 3,5 ms; mũ nấm
`shape()` 1,5 ms; `present` (`putImageData`) 0,7 ms.

Kiểm thử: `tests/renderer.test.ts` (biến đổi toạ độ, bán kính, một viền ngoài,
clip, 3 tông, chữ) và `tests/camera.test.ts`.

---

## #5 — Palette ngày/đêm

`src/core/palette.ts` định nghĩa đúng 63 key của SPEC #1 trong hai bảng `DAY`
và `NIGHT`. Màu dùng packed `RGBA` (`0xRRGGBBAA`); `mixPalette` nội suy từng
kênh qua `lerpColor`, với `t` được kẹp vào `[0, 1]`. Palette ngày dùng xanh trời,
xanh lá và nâu ấm. Palette đêm chuyển nền sang xanh lam/tím trầm, đồng thời giữ
cửa sổ, trăng, sao và đom đóm sáng để silhouette dễ đọc. Viền dùng `ink` và
`inkSoft` theo gợi ý SPEC.

`DayNightCycle` giữ progress tuyến tính 1,4 giây và chuyển phase qua smoothstep
`t²(3−2t)`. Gọi `toggle()` đảo hướng ngay tại phase hiện tại; `palette()` trả về
object cache do `update(dt)` cập nhật, không cấp phát trong `draw`.

Mọi object chỉ dùng màu từ `env.palette` (có thể biến đổi bằng `withAlpha` hoặc
`lerpColor`); không hardcode màu cảnh và không tự chọn màu bằng nhánh ngày/đêm.

| Vai trò | Ngày | Đêm |
|---|---|---|
| Trời (`skyTop`) | `#86bff8` | `#03245b` |
| Núi xa (`mountainFar`) | `#77b3db` | `#0d2e69` |
| Nấm (`mushroomCap`) | `#c3574b` | `#5b2034` |
| Cửa sổ (`window`) | `#c48f5d` | `#f6be61` |
| Nước (`waterShallow`) | `#7eb5c2` | `#26426c` |
| Viền (`ink`) | `#34261f` | `#0a0a16` |

## #14 — Cây cổ thụ

File: `src/scene/midground/tree.ts`, demo `src/demo/midground.ts` (`?demo=midground`), test `tests/tree.test.ts`.

### Bộ phận và thuật toán

| Bộ phận | Hình học | Thuật toán |
|---|---|---|
| Thân | 1 đa giác 18 đỉnh, loe dần xuống gốc, chẻ thành 2 nhánh ở trên | Scanline polygon fill (even-odd) |
| Rễ (8) và cành lớn (6) | Đa giác thuôn dọc theo đường gấp khúc (`taperedPolygon`); rễ đối xứng hai bên trục thân | Scanline polygon fill |
| Vân xoắn (6) | Dải đa giác thuôn chạy chéo trên thân và lưng rễ | Scanline polygon fill |
| Cành con | Đoạn thẳng rộng 3–5 px, đầu cành chui vào một cụm tán | Nét dày `thickLine` (đóng dấu hình tròn dọc Bresenham) |
| Vân gỗ | Đường gấp khúc 1 px | Bresenham |
| Tán (11 cụm) | Mỗi cụm là hợp của 9 hình tròn (1 tâm + 8 thuỳ quanh viền, lệch ngẫu nhiên theo seed) | Midpoint circle, hợp mask |
| Chùm lá sáng, bụi rêu (7) | Hợp vài hình tròn; mọi bụi rêu gộp một mask | Midpoint circle, hợp mask |
| Dây leo quấn thân | Đường xoắn ốc chiếu phẳng, lá giọt nước (xem dưới) | Nét dày, scanline polygon fill, hợp mask |
| Hốc cây | Đa giác 8 đỉnh cao ~62 | Vẽ viền rồi **flood fill** từ điểm gieo bên trong |
| Quầng sáng, tia phép bay ra từ hốc (đêm) | Hình tròn trong suốt; tia phép là chữ thập 2 đoạn | Midpoint circle + alpha blending, Bresenham |

### Gộp khối, 3 tông và viền

Theo `docs/style-guide.md`: thân, 8 rễ và 2 nhánh đứng yên được thêm vào **cùng một mask**, nên chỗ rễ và nhánh mọc ra khỏi thân không có đường viền thừa. Mask được tô một lần:

1. nền `trunk`;
2. tông tối `trunkDark` ở mép dưới-trái: `m − shift(m, +2k, −2k)`;
3. tông sáng `trunkLight` ở mép trên-phải (hướng mặt trời): `m − shift(m, −k, +k)`;
4. viền `ink` 2 px: biên trong của mask (`maskOutline`).

Bốn cành lay cùng tán là một khối riêng, vẽ ngay trước thân; chỗ nối nằm dưới tán phía trước nên không thấy viền.

Mỗi cụm tán là một mask riêng, tô 3 tông `canopyDark` / `canopy` / `canopyLight` rồi viền, sau đó thêm 3–4 chùm lá sáng lệch về phía nắng. 6 cụm phía sau vẽ trước thân, tối hơn một bậc; 5 cụm phía trước vẽ sau, chồng lên lớp sau nên tán liền một khối.

Ở `taperedPolygon`, pháp tuyến tại mỗi đỉnh là pháp tuyến của vectơ nối đỉnh trước và đỉnh sau. Nửa độ rộng giảm tuyến tính từ `w0/2` tới `w1/2`.

### Flood fill hốc cây

1. Vẽ một vành gỗ tối quanh miệng hốc, rồi vẽ viền hốc (đa giác, nét `ink`).
2. Gieo tại `HOLLOW_SEED = (250, 332)`: tô mọi pixel liền nhau (4 hướng) cùng màu với điểm gieo, dừng ở viền.
3. Màu tô đổi theo `dayPhase`: ban ngày gần như đen, ban đêm chuyển dần sang màu đèn `window` (hốc phát sáng phép thuật).
4. Ban đêm vẽ thêm 4 vòng tròn đồng tâm alpha 0,06–0,14; các vòng chồng lên nhau nên càng gần tâm càng sáng.

### Ánh sáng ban đêm

- **Tia phép bay ra từ hốc (10 tia):** tia `i` có pha `φ = (t/4 + i/10) mod 1`, bay theo hướng chếch lên, dịch ngang theo sin, độ sáng `sin(πφ)`. Hết vòng thì quay lại miệng hốc. Vị trí chỉ phụ thuộc thời gian nên không cần lưu trạng thái. Mỗi tia là ngôi sao 4 cánh (2 đoạn Bresenham) kèm quầng tròn mờ.
- Cây không vẽ đom đóm: bầy đom đóm là vật thể riêng của #23.

### Biến đổi gộp

```
root    T(275, 470)                    thân, rễ, nhánh trái: đứng yên
└─ crown  T(25, −360) · R(θ)           điểm gắn cành (300, 110)
   └─ cluster[i]  T(cxᵢ − 300, cyᵢ − 110) · R(θᵢ)
```

- `θ = 0,01 · sin(0,6 t)`, `θᵢ = 0,005 · sin(0,96 t + 0,7 i)`, làm tròn theo bước `0,0005 rad` (đầu cành xa nhất dời dưới 0,5 px mỗi bước).
- Hình học local tính một lần trong constructor; mỗi frame chỉ đổi góc xoay rồi nhân ma trận `world = parent · local`.
- Tâm mỗi cụm lấy từ ma trận world của Node cụm. Thuỳ là hình tròn và góc lay rất nhỏ, nên thuỳ chỉ tịnh tiến theo tâm cụm.
- `hitPolygons()` trả thân, rễ, cành (đã biến đổi) và một elip bao mỗi cụm tán, nên nhấn vào thân hay tán đều chọn được cây.

### Dây leo quấn thân

Vẽ theo ảnh mẫu `B11_day_leo.jpg`: một dây mềm màu lá quấn xoắn ốc quanh thân, lá hình giọt nước mọc so le.

- **Đường trục (helix chiếu phẳng).** Góc quay tăng đều theo chiều cao: `φ(y) = π + 2π(332 − y)/pitch`. Tại độ cao `y`, với `mid`, `half` là tâm và nửa bề rộng thân:
  `x = mid + (half + 4)·sin φ`, `y' = y + 0,28·half·cos φ` (cung trước võng xuống như nhìn từ trên).
- **Mặt trước/sau.** Dây ở mặt trước khi `cos φ > −0,25`; chỉ các cung này được vẽ, cung sau bị thân che. Ngưỡng hơi âm để ở hai mép, dây còn lộ ra một chút như đang vòng ra sau.
- **Chọn bước xoắn.** Hai điều kiện: `φ(486) = −π/2` (dây mọc từ đất ở mép trái thân) và `φ(332) = π` (đoạn ngang hốc cây nằm giữa mặt sau). Khoảng 154 px ứng với ¾ vòng nên `pitch ≈ 205`. Nhờ vậy dây tự tránh hốc mà vẫn cong đều, không phải bẻ dây.
- **Chân dây.** Một móc Bézier bậc 2 nối từ mặt đất vào đầu cung dưới cùng.
- **Lá.** Cách đều 38 px dọc cung, so le hai bên, chĩa chéo lên; thêm một lá ở chỗ dây vòng ra sau mép thân. Lá nào chĩa vào hốc thì bỏ. Mọi lá gộp một mask, tô 3 tông `leaf`/`canopyLight` rồi viền; cuống là nét dày, gân là Bresenham.
- **Thứ tự vẽ.** Sau vân gỗ, trước bụi rêu và hốc cây.

### Hiệu năng

Renderer thật (#34) cấp mask full-frame cho mỗi khối, nên số mask quyết định tốc độ. Cây gộp còn 27 mask mỗi khung (vân xoắn, rêu, chùm lá sáng, lá dây leo mỗi loại một mask; trước là 64). Góc lay được làm tròn theo bước `0,0005 rad` để nhiều khung liên tiếp có hình y hệt nhau. Cả cảnh giữa (cây, nhà, rào, lối đi, hoa cỏ) vẽ khoảng 95–120 ms một khung ở 1920×1080 khi chạy Node; cần cache raster theo hình dạng khối trong renderer (đề xuất cho #26) mới đạt 60 fps.

## #15 — Nhà nấm

File: `src/scene/midground/mushroom-house.ts`, test `tests/midground.test.ts`.

### Bộ phận và thuật toán

| Bộ phận | Hình học | Thuật toán |
|---|---|---|
| Mũ nấm | Elip `(430, 322, 158, 112)` trừ nửa dưới, hợp với vành elip dẹt | Mask: elip, trừ, hợp; tô 3 tông + viền |
| Đốm mũ (9) | Hình tròn, chỉ giữ phần nằm trong mũ | Midpoint circle, **clipping** bằng mask mũ |
| Phiến dưới mũ | Elip dẹt | Midpoint ellipse |
| Thân nhà | Đa giác loe chân; bóng mũ đổ lên đỉnh thân | Scanline polygon fill, clipping |
| Cửa vòm | Chữ nhật + nửa tròn; ván, bản lề, vòng gõ | Polygon fill, Bresenham, midpoint circle |
| Cửa sổ (2) | Tròn, khung chữ thập | Midpoint circle, nét dày |
| Ống khói, đèn treo | Đa giác; đèn đung đưa quanh móc | Polygon fill, biến đổi quay |
| Gò đất, bậc thềm (4), búi cỏ | Hình thang, chữ nhật bo góc, tam giác | Scanline polygon fill, gộp mask |
| Khói (ban ngày) | 7 cụm tròn mờ dần | Midpoint circle + alpha blending |
| Ánh đèn (ban đêm) | Vòng tròn đồng tâm alpha thấp; vệt sáng từ cửa | Alpha blending |

### Cây Node

```
root  T(448, 482)                 cả nhà (đã hạ 30 và dịch phải 18)
├─ cap  T(…)                      mũ, đốm, phiến
│  └─ capWindow
├─ doorHinge  T(465, 455) · S(sx, 1)   cánh cửa co ngang về bản lề khi mở
├─ stemWindow
└─ lantern  R(0,05·sin 1,3t)      đèn lay quanh móc
```

### Cửa mở

`onClick()` đổi đích mở/đóng. Mỗi khung, độ mở tiến về đích một bước `dt / 0,6`, nên cửa mở xong trong 0,6 giây dù khung dài hay ngắn. Độ mở qua smoothstep `e = t²(3 − 2t)` rồi đặt `scaleX = 1 − 0,82·e` cho Node bản lề: nhìn từ trước, cánh cửa quay quanh bản lề trông như co ngang. Phía sau cánh cửa là lòng nhà tối (ban ngày) hoặc sáng đèn (ban đêm).

### Khói

Cụm `i` có pha `φ = (t/4,2 + i/7) mod 1`: bay lên 96 px, trôi phải 34 px theo gió, lắc ngang theo sin, bán kính `5 + 13φ`, alpha `0,8·min(1, 6φ)·(1 − φ)`. Hết vòng thì quay lại miệng ống khói. Khói nhân thêm `(1 − dayPhase)` nên tắt dần khi về đêm.

### Khác `layout.md`

- Cả nhà **hạ 30 px** (`HOUSE_DROP`) để chân nhà chạm đất, và **dịch phải 18 px** (`HOUSE_SHIFT`) để không che hốc cây.
- Thêm gò đất hình thang dưới chân nhà, búi cỏ và 4 bậc thềm bằng nhau (rộng 66, lệch đều 11 px) xuống tới chân gò.
- Ống khói cao hơn (đỉnh `y = 184`).
- Kính cửa sổ ban ngày pha `windowGlow` với `window` để không trùng màu trời.

## #16 — Hàng rào và lối đi

File: `src/scene/midground/fence.ts`, `src/scene/midground/path.ts`, test `tests/midground.test.ts`.

### Hàng rào

- Hai đoạn đứng trên gò đất, chân rào ở `y = 510` (giữa mặt trên và chân gò): đoạn trái 6 trụ trước thân nhà, dừng trước cửa; đoạn phải 2 trụ giữa bậc thềm cuối và mép phải gò.
- **Biến đổi lặp:** mọi trụ dùng chung một hình mẫu (đa giác 5 đỉnh, đầu vát nhọn, cao 1). Mỗi trụ là một Node `T(xᵢ, yᵢ) · S(1, hᵢ)`, `hᵢ = 38·(0,94 + 0,06·sin(2,3i + x₀))`, nên trụ cao thấp khác nhau một chút mà không cần random.
- Thanh ngang (2 thanh): nét dày rộng 5, mép trên/dưới kẻ bằng Bresenham; vẽ trước trụ để trụ che mối nối.
- Mọi trụ một đoạn gộp một mask, tô `fence`/`fenceDark` + viền; chân trụ có bóng elip alpha.
- **Khác `layout.md`:** đoạn phải còn 2 trụ (layout ghi `x = 556…636`) để không lòi ra ngoài gò; hai đoạn cùng độ cao.

### Lối đi

- **Đường giữa** là Bézier bậc 3 từ `PATH_START` (chân gò) qua `C1`, `C2` tới `PATH_END = (820, 860)`. Điểm cuối nằm hẳn dưới khung hình nên cả mép cuối bị khung cắt.
- **Chỗ nối** tính từ hằng số của nhà và rào, không gõ tay: mép trái ở giữa đầu rào trái và bậc thềm cuối, mép phải ở giữa bậc thềm cuối và đầu rào phải. Lối đi rộng hơn bậc thềm nhưng không lấn qua rào; dời nhà hay rào thì lối đi tự canh lại.
- **Đa giác:** 28 mẫu dọc đường giữa, mỗi mẫu dịch theo pháp tuyến `±w(t)/2`, `w(t)` tăng tuyến tính 107 → 290. Mẫu đầu dùng pháp tuyến nằm ngang nên mép trên nằm đúng trên chân gò. Mép trái gợn nhẹ `±7%` theo sin. Mép phải là một đoạn thẳng từ đầu rào phải tới điểm mép cuối, để không cong gắt ở cuối.
- Tô một mask 3 tông `pathStone`/`pathStoneDark` + viền; 6 phiến đá elip đặt dọc đường giữa theo RNG seed cố định, gộp một mask.

## #17 — Hoa và cỏ

File: `src/scene/foreground/flowers.ts`, `grass.ts`, `ground.ts`, `meadow.ts`, test `tests/foreground.test.ts`.

### Hoa (29 bông)

- Cụm trái 9 bông trong vùng `x = 165…275, y = 570…605` của layout (chia ô theo x rồi lệch ngẫu nhiên trong ô), 4 bông ven mép trái lối đi, 16 bông rải trên cỏ trống (cách nhau ≥ 34 px).
- Mỗi bông: thân là Bézier bậc 2 lấy mẫu thành polyline (viền `ink` 4, lõi `stem` 2); 1–2 lá là elip xoay (polygon fill); 5–6 cánh là **midpoint circle** xếp đều quanh nhụy, mép cánh chạm bán kính bông (8–18 px); nhụy tròn.
- **8 màu cánh**, đều suy ra từ palette: 4 màu hoa, cam (đỏ + vàng), hồng (đỏ + `mushroomSpot`), hồng tím (đỏ + tím), trắng kem (`mushroomSpot`). Màu (trừ trắng) được tăng bão hoà: mỗi kênh `l + (c − l)·k`, `l` là trung bình 3 kênh, `k = 1,45` ban ngày, giảm còn 1,15 ban đêm.
- **Lay:** mỗi bông là một Node đặt tại gốc, `R(aᵢ·sin(1,2t + φᵢ))` với `aᵢ ∈ [0,02; 0,04]` và pha riêng, nên không có cảnh "cả vườn gật đầu".

### Cỏ (340 lá)

- Lưới 10 × 14 ô trên phần đất trái (`x = 0…700, y = 480…715`), thử ô theo thứ tự ngẫu nhiên, mỗi ô một khóm lệch ngẫu nhiên trong ô (jittered grid): cỏ rải khắp mà không thẳng hàng. Bỏ ô rơi vào lối đi, gò đất, vùng rễ, phần đất chừa, và ô ngay trước một bông mà cao tới đầu hoa. Thêm 4 bụi ở chân rễ cây.
- Mỗi khóm 6 lá xoè hình quạt. Lá là đa giác thon nhọn dọc Bézier bậc 2 (polygon fill + viền).
- **Chiều sâu:** hệ số `0,55 → 1,2` theo `y` (xa nhỏ, gần to); màu pha từ tối sang `canopyLight` theo cùng hệ số.
- **Lay theo khóm:** mỗi khóm một Node, quay quanh gốc như hoa, pha riêng.

### Vẽ theo độ sâu

`Meadow` gộp hoa và cỏ thành một vật thể (layer `FLOWER`) và vẽ theo **thuật toán hoạ sĩ**: sắp mọi bông và khóm theo `y` gốc tăng dần, vật xa (gốc cao hơn trong hình) vẽ trước. Nhờ vậy vật mọc phía trên không che vật mọc phía dưới, và cỏ có thể mọc xen giữa các bông.

### Vùng đất trống (`ground.ts`)

`isFreeGround(x, y, margin)` kiểm tra 5 điểm (tâm và 4 góc hình vuông cạnh `2·margin`) bằng point-in-polygon (even-odd) với lối đi và gò đất, cộng các vùng chữ nhật: trên chân trời, vùng rễ, và phần đất từ `x = 700` sang phải.

### Khác `layout.md` và issue

- **Chừa đất bên phải** (`x ≥ 700`) cho hồ/suối (#13), cầu (#19) và lá to tiền cảnh (#18): bỏ cụm hoa phải (`x = 815…870`); có thể thêm lại ven bờ khi hồ xong.
- Cỏ mọc thành khóm rải rác thay cho dải cỏ ở mép dưới (`y = 690…720`).
- Hoa và cỏ là một vật thể `Meadow` để vẽ theo độ sâu; lớp `Flowers`, `Grass` vẫn dùng riêng được.


---

## #19 — Cầu gỗ: DDA, Bresenham, Polygon Fill và biến đổi 2D

**Người thực hiện:** Trần Viết Thụ  
**Issue:** #19  
**Nhánh:** `feat/bridge`  
**Mã nguồn:** `src/scene/lakeside/bridge.ts`  
**Kiểm thử:** `tests/bridge.test.ts`

### 1. Mục tiêu

Xây dựng cây cầu gỗ hình vòm bắc qua hồ nước, sử dụng các thuật toán đồ họa 2D đã triển khai trong dự án:

- DDA để vẽ các đường phân chia ván cầu.
- Bresenham để vẽ trụ, thanh lan can và giằng chéo.
- Scanline Polygon Fill để tô mặt cầu.
- Vector tiếp tuyến và pháp tuyến để xác định vị trí ván.
- Phép tịnh tiến 2D để tạo hiệu ứng nhún khi click.
- Mask và Alpha Blending để tạo bóng cầu trên mặt nước.

Cầu được xây dựng dưới dạng một SceneObject, có khả năng hiển thị, nhận tương tác và cập nhật trạng thái theo thời gian.

### 2. Hình học cung vòm

Cầu được biểu diễn bằng một cung hình sin với hai chân cầu nằm tại:

- Chân trái: (860, 520).
- Chân phải: (1120, 520).
- Đỉnh vòm: (990, 462).

Phương trình tham số:

```text
x(t) = 860 + 260t
y(t) = 520 - 58sin(πt)

0 <= t <= 1
```

Trong đó:

- `t`: tham số xác định vị trí trên cung.
- `260`: khoảng cách ngang giữa hai chân cầu.
- `58`: độ cao của vòm so với hai chân cầu.
- `sin(πt)`: tạo đường cong đối xứng qua tâm cầu.

Các giá trị đặc biệt:

| t | x | y | Vị trí |
|---|---|---|---|
| 0 | 860 | 520 | Chân trái |
| 0.25 | 925 | ≈479 | Sườn trái |
| 0.5 | 990 | 462 | Đỉnh vòm |
| 0.75 | 1055 | ≈479 | Sườn phải |
| 1 | 1120 | 520 | Chân phải |

Hàm `bridgePoint(t)` trả về tọa độ tương ứng trên cung.

Cung được lấy mẫu thành 24 đoạn. Các điểm liên tiếp được nối bằng đoạn thẳng để tạo đường cong xấp xỉ.

Phương pháp này không sử dụng Bézier và phù hợp với yêu cầu dựng hình của Issue #19.

### 3. Xây dựng mặt cầu bằng Polygon Fill

Mặt cầu có độ dày khoảng 12 đơn vị world.

Đường biên phía trên được tạo từ các điểm của cung vòm.

Đường biên phía dưới được xác định bằng cách dịch các điểm trên cung theo hướng pháp tuyến.

Hai đường biên được ghép thành một đa giác khép kín.

Hàm `bridgeDeckPolygon()` thực hiện:

1. Lấy mẫu các điểm trên cung.
2. Tính vector pháp tuyến tại mỗi điểm.
3. Dịch điểm theo pháp tuyến để tạo cạnh dưới.
4. Đảo chiều danh sách điểm cạnh dưới.
5. Ghép hai danh sách thành đa giác mặt cầu.

Đa giác được tô bằng Scanline Polygon Fill thông qua Renderer.

Màu sắc sử dụng từ Palette:

- `wood`: màu gỗ chính.
- `woodDark`: vùng tối.
- `trunkLight`: vùng sáng.
- `ink`: đường viền.

Cách triển khai này cho phép mặt cầu giữ được độ cong và độ dày tương đối đồng đều.

### 4. Vector tiếp tuyến và pháp tuyến

Để xác định hướng của ván gỗ, sử dụng đạo hàm của cung vòm.

Với:

```text
x(t) = 860 + 260t
y(t) = 520 - 58sin(πt)
```

Vector tiếp tuyến:

```text
T(t) = (260, -58πcos(πt))
```

Độ dài vector tiếp tuyến:

```text
L = sqrt(Tx² + Ty²)
```

Vector pháp tuyến đơn vị hướng xuống:

```text
N(t) = (-Ty/L, Tx/L)
```

Tích vô hướng giữa tiếp tuyến và pháp tuyến bằng 0:

```text
T(t) · N(t) = 0
```

Do đó, hai vector vuông góc với nhau.

Hàm `bridgeNormal(t)` tính pháp tuyến tại từng vị trí trên cung.

Vector pháp tuyến được sử dụng để:

- Xác định cạnh dưới mặt cầu.
- Xác định hướng các khe ván gỗ.
- Giữ các đoạn ván vuông góc với cung.
- Tránh phải hardcode tọa độ từng ván.

### 5. Thuật toán DDA – Ván cầu

Cầu được chia thành 20 vị trí phân cách ván, nằm trong yêu cầu 18–22 đoạn của Issue #19.

Vị trí ván thứ i được xác định bởi:

```text
t = (i + 0.5) / plankCount
```

Với:

```text
plankCount = 20
```

Tại mỗi vị trí:

1. Tính điểm P trên cung bằng `bridgePoint(t)`.
2. Tính pháp tuyến N bằng `bridgeNormal(t)`.
3. Xác định hai đầu mút của khe ván theo hướng N.
4. Vẽ đoạn thẳng bằng thuật toán DDA.

Công thức hai đầu mút:

```text
A = P + N
B = P + 11N
```

Độ dài đoạn ván xấp xỉ 10 đơn vị world.

Thuật toán DDA sử dụng:

```text
dx = x2 - x1
dy = y2 - y1

steps = max(|dx|, |dy|)

xIncrement = dx / steps
yIncrement = dy / steps
```

Tọa độ pixel được xác định bằng cách cộng gia số và làm tròn qua từng bước.

DDA được lựa chọn vì:

- Phù hợp với các đoạn thẳng ngắn.
- Dễ tính toán từ tọa độ thực.
- Thuận tiện khi hai đầu mút được xác định theo pháp tuyến.
- Có thể điều chỉnh vị trí ván theo độ cong mặt cầu.

Các khe ván sử dụng màu `inkSoft` hoặc `woodDark` từ Palette để tạo sự phân biệt giữa các thanh gỗ.

Độ phức tạp của một đoạn DDA:

```text
O(max(|dx|, |dy|))
```

### 6. Thuật toán Bresenham – Lan can

Lan can gồm 7 trụ được phân bố đều theo tham số của cung vòm.

Vị trí trụ thứ i:

```text
t = i / (postCount - 1)

postCount = 7
```

Mỗi trụ có chiều cao khoảng 40 đơn vị world.

Các trụ được biểu diễn bằng những đoạn thẳng từ điểm trên mặt cầu đến điểm phía trên.

Hàm `bridgePosts()` tạo dữ liệu hình học cho các trụ.

Các thành phần lan can:

- Trụ đứng: vẽ bằng Bresenham hoặc thickLine.
- Thanh lan can cong: nối các điểm liên tiếp bằng Bresenham.
- Giằng chéo: nối giữa các trụ bằng đoạn thẳng mảnh.
- Đầu trụ: tạo đa giác và tô bằng Polygon Fill.

Bresenham sử dụng biến quyết định để xác định pixel gần đường thẳng lý tưởng.

Đối với đoạn thẳng có:

```text
dx = |x2 - x1|
dy = |y2 - y1|
```

Thuật toán cập nhật sai số qua từng bước, sử dụng phép cộng và trừ để chọn pixel tiếp theo.

Ưu điểm:

- Hạn chế phép toán số thực trong quá trình raster hóa.
- Đường thẳng liên tục.
- Phù hợp với các chi tiết lan can và giằng.
- Có thể kết hợp thickLine để tăng độ dày.

Độ phức tạp mỗi đoạn:

```text
O(max(|dx|, |dy|))
```

Mặt cầu, trụ và lan can sử dụng viền `ink` nhằm phân biệt vật thể với nền cảnh.

### 7. Bóng đổ trên mặt hồ

Bóng cầu được biểu diễn bằng một Mask hình elip.

Các thông số hình học:

```text
Tâm bóng: (990, 540)
Bán kính ngang: 125
Bán kính dọc: 15
```

Quy trình:

1. Tạo một Mask.
2. Ghi hình elip vào Mask.
3. Lấy màu bóng từ Palette.
4. Tô bóng thông qua Renderer.
5. Đặt bóng phía dưới cầu để tạo cảm giác chiều sâu.

Bóng sử dụng màu tối có alpha để pha trộn với màu mặt nước.

Mục đích của Alpha Blending là tạo bóng mềm về mặt màu sắc, không che hoàn toàn các chi tiết nền.

### 8. Phân lớp và tổ chức SceneObject

Cầu được xây dựng dưới dạng lớp `Bridge` triển khai interface `SceneObject`.

Thông tin vật thể:

```text
id          = "bridge"
name        = "Cầu gỗ"
layer       = BRIDGE (13)
interactive = true
```

Các thành phần chính:

- `root`: Node gốc của cầu.
- `deckNode`: Node quản lý trạng thái tịnh tiến mặt cầu.
- `update(env)`: cập nhật animation.
- `draw(renderer, env)`: vẽ cầu.
- `hitPolygons(env)`: trả về các vùng nhận click.
- `onClick(ctx)`: xử lý tương tác.

Layer `BRIDGE = 13` được sử dụng để bảo đảm thứ tự hiển thị:

- Cầu nằm trên nước, cá và đá.
- Cầu nằm dưới các vật thể thuộc lớp cây và nhà.

### 9. Hit-test và tương tác

Cầu hỗ trợ tương tác bằng chuột.

Các vùng nhận click được xây dựng từ đa giác:

- Đa giác mặt cầu.
- Các trụ lan can.
- Thanh lan can.
- Giằng chéo.

Hàm `segmentHitPolygon()` tạo một vùng hình chữ nhật bao quanh đoạn thẳng.

Phương pháp:

1. Xác định vector hướng của đoạn.
2. Tính độ dài đoạn.
3. Tính pháp tuyến đơn vị.
4. Nhân pháp tuyến với độ rộng vùng nhận click.
5. Tạo bốn đỉnh bao quanh đoạn.

Các vùng được trả về thông qua `hitPolygons()`.

Khi người dùng click vào cầu:

- Hệ thống xác định vật thể được chọn.
- Gọi `onClick()`.
- Hiển thị thông tin đối tượng.
- Khởi động hiệu ứng nhún mặt cầu.

### 10. Animation – Hiệu ứng nhún cầu

Khi người dùng click vào cầu, mặt cầu thực hiện chuyển động nhún nhẹ theo phương thẳng đứng.

Yêu cầu:

- Biên độ khoảng 2–3 pixel.
- Thời gian khoảng 0,5 giây.
- Dao động tắt dần.
- Kết thúc tại vị trí ban đầu.

Hàm dịch chuyển được sử dụng:

```text
offsetY(t) = 2.8 * e^(-3t) * sin(10πt)
```

Trong đó:

- `t`: thời gian tính từ lúc click.
- `2.8`: hệ số biên độ ban đầu.
- `e^(-3t)`: thành phần làm giảm biên độ.
- `sin(10πt)`: thành phần dao động.

Giá trị offset được cập nhật trong `update(env)` và áp dụng cho mặt cầu thông qua `deckNode`.

Khi thời gian đạt 0,5 giây:

```text
offsetY = 0
animating = false
```

Điều này bảo đảm mặt cầu trở về vị trí ban đầu sau animation.

### 11. Kiểm thử

File kiểm thử:

`tests/bridge.test.ts`

Các nhóm kiểm thử:

**Hình học:**
- Hai chân cầu có tọa độ chính xác.
- Đỉnh vòm nằm gần (990, 462).
- Có 20 đoạn phân cách ván.
- Các ván vuông góc với tiếp tuyến.
- Có 7 trụ lan can.
- Đa giác mặt cầu có tọa độ hữu hạn.

**SceneObject:**
- ID và tên vật thể.
- Layer BRIDGE.
- Trạng thái interactive.
- Quan hệ giữa root và deckNode.

**Hit-test:**
- Đa giác bao quanh đoạn thẳng.
- Đoạn thẳng có độ dài bằng 0.
- Vùng nhận click mặt cầu.
- Vùng nhận click trụ và lan can.

**Animation:**
- Click chọn đúng vật thể.
- Mặt cầu dịch chuyển sau click.
- Độ dịch chuyển không vượt quá 3 đơn vị.
- Mặt cầu trở về vị trí ban đầu.
- Click lần nữa khởi động lại hiệu ứng.

Các lệnh kiểm tra:

```bash
npx vitest run tests/bridge.test.ts
npm test
npm run build
```

### 12. Tích hợp toàn cảnh

Khi tích hợp vào hệ thống World và Renderer, cần xác minh:

- Hai chân cầu tiếp xúc đúng với bờ sau hồ nước.
- Mặt cầu nằm đúng vị trí trong hệ tọa độ world.
- Ván gỗ nằm trong vùng mặt cầu.
- Lan can không bị lệch.
- Bóng cầu nằm đúng vị trí trên mặt nước.
- Màu sắc sử dụng Palette ngày/đêm.
- Viền cầu đủ rõ trong cả hai chế độ.
- Click mặt cầu và lan can chọn đúng vật thể.
- Animation hoạt động mượt.
- Build không có lỗi.
- Tốc độ hiển thị đạt mục tiêu 60 FPS.

Phần kiểm tra trực quan, ảnh ngày/đêm và đo FPS được thực hiện khi cầu đã tích hợp vào cảnh chung.

### 13. Kết luận

Cầu gỗ kết hợp nhiều thuật toán đồ họa trong một vật thể:

- DDA để tạo các đường phân chia ván.
- Bresenham để dựng lan can và giằng.
- Polygon Fill để tô mặt cầu.
- Vector tiếp tuyến và pháp tuyến để xây dựng hình học.
- Mask và Alpha Blending để tạo bóng.
- Node và phép tịnh tiến để thực hiện animation.
- Hit-test đa giác để xử lý tương tác.

Việc tính toán tọa độ bằng công thức thay vì hardcode từng chi tiết giúp cấu trúc cầu nhất quán, dễ điều chỉnh và thuận tiện khi tích hợp vào cảnh 2D.


## #10 — Bầu trời, sao và thiên thể

`Sky` phủ world 1280×720 bằng 32 dải đa giác tô scanline. Màu mỗi dải được nội suy tuyến tính qua ba điểm `skyTop → skyMid → skyBottom` của palette đang hoạt động, nên nền chuyển sắc cùng Theme ngày/đêm.

`Stars` tạo cố định 70 vị trí bằng RNG seed `0x51a7` khi nạp module; vùng quanh tâm trăng được loại khỏi danh sách. Trong mỗi khung, alpha được điều chế bởi `sin(time × speed + phase)` và tăng tuyến tính khi `dayPhase > 0.35`. Một số sao dùng ô vuông 2×2, các sao còn lại là chấm midpoint circle.

`Celestial` đặt mặt trời tại `(1188, 85)`, bán kính 34 và trăng tại `(1188, 150)`, bán kính 30. Các vòng glow dùng alpha source-over; đĩa có viền màu pha từ màu thiên thể và `inkSoft`, crater trăng dùng midpoint circle. Crossfade lấy smoothstep của `dayPhase`; hit polygon 32 đỉnh chỉ được trả về khi opacity thiên thể vượt 0,2. Click gọi `toggleDayNight()` qua `UiActions`, không phụ thuộc DOM.

Factory `createBackground()` trả các object theo thứ tự layer: `Sky`, `Stars`, `Celestial`.
# #11 — Mây ellipse và biến đổi

`CloudLayer` dựng năm cụm mây bằng geometry sinh một lần từ RNG seed cố định. Mỗi cụm có 4–7 midpoint ellipse chồng lấp; một khối ellipse lệch nhẹ xuống tạo bóng đáy bằng `cloudShade`. Ban đêm bóng pha alpha từ `moonGlow`, còn khối mây giữ `palette.cloud` để không chìm thành silhouette tối.

Mỗi cụm có một `Node` gốc đặt tại tâm và scale đều 0,7–1,3. `mat3Apply(root.worldMatrix(), puffCenter)` biến đổi tâm puff local sang world; bán kính ellipse được scale cùng hệ số. Tọa độ ngang tiến theo thời gian ở tốc độ 4–12 world px/s rồi wrap trong chu kỳ world width cộng hai margin; bobbing dọc nhỏ dùng sin. Scale và vận tốc được cố định theo seed để tạo khác biệt parallax nhẹ.

Object nằm ở `CLOUD = 3`, dưới núi layer 4; không tương tác. Factory `createBackground()` đăng ký lớp này cùng trời, sao và thiên thể.

## #12 — Núi, rừng silhouette và nền đất

`Mountains` dựng dãy xa bằng đa giác nhiều đỉnh từ đỉnh `(1188, 282)` xuống đế `y = 430`, sau đó thêm các mặt sáng/tối bằng polygon phụ. Sườn gần và đồi phải vẽ tiếp phía trước. Hai dải sương alpha thấp nằm ở chân núi. `Forest` sinh trước 30 cây xa và 18 cây gần bằng RNG seed cố định; thân và tán là đa giác silhouette, có thông cao phía trái sau vị trí thân cây cổ thụ. `Ground` phủ kín đáy, mép trên gợn quanh `y = 460`, kèm hai dải địa hình tối/sáng.

Thứ tự layer tạo chiều sâu bằng painter's algorithm: núi xa/gần (4–5), rừng xa/gần (6–7), đất (8), hồ (9). Mọi đa giác dùng scanline polygon fill qua `Renderer`; geometry được tạo một lần, màu lấy từ palette ngày/đêm.

## #13 — Hồ, gợn DDA và phản chiếu

`Lake` tạo bờ ellipse, mặt nước nông, lòng hồ sâu lệch nhẹ và highlight bằng midpoint ellipse. Mười hai gợn sóng có tham số vị trí cố định từ RNG seed; `sin(time × speed + phase)` dịch chúng theo chiều dọc. Mỗi đoạn tính nửa bề rộng ellipse tại hàng y hiện tại, kẹp hai đầu vào biên và xác nhận điểm nằm trong hồ trước khi gọi DDA. Alpha theo từng gợn giảm độ gắt.

Năm ellipse phản chiếu ánh trăng xếp dọc gần `x = 1188`, tăng/giảm alpha theo `dayPhase`; các glint ban ngày lấy màu `waterHighlight`. Viền hồ vẽ bằng ellipse midpoint màu `ink`. Hit-test dùng đa giác world-space 40 đỉnh trên cùng hình ellipse; `onClick` chọn object qua `UiActions`. Layer `LAKE = 9` đặt hồ trên nền đất và dưới cầu/cá/đá.

Hồ theo layout issue #13 có tâm `(1010, 590)`, bán kính `300 × 66`; hit area, bờ và vùng ripple dùng chung kích thước. Phản chiếu trăng xếp quanh `x ≈ 1188` như vị trí thiên thể đã quy định.

Tương tác bổ sung: click trên hồ lưu world position vào `lastClickPosition` và thời gian vào `lastClickTime` để cá có thể đọc và tản ra. Ba vòng ellipse mở rộng, trễ nhẹ nhau, rồi fade trong 1,5 giây. Khi `env.pointer` nằm trong ellipse nước, một gợn nhỏ pulse theo con trỏ; ngoài hồ thì không vẽ.

## #18 — Nấm, bụi cây và lá tiền cảnh

`createDecor()` đăng ký bụi cây trước nấm nhỏ ở layer `SMALL_DECOR`, rồi lá ở `LEAF_FG`. Bụi ghép 4–7 ellipse vào một mask và tô ba tông để che các chân cây/nhà mà không che cửa. Nấm lớn vẽ thân polygon và mũ vòm; các đốm midpoint circle được cắt theo mask mũ. Nấm nhỏ sinh theo seed cố định thành hai cụm và nghiêng nhẹ bằng ma trận tịnh tiến/rotation. Lá được xấp xỉ từ ellipse polygon, xoay quanh tâm bằng `mat3`, rồi tô và viền bằng polygon fill.

Các màu lấy từ palette hiện tại; nấm lớn có halo alpha nhẹ ban đêm. Hình học được lưu tĩnh, không dùng random trong draw. Lá lớn tập trung ở góc phải dưới để tạo khung tiền cảnh; dương xỉ nhỏ nằm sát mép trái.

Đốm trên ba nấm lớn có halo alpha dao động theo `sin(time × 1.15 + phase)`; phase riêng giúp mỗi cây lên/xuống sáng lệch nhịp. Bụi và lá dò con trỏ với ellipse hit vùng; lúc con trỏ vừa đi vào, Node quay quanh gốc theo dao động `sin(ωt)·exp(−kt)`, rồi tự tắt sau khoảng 1,5 giây.

## #29 — Thỏ và chim

Thỏ tại `(346, 585)` ghép thân, đầu, tai và đuôi vào một mask có outline; chân trước/sau là mask viền riêng vẽ phía trên. Tai là Node con, vểnh theo `env.pointer`. Click gọi `select` và khởi động bước nhảy parabol 0,6 giây với squash nhẹ khi tiếp đất; hit polygons bao thân và đầu.

Hai chim dùng midpoint ellipse cho thân, polygon cho cánh và mỏ. Cánh là Node riêng vỗ theo sin; tọa độ bay ngang wrap trong vùng trời phía phải. Alpha giảm dần khi `dayPhase` tiến tới 0,4 để chim chỉ hiện ban ngày. Khi pointer đến gần, nhịp vỗ tăng nhanh và chim bật lên rồi hạ về quỹ đạo theo hàm suy giảm.
