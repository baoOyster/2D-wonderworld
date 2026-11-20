# Prompt tạo ảnh mẫu (bản 3, theo bố cục ảnh mẫu cũ)

Ảnh mẫu chỉ là **bản thiết kế tham khảo** (hình dáng, màu, không khí). Không đưa ảnh vào chương trình.
Bố cục lấy theo ảnh mẫu cũ (cây lệch trái, nhà nấm nép trong rễ, lối đi dẫn lên cửa, hồ và cầu bên phải). Ảnh phác `layout/layout_day.png`, `layout/layout_night.png` dựng lại bố cục đó bằng elip, đa giác, gradient và trộn alpha trên khung 1280×720. Tọa độ đề xuất cập nhật vào [SPEC #1](https://github.com/baoOyster/2D-wonderworld/issues/1).

## Cách dùng

1. Dùng ChatGPT hoặc Gemini, **tạo tất cả trong cùng một cuộc trò chuyện**.
2. Với A1 và A2: **đính kèm ảnh phác bố cục** (`layout/layout_day.png` cho A1, `layout/layout_night.png` cho A2) rồi dán prompt. Mô hình tạo ảnh bám theo ảnh phác tốt hơn nhiều so với bám theo con số.
3. Với nhóm B: đính kèm **ảnh A1 đã chốt** và thêm câu: *"Match the object in the attached scene exactly, but shown isolated on a plain background."*
4. Mỗi prompt tạo 2–3 lần, chọn bản **khớp ảnh phác nhất, ít chi tiết vụn nhất**.
5. Thay ảnh trong `docs/reference/images/` theo đúng tên file cũ để README không phải sửa.

## Đoạn mô tả phong cách (đã có trong mọi prompt)

```
Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no photorealism, no 3D, no text.
```

---

## A. Toàn cảnh (2 ảnh, đúng 2 pha của SPEC)

### A1 — Ban ngày (đính kèm `layout_day.png`)

```
Repaint the attached layout sketch as a finished 16:9 storybook illustration titled "Fairy-Tale World". Keep EXACTLY the same composition, positions and sizes of every element; only refine the shapes, add gentle shading and harmonious color. Do not add, remove or move anything.

The scene: a cozy forest clearing in clear mid-morning daylight. A huge ancient tree on the left with a thick, slightly twisting trunk, mossy exposed roots and one long branch reaching across the top of the image to the right; its layered canopy of overlapping rounded leaf clusters frames the top edge. A mushroom cottage nestled into the tree roots: big red cap with cream spots, a small round window in the cap, a small brick chimney, cream walls, a round four-pane window, an arched wooden door, a small hanging lantern, two stone steps, and short wooden picket fences on both sides of the door. A curved dirt path with a few flat stones runs from the steps down to the bottom of the image. Big red spotted mushrooms on the left, white daisies, a small white rabbit sitting near the path, two small yellow butterflies, a few grey rocks in the foreground. On the right: a calm pond with a lighter rim and darker center, gentle ripple lines, an arched wooden footbridge with railings crossing behind the pond, rounded rocks on the shore, large dark leaves framing the bottom-right corner. Background: soft pine-tree silhouettes, rounded trees, a green hill on the right and a distant blue mountain; light blue sky with a few fluffy clouds, a round sun with soft glow rings in the upper right, a few soft sunbeams falling from above through the canopy, two small birds.

Lighting: one time of day only (daytime). No sunset colors, no moon, no stars, no fireflies, no glowing windows.

Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no photorealism, no 3D, no text.
```

### A2 — Ban đêm (đính kèm `layout_night.png` và ảnh A1 đã chốt)

```
Generate the exact same scene as the attached daytime image, every object in the same position and size, but at deep night. Use the attached night sketch for the lighting.

Night only: no sun and no sunbeams. A round moon with small craters and soft halo rings in the upper right, where the sun was. Dark navy-to-indigo sky with many small stars. Clouds dim blue-grey with a faint moonlit edge. Background trees and mountain become dark blue silhouettes that are still readable. The cottage windows and the lantern glow warm amber with soft halos; the big mushrooms glow faintly. Small yellow-green fireflies with soft glow rings float around the canopy, the cottage and the path. A short column of moonlight reflection on the pond made of stacked short horizontal ellipses. Flowers, rabbit and grass become desaturated cool tones. No butterflies, no birds.

Do not move, add or remove objects. Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no photorealism, no 3D, no text.
```

### A3 — Hoàng hôn (tùy chọn)

SPEC hiện chỉ có 2 pha ngày/đêm. Chỉ tạo ảnh này nếu nhóm quyết định thêm pha hoàng hôn vào #5.

```
Generate the exact same scene as the attached daytime image, every object in the same position, but at sunset. The sun stays in the same upper-right position but becomes larger and deep orange, with a warm glow; the sky is a gradient from peach-gold near the horizon to soft rose and dusky blue at the top. Mountains turn warm purple, long shadows fall toward the left. No moon, no stars, no fireflies. Only the mushroom window has a very faint warm glow. Do not move, add or remove objects. Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no photorealism, no 3D, no text.
```

---

## B. Từng vật thể

Đính kèm ảnh A1 đã chốt cho mọi prompt nhóm B. Nền trơn sáng, trừ khi ghi khác.

### B1 — Cây cổ thụ (#14, TV4) → `B1_cay_co_thu.jpg`
```
The huge ancient tree from the attached scene, isolated, same shape: thick slightly twisting trunk with mossy flared roots, one long branch reaching far to the right and a few shorter branches. Exploded view with parts slightly separated: (1) trunk and roots as one polygon with a few simple bark lines and moss patches, (2) the branches as thick tapered strokes, (3) the canopy as 10 to 12 rounded leaf clusters, each made of three overlapping ellipses in dark, middle and light green. Mark with small circles the trunk base and the point where the long branch meets the trunk (pivots for swaying). Plain light background. Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no text.
```

### B9 — Nhà nấm (#15, TV4) → `B9_nha_nam.jpg`
```
The mushroom cottage from the attached scene, isolated, front view, with a hint of the tree roots it sits in. Exploded view with parts slightly separated: (1) the wide red elliptical cap with 7 to 9 cream round spots of different sizes and a darker rim underneath, (2) the cream slightly tapered stem with a soft shadow on its right side, (3) an arched wooden door with a small round knob and a flat stone step, (4) a round four-pane window in the wall and a small round window in the cap, a small brick chimney, a hanging lantern, two stone steps; windows and lantern shown twice: unlit (day) and glowing warm amber with a halo (night). Plain light background. Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). Smooth color gradients and soft glows are allowed. No painterly brush texture, no noise, no tiny fussy details, no text.
```

### B3 — Hàng rào, đường đá, cầu gỗ (#16 TV4, #19 TV5) → `B3_hang_rao_cau_go.jpg`
```
Three wooden and stone elements from the attached scene, side by side on a plain light background: (1) two short wooden picket fence segments with posts with pointed tops and two horizontal rails, rails drawn behind the posts, (2) a curved dirt path that widens toward the viewer with a few flat oval stones set into it, (3) a low-arched wooden footbridge in side view with a plank deck made of many short planks, 4 to 5 posts on each side and simple railings connecting them, with a soft dark shadow under it. Use only straight lines, simple polygons and ellipses. Storybook illustration built from clean, readable shapes. No painterly brush texture, no noise, no text.
```

### B12 — Hoa, cỏ, nấm nhỏ, bụi cây (#17, #18, TV4) → `B12_hoa_nam_nho.jpg`
```
A set of foreground plants and creatures from the attached scene on a plain light background: (1) four flowers in red, yellow, blue and purple, each with 5 to 6 round petals around a round yellow center, a thin stem and one or two leaves, head shown separately from stem, (2) a row of simple grass blades, darker short ones in the back and lighter tall ones in the front, (3) a cluster of 5 small spotted mushrooms of different heights, (4) two round bushes made of 4 to 6 overlapping circles in two greens with a small light highlight, (5) one big red spotted mushroom like the ones on the left of the scene, (6) a few large dark pointed leaves like the ones framing the bottom-right corner. Storybook illustration built from clean, readable shapes (polygons, circles, ellipses). No painterly brush texture, no noise, no text.
```

### B4 — Lớp nền (#12, TV3) → `B4_lop_nen.jpg`
```
Separated background layers of the attached scene, stacked vertically with space between them on a white background, each a single flat silhouette band: (1) far mountains, light blue, (2) near mountains, darker, (3) a band of far pine-tree silhouettes, (4) a band of nearer, larger tree silhouettes with round and pointed crowns, (5) a ground strip with a gently uneven top edge and two darker grass bands. Show each layer in a day color and below it the same layer in a dark blue night color. Storybook illustration built from clean, readable shapes. No texture, no text.
```

### B6 — Mặt trời, mặt trăng, sao (#10, TV3) → `B6_mat_troi_trang_sao.jpg`
```
Celestial elements on a plain dark navy background: (1) a round sun with a bright core and 3 to 4 concentric soft glow rings decreasing in opacity, (2) a round FULL moon (not a crescent) with 2 to 3 small darker crater circles and a soft halo, (3) a set of small stars: tiny 1-pixel dots and a few 2x2 square stars. Storybook illustration built from clean, readable shapes (circles). No text.
```

### B7 — Mây (#11, TV3) → `B7_may.jpg`
```
Five different fluffy cartoon clouds of different sizes, each built from 4 to 7 overlapping ellipses with a slightly darker shaded underside, arranged on a plain sky-blue background. Below them, the same five clouds in a night version: dim blue-grey with a faint pale moonlit top edge. Storybook illustration built from clean, readable shapes (ellipses). No texture, no text.
```

### B5 — Hồ nước (#13, TV3) và đá, sậy (#20, TV5) → `B5_ho_da.jpg`
```
The oval pond from the attached scene, isolated, seen from a low angle: an outer shore rim, a lighter shallow water ellipse, a darker deep water ellipse slightly offset, a few thin highlight ellipses and about 12 short horizontal ripple lines inside the water. Next to it: 4 rounded grey rocks of different sizes, each made of a polygon with 2 to 3 flat facets in three grey tones and a soft shadow ellipse below, a few small pebbles, and two clumps of tall thin reeds with small oval seed heads. Show a small night version of the pond with a column of moonlight reflection made of stacked short ellipses. Plain light background. Storybook illustration built from clean, readable shapes. No painterly texture, no text.
```

### B13 — Cá (#21, TV5) → `B13_ca_tho.jpg`
```
Small creatures in side view on a plain light background: a small white rabbit made of simple ellipses and circles in a sitting pose and a mid-jump pose; and 3 pond fish of different sizes, each with an elliptical body, a triangular tail, small polygon fins on top and bottom, and a round eye with a white highlight, in two tones of orange. Show one fish facing left and one facing right (mirrored), and a few small round bubbles. Storybook illustration built from clean, readable shapes (ellipses, polygons, circles). No text.
```

### B10 — Bướm (#22, TV5) → `B10_buom_chim.jpg`
```
Three small butterflies in three different color schemes, plus one small bird in side view with separate wings,, top view, exploded: thin elliptical body, round head, two antennae as thin straight lines, two upper and two lower wings each as an ellipse or simple polygon with round spots. Mark each wing's attachment point on the body with a small dot (pivot for flapping). Also show one butterfly with wings half-closed (wings squashed horizontally). Plain light background. Storybook illustration built from clean, readable shapes. No text.
```

### B8 — Đom đóm (#23, TV5) → `B8_dom_dom.jpg`
```
Close-up of 12 fireflies glowing at night around the dark silhouette of a tree canopy, on a dark navy background. Each firefly is a tiny bright yellow-green core circle with 2 to 3 concentric soft glow rings of decreasing opacity, different sizes. One firefly shows a brighter, larger "burst" glow. No lanterns, no stars in the foreground. Storybook illustration built from clean, readable shapes (circles). No text.
```

---

## C. Chữ và giao diện

### C1 — Font pixel (#7, TV2) → `C1_font.png`
```
A pixel art bitmap font sheet on a plain white background. Each glyph is 5 pixels wide and 7 pixels tall, drawn on a visible 6x10 pixel cell grid with 2 empty rows on top for accents and 1 empty row at the bottom. Show uppercase A-Z, lowercase a-z, digits 0-9 and . , : ; ! ? ( ) [ ] / - + % '. Black pixels only, no anti-aliasing.
```

### C2 — Dấu tiếng Việt (#7, TV2) → `C2_dau_tieng_viet.png`
```
Pixel art sheet on a plain white background showing how Vietnamese diacritics are placed on a 6x10 pixel cell with a 5x7 base letter: acute, grave, hook above, tilde (in the 2 top rows), dot below (in the bottom row), circumflex on a, e, o, breve on a, horn on o and u, and the crossed d (đ). Show each mark alone and combined on a letter, e.g. ế, ằ, ở, ữ, ạ, đ. Black pixels only, no anti-aliasing, label each mark.
```

### C3 — Bảng thông tin và thanh công cụ (#24, TV2) → `C3_khung_thong_tin.jpg`
```
A user-interface mockup only (no scene illustration): on a dark background, a semi-transparent rounded information panel docked on the right side with a title line, a two-line description and a row of small rounded "chips" listing algorithm names; and a small horizontal toolbar with four round icon buttons (zoom in, zoom out, reset, day/night toggle showing a sun and a moon) and a short keyboard hint line. Soft storybook colors, clean flat style. Use placeholder grey bars instead of real text.
```

---

## Ghi chú báo cáo

Ảnh mẫu được tạo bằng công cụ AI tạo ảnh từ ảnh phác bố cục do nhóm dựng; chỉ dùng làm tham khảo thiết kế. Toàn bộ quá trình vẽ ra pixel do thuật toán của nhóm cài đặt.
