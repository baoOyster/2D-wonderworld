/**
 * Nhà nấm (#15): vật thể tương tác thứ hai, nép trong rễ cây cổ thụ.
 *
 * Thuật toán dùng:
 * - Mũ nấm: Midpoint ellipse (hình elip lớn nhất cảnh), cắt nửa dưới bằng phép
 *   trừ mask, cộng thêm elip vành; đốm là Midpoint circle bị clip trong mask mũ.
 * - Mặt dưới mũ (nếp mang nấm): elip + các đoạn Bresenham toả tròn.
 * - Thân, gò đất, cửa, bậc thềm, ống khói, đèn: đa giác tô scanline.
 * - Cửa sổ tròn: Midpoint circle (khung, kính) + nét dày chia ô.
 * - Ván cửa, hàng gạch: Bresenham.
 * - Ban đêm: cửa sổ và đèn sáng, quầng sáng alpha nhấp nháy nhẹ.
 * - Ban ngày: khói bay lên từ ống khói (hình tròn alpha, vị trí theo thời gian).
 * - Biến đổi gộp: Node gốc ở chân nhà → mũ / cửa / cửa sổ / đèn là node con.
 *
 * Toạ độ trong file là toạ độ world 1280×720 (docs/reference/layout.md).
 */
import { lerpColor, withAlpha } from '../../core/color.ts';
import { ellipsePolygon, mat3Apply, transformPoints } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Palette } from '../../core/palette.ts';
import type { Renderer, ShapeStyle } from '../../core/renderer-types.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import type { Env, SceneObject } from '../types.ts';

// ---------------------------------------------------------------------------
// Hình học (theo layout.md)
// ---------------------------------------------------------------------------

/** Chân nhà (Node gốc đặt ở đây). */
export const HOUSE_BASE: Vec2 = vec2(430, 452);

/** Mũ vòm: nửa trên elip tâm (430,322), rx 158, ry 112. */
export const CAP = { cx: 430, cy: 322, rx: 158, ry: 112 } as const;
/** Vành mũ: elip dẹt cong xuống, phủ mép dưới của nửa elip. */
export const CAP_RIM = { cx: 430, cy: 326, rx: 164, ry: 24 } as const;
/** Mặt dưới mũ (nếp mang nấm), lộ ra dưới vành. */
export const GILLS = { cx: 430, cy: 340, rx: 146, ry: 18 } as const;

/** Đốm trên mũ: tâm và bán kính, cố định (không random). Đốm sát mép bị cắt gọn trong mũ. */
export const SPOTS: readonly { x: number; y: number; r: number }[] = [
  { x: 300, y: 292, r: 17 },
  { x: 346, y: 250, r: 14 },
  { x: 394, y: 224, r: 10 },
  { x: 522, y: 246, r: 15 },
  { x: 566, y: 292, r: 18 },
  { x: 400, y: 292, r: 9 },
  { x: 500, y: 302, r: 8 },
  { x: 274, y: 322, r: 12 },
  { x: 596, y: 330, r: 10 },
];

/** Thân nhà: phình nhẹ ở giữa, chân loe ra (x = 318…546, y = 330…452). */
export const STEM: readonly Vec2[] = [
  vec2(340, 330), vec2(522, 330), vec2(538, 356), vec2(546, 392), vec2(546, 428),
  vec2(554, 452), vec2(310, 452), vec2(318, 428), vec2(318, 392), vec2(324, 356),
];

/** Cửa vòm x = 465…525, y = 365…455: chữ nhật + nửa hình tròn phía trên. */
export const DOOR = { x0: 465, x1: 525, yTop: 395, yBottom: 455, archR: 30 } as const;

/** Cửa sổ tròn: trên thân và trên mũ. */
export const STEM_WINDOW = { x: 372, y: 382, r: 24 } as const;
export const CAP_WINDOW = { x: 447, y: 282, r: 20 } as const;

/**
 * Ống khói gạch x = 480…514 (phần dưới nằm sau mũ). Layout ghi y = 205…250,
 * nhưng đỉnh mũ tại x ≈ 497 đã ở y ≈ 221 nên ống khói kéo cao lên y = 186
 * để nhô hẳn khỏi mũ như ảnh mẫu.
 */
export const CHIMNEY: readonly Vec2[] = [vec2(482, 196), vec2(512, 196), vec2(514, 250), vec2(480, 250)];
export const CHIMNEY_TOP: readonly Vec2[] = [vec2(476, 184), vec2(518, 184), vec2(518, 197), vec2(476, 197)];

/** Đèn treo cạnh cửa: điểm móc (552,384), thân đèn quanh (552,398). */
export const LANTERN_HOOK: Vec2 = vec2(560, 384);

/**
 * Độ hạ nhà so với layout.md: chân thân từ y = 452 xuống y = 482, đứng trên
 * gò đất hình thang, để thân nhà và gò đất che phần rễ cây cổ thụ phía sau.
 * Mọi hình học trong file vẫn ghi theo layout; Node gốc dời xuống một đoạn này.
 */
export const HOUSE_DROP = 30;

/** Dời cả nhà sang phải so với layout.md, để mũ nấm không che hốc cây cổ thụ. */
export const HOUSE_SHIFT = 18;

/** Gò đất hình thang dưới chân nhà (toạ độ layout, trước khi hạ). */
export const MOUND: readonly Vec2[] = [
  vec2(300, 450), vec2(566, 450), vec2(616, 496), vec2(256, 496),
];

/**
 * Bậc thềm đá: 4 bậc bằng nhau, xếp chéo từ cửa xuống bên phải. Bậc sau lệch
 * bậc trước đúng (STEP_DX, STEP_DY); bậc cuối chạm chân gò đất.
 */
export const STEP_COUNT = 4;
export const STEP_W = 66;
export const STEP_H = 10;
export const STEP_DX = 11;
export const STEP_DY = 11;
export const STEP_ORIGIN: Vec2 = vec2(468, 452);

/** Đa giác bậc thứ i (0 = sát cửa), góc bo nhẹ (toạ độ layout). */
export function stepPolygon(i: number): Vec2[] {
  const x = STEP_ORIGIN.x + i * STEP_DX;
  const y = STEP_ORIGIN.y + i * STEP_DY;
  return [
    vec2(x + 3, y), vec2(x + STEP_W - 3, y), vec2(x + STEP_W, y + 3),
    vec2(x + STEP_W, y + STEP_H), vec2(x, y + STEP_H), vec2(x, y + 3),
  ];
}

/** Búi cỏ trên gò đất: chân búi (toạ độ layout) và chiều cao. */
export const GRASS_TUFTS: readonly { x: number; y: number; h: number }[] = [
  { x: 312, y: 456, h: 18 }, { x: 296, y: 474, h: 16 }, { x: 278, y: 494, h: 14 },
  { x: 330, y: 498, h: 15 }, { x: 392, y: 498, h: 13 }, { x: 446, y: 498, h: 15 },
  { x: 560, y: 458, h: 16 }, { x: 580, y: 476, h: 17 }, { x: 596, y: 496, h: 13 },
];

const sub = (a: Vec2, b: Vec2): Vec2 => vec2(a.x - b.x, a.y - b.y);

/** Thời gian mở hoặc đóng hẳn cửa (giây) và phần bề ngang cánh cửa mất đi khi mở hẳn. */
export const DOOR_SWING_TIME = 0.6;

/**
 * Màu kính ban ngày (cửa sổ, đèn): vàng hổ phách nhạt như ảnh mẫu, pha giữa
 * `windowGlow` và `window`, để không trùng màu trời phía sau.
 */
function dayGlass(p: Palette): number {
  return lerpColor(p.windowGlow, p.window, 0.45);
}

/** Khói ống khói: số cụm khói và chu kỳ (giây) mỗi cụm bay hết. */
export const SMOKE_PUFFS = 7;
export const SMOKE_PERIOD = 4.2;
export const DOOR_MIN_WIDTH_LOSS = 0.82;

/** Đa giác cửa vòm (dùng cho mask): chữ nhật + nửa trên hình tròn lấy mẫu 16 điểm. */
function doorPolygon(inflate: number): Vec2[] {
  const { x0, x1, yTop, yBottom, archR } = DOOR;
  const cx = (x0 + x1) / 2;
  const r = archR + inflate;
  const pts: Vec2[] = [vec2(x0 - inflate, yBottom), vec2(x0 - inflate, yTop)];
  for (let i = 1; i < 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    pts.push(vec2(cx + r * Math.cos(a), yTop + r * Math.sin(a)));
  }
  pts.push(vec2(x1 + inflate, yTop), vec2(x1 + inflate, yBottom));
  return pts;
}

// ---------------------------------------------------------------------------
// Vật thể
// ---------------------------------------------------------------------------

/**
 * Nhà nấm. Cây Node:
 *
 * ```
 * root (HOUSE_BASE + HOUSE_DROP)  gò đất, thân, bậc thềm, cỏ
 * ├── cap (0, −130)          mũ, đốm, nếp mang, ống khói
 * │   └── capWindow          cửa sổ trên mũ
 * ├── doorHinge              cánh cửa, co ngang quanh bản lề khi mở
 * ├── stemWindow             cửa sổ trên thân
 * └── lantern                đèn treo, đung đưa nhẹ quanh móc
 * ```
 */
export class MushroomHouse implements SceneObject {
  readonly id = 'house';
  readonly name = 'Nhà nấm';
  readonly description =
    'Ngôi nhà nấm nép trong rễ cây cổ thụ. Đêm xuống, cửa sổ và chiếc đèn treo bên cửa sáng lên ấm áp.';
  readonly algorithms: readonly string[] = [
    'Midpoint ellipse (mũ nấm, vành, mặt dưới mũ)',
    'Midpoint circle (đốm, cửa sổ, tay nắm)',
    'Phép trừ / hợp mask, clip đốm trong mũ',
    'Scanline polygon fill (thân, gò đất, cửa, bậc thềm, ống khói, đèn)',
    'Bresenham (ván cửa, hàng gạch, nếp mang nấm)',
    'Alpha blending (quầng sáng cửa sổ và đèn, khói ống khói)',
    'Biến đổi gộp: cây Node, đèn đung đưa quanh móc, cửa co quanh bản lề khi mở',
  ];
  readonly layer = Layer.HOUSE;
  readonly interactive = true;

  readonly root = new Node();
  readonly cap = new Node();
  readonly capWindow = new Node();
  /** Bản lề cửa (mép trái chân cửa); cánh cửa co ngang quanh điểm này khi mở. */
  readonly doorHinge = new Node();

  /** Độ mở cửa hiện tại (0 = đóng, 1 = mở hẳn) và trạng thái muốn tới. */
  private doorOpen = 0;
  private doorTarget = 0;
  readonly stemWindow = new Node();
  readonly lantern = new Node();

  constructor() {
    this.root.transform.x = HOUSE_BASE.x + HOUSE_SHIFT;
    this.root.transform.y = HOUSE_BASE.y + HOUSE_DROP;
    const place = (node: Node, parent: Node, at: Vec2, origin: Vec2): void => {
      node.transform.x = at.x - origin.x;
      node.transform.y = at.y - origin.y;
      parent.add(node);
    };
    const capCenter = vec2(CAP.cx, CAP.cy);
    place(this.cap, this.root, capCenter, HOUSE_BASE);
    place(this.capWindow, this.cap, vec2(CAP_WINDOW.x, CAP_WINDOW.y), capCenter);
    place(this.doorHinge, this.root, vec2(DOOR.x0, DOOR.yBottom), HOUSE_BASE);
    place(this.stemWindow, this.root, vec2(STEM_WINDOW.x, STEM_WINDOW.y), HOUSE_BASE);
    place(this.lantern, this.root, LANTERN_HOOK, HOUSE_BASE);
  }

  update(env: Pick<Env, 'time' | 'dt'>): void {
    // Đèn đung đưa rất nhẹ quanh móc (±3°)
    this.lantern.transform.rotation = 0.05 * Math.sin(env.time * 1.3);

    // Cửa tiến dần về trạng thái muốn tới, mất khoảng 0,6 giây
    const step = (env.dt ?? 1 / 60) / DOOR_SWING_TIME;
    if (this.doorOpen < this.doorTarget) this.doorOpen = Math.min(this.doorTarget, this.doorOpen + step);
    else if (this.doorOpen > this.doorTarget) this.doorOpen = Math.max(this.doorTarget, this.doorOpen - step);

    // Cánh cửa quay quanh bản lề: nhìn từ trước, cánh cửa co ngang về phía bản lề
    const ease = this.doorOpen * this.doorOpen * (3 - 2 * this.doorOpen);
    this.doorHinge.transform.scaleX = 1 - DOOR_MIN_WIDTH_LOSS * ease;
  }

  /** Bấm vào nhà: mở cửa nếu đang đóng, đóng nếu đang mở. */
  onClick(): void {
    this.toggleDoor();
  }

  toggleDoor(): void {
    this.doorTarget = this.doorTarget > 0.5 ? 0 : 1;
  }

  /** Độ mở cửa 0…1 (để test và hiển thị). */
  get doorOpenAmount(): number {
    return this.doorOpen;
  }

  /** Điểm local của một node → world. */
  private at(node: Node, p: Vec2 = vec2(0, 0)): Vec2 {
    return mat3Apply(node.worldMatrix(), p);
  }

  /** Đa giác local (toạ độ world lúc nghỉ, so với gốc `origin`) → world theo node. */
  private poly(node: Node, pts: readonly Vec2[], origin: Vec2): Vec2[] {
    return transformPoints(node.worldMatrix(), pts.map((p) => sub(p, origin)));
  }

  hitPolygons(): Vec2[][] {
    const c = this.at(this.cap);
    return [
      this.poly(this.root, STEM, HOUSE_BASE),
      this.poly(this.root, MOUND, HOUSE_BASE),
      ...Array.from({ length: STEP_COUNT }, (_, i) => this.poly(this.root, stepPolygon(i), HOUSE_BASE)),
      ellipsePolygon(c.x, c.y - CAP.ry / 2, CAP.rx, CAP.ry / 2 + CAP_RIM.ry, 32),
    ];
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    const night = Math.max(0, Math.min(1, env.dayPhase));
    const ink = p.ink;
    const capC = this.at(this.cap);
    const dx = capC.x - CAP.cx;
    const dy = capC.y - CAP.cy;

    // 0. Bóng đổ dưới chân nhà
    const base = this.at(this.root);
    r.polygon(ellipsePolygon(base.x + 6, base.y + 46, 200, 9, 32), p.shadow, true);

    // 0b. Gò đất hình thang dưới chân nhà
    r.shape(r.mask().polygon(this.poly(this.root, MOUND, HOUSE_BASE)), {
      fill: lerpColor(p.pathStoneDark, p.trunk, 0.35),
      shade: lerpColor(p.trunk, p.trunkDark, 0.4),
      highlight: p.pathStoneDark,
      outline: p.ink,
      outlineWidth: 2,
    });

    // 1. Ống khói (phần dưới bị mũ che)
    this.drawChimney(r, p, dx, dy);

    // 2. Thân nhà + bóng mũ đổ lên đỉnh thân
    const stem = r.mask().polygon(this.poly(this.root, STEM, HOUSE_BASE));
    r.shape(stem, {
      fill: p.mushroomStem,
      shade: lerpColor(p.mushroomStem, p.trunk, 0.35),
      highlight: lerpColor(p.mushroomStem, p.mushroomSpot, 0.6),
      outline: ink,
      outlineWidth: 2,
    });
    const capShadow = r.mask().ellipse(capC.x, capC.y + 40, CAP.rx * 0.9, 20);
    r.shape(capShadow, { fill: withAlpha(p.trunkDark, 0.45), clip: stem });

    // 3. Cửa sổ trên thân, cửa vòm, đèn
    this.drawWindow(r, p, this.at(this.stemWindow), STEM_WINDOW.r, night, env.time, 0);
    this.drawDoor(r, p, night);
    this.drawLantern(r, p, night, env.time);

    // 4. Mặt dưới mũ (nếp mang nấm) rồi mũ
    this.drawGills(r, p, dx, dy);
    this.drawCap(r, p, dx, dy);
    this.drawWindow(r, p, this.at(this.capWindow), CAP_WINDOW.r, night, env.time, 1.7);

    // 4b. Khói bay lên từ ống khói (ban ngày; ban đêm bếp đã tắt)
    this.drawSmoke(r, p, night, env.time, dx, dy);

    // 5. Cỏ trên gò đất
    this.drawGrass(r, p);

    // 6. Bậc thềm: vẽ từ bậc trên (xa) xuống bậc dưới (gần) để bậc dưới nằm trước
    for (let i = 0; i < STEP_COUNT; i++) {
      r.shape(r.mask().polygon(this.poly(this.root, stepPolygon(i), HOUSE_BASE)), {
        fill: p.stone,
        shade: p.stoneDark,
        highlight: lerpColor(p.stone, p.mushroomSpot, 0.5),
        outline: ink,
        outlineWidth: 2,
      });
      // Nét Bresenham tách mặt trên và mặt đứng của bậc
      const a = this.at(this.root, sub(vec2(STEP_ORIGIN.x + i * STEP_DX + 2, STEP_ORIGIN.y + i * STEP_DY + 4), HOUSE_BASE));
      r.line(a.x, a.y, a.x + STEP_W - 4, a.y, p.stoneDark, 1, 'bresenham');
    }

    // 7. Ánh đèn hắt ra khi cửa mở ban đêm
    this.drawDoorLight(r, p, night);
  }

  private drawGrass(r: Renderer, p: Palette): void {
    // Mỗi búi 4 lá cỏ tam giác, gộp chung một mask để viền một lần
    const grass = r.mask();
    for (const t of GRASS_TUFTS) {
      const blades: [number, number, number][] = [[-8, -6, 0.75], [-3, -2, 0.95], [3, 3, 1], [8, 7, 0.7]];
      for (const [off, lean, k] of blades) {
        const x = t.x + off;
        grass.polygon(this.poly(this.root, [
          vec2(x - 5, t.y), vec2(x + 5, t.y), vec2(x + lean, t.y - t.h * k),
        ], HOUSE_BASE));
      }
    }
    r.shape(grass, { fill: p.leaf, shade: p.stem, highlight: p.canopyLight, outline: p.ink, outlineWidth: 1.5 });
  }

  /**
   * Khói: SMOKE_PUFFS cụm, mỗi cụm có pha φ = (t / chu kỳ + i / số cụm) mod 1.
   * Cụm bay lên, trôi sang phải theo gió, to dần và mờ dần; hết vòng thì quay lại
   * miệng ống khói. Vị trí chỉ phụ thuộc thời gian nên không cần lưu trạng thái.
   */
  private drawSmoke(r: Renderer, p: Palette, night: number, time: number, dx: number, dy: number): void {
    const day = 1 - night;
    if (day <= 0) return;
    const mouth = vec2(497 + dx, CHIMNEY_TOP[0].y + dy);
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const ph = (time / SMOKE_PERIOD + i / SMOKE_PUFFS) % 1;
      const x = mouth.x + 34 * ph + 5 * Math.sin(ph * 7 + i * 1.9);
      const y = mouth.y - 6 - 96 * ph;
      const radius = 5 + 13 * ph;
      // Hiện dần lúc mới ra, mờ dần khi lên cao
      const a = day * 0.8 * Math.min(1, ph * 6) * (1 - ph);
      if (a <= 0.01) continue;
      r.circle(x - radius * 0.2, y + radius * 0.25, radius, withAlpha(p.cloudShade, a), true);
      r.circle(x, y, radius * 0.85, withAlpha(p.cloud, a), true);
    }
  }

  private drawChimney(r: Renderer, p: Palette, dx: number, dy: number): void {
    const move = (pts: readonly Vec2[]): Vec2[] => pts.map((q) => vec2(q.x + dx, q.y + dy));
    const style: ShapeStyle = {
      fill: p.brick,
      shade: lerpColor(p.brick, p.ink, 0.35),
      highlight: lerpColor(p.brick, p.mushroomSpot, 0.3),
      outline: p.ink,
      outlineWidth: 2,
    };
    const body = r.mask().polygon(move(CHIMNEY));
    r.shape(body, style);
    // Hàng gạch: đường ngang Bresenham + mạch dọc so le
    const mortar = lerpColor(p.brick, p.ink, 0.45);
    for (let row = 0; row < 5; row++) {
      const y = 205 + row * 9 + dy;
      r.line(483 + dx, y, 511 + dx, y, mortar, 1, 'bresenham');
      for (let x = 488 + (row % 2) * 8; x < 510; x += 16) {
        r.line(x + dx, y - 9, x + dx, y, mortar, 1, 'bresenham');
      }
    }
    r.shape(r.mask().polygon(move(CHIMNEY_TOP)), style);
  }

  private drawGills(r: Renderer, p: Palette, dx: number, dy: number): void {
    const cx = GILLS.cx + dx;
    const cy = GILLS.cy + dy;
    const gillColor = lerpColor(p.mushroomStem, p.mushroomCapDark, 0.2);
    r.shape(r.mask().ellipse(cx, cy, GILLS.rx, GILLS.ry), {
      fill: gillColor,
      shade: lerpColor(gillColor, p.mushroomCapDark, 0.35),
      outline: p.ink,
      outlineWidth: 2,
    });
    // Nếp mang nấm: các đoạn Bresenham toả ra từ giữa
    const line = lerpColor(gillColor, p.mushroomCapDark, 0.45);
    for (let k = 1; k < 16; k++) {
      const a = (k / 16) * Math.PI;
      r.line(
        cx + Math.cos(a) * GILLS.rx * 0.3, cy + Math.sin(a) * GILLS.ry * 0.3,
        cx + Math.cos(a) * GILLS.rx * 0.92, cy + Math.sin(a) * GILLS.ry * 0.85,
        line, 1, 'bresenham',
      );
    }
  }

  private drawCap(r: Renderer, p: Palette, dx: number, dy: number): void {
    const cx = CAP.cx + dx;
    const cy = CAP.cy + dy;

    // Mũ = nửa trên elip lớn (trừ phần dưới) ∪ elip vành
    const cap = r.mask().ellipse(cx, cy, CAP.rx, CAP.ry);
    const lower = r.mask().polygon([
      vec2(cx - CAP.rx - 4, cy + 2), vec2(cx + CAP.rx + 4, cy + 2),
      vec2(cx + CAP.rx + 4, cy + CAP.ry + 4), vec2(cx - CAP.rx - 4, cy + CAP.ry + 4),
    ]);
    cap.subtract(lower);
    cap.ellipse(CAP_RIM.cx + dx, CAP_RIM.cy + dy, CAP_RIM.rx, CAP_RIM.ry);

    r.shape(cap, {
      fill: p.mushroomCap,
      shade: p.mushroomCapDark,
      highlight: lerpColor(p.mushroomCap, p.mushroomSpot, 0.35),
    });

    // Đốm: hợp các hình tròn, clip trong mũ nên đốm sát mép bị cắt gọn
    const spots = r.mask();
    for (const s of SPOTS) spots.circle(s.x + dx, s.y + dy, s.r);
    r.shape(spots, {
      fill: p.mushroomSpot,
      shade: lerpColor(p.mushroomSpot, p.mushroomCap, 0.3),
      clip: cap,
    });

    // Vành mũ: dải tối ở nửa dưới vành
    const rimBand = r.mask().ellipse(CAP_RIM.cx + dx, CAP_RIM.cy + dy, CAP_RIM.rx, CAP_RIM.ry);
    rimBand.subtract(r.mask().ellipse(CAP_RIM.cx + dx, CAP_RIM.cy + dy - 9, CAP_RIM.rx - 4, CAP_RIM.ry));
    r.shape(rimBand, { fill: p.mushroomCapDark, clip: cap });

    // Viền mực vẽ sau cùng để nằm trên đốm và dải vành
    r.shape(cap, { fill: 0x00000000, outline: p.ink, outlineWidth: 2 });
  }

  private drawWindow(
    r: Renderer, p: Palette, c: Vec2, radius: number, night: number, time: number, phase: number,
  ): void {
    // Quầng sáng ban đêm (nhấp nháy nhẹ)
    if (night > 0) {
      const pulse = 0.85 + 0.15 * Math.sin(time * 2 + phase);
      r.circle(c.x, c.y, radius * 2.4, withAlpha(p.windowGlow, 0.1 * night * pulse), true);
      r.circle(c.x, c.y, radius * 1.6, withAlpha(p.windowGlow, 0.18 * night * pulse), true);
    }
    // Khung gỗ tròn
    r.shape(r.mask().circle(c.x, c.y, radius), {
      fill: p.wood,
      shade: p.woodDark,
      highlight: lerpColor(p.wood, p.door, 0.6),
      outline: p.ink,
      outlineWidth: 2,
    });
    // Kính: ban ngày màu kính, ban đêm sáng dần lên
    const glass = lerpColor(dayGlass(p), p.windowGlow, night);
    r.shape(r.mask().circle(c.x, c.y, radius * 0.72), {
      fill: glass,
      highlight: lerpColor(glass, p.mushroomSpot, 0.5),
      outline: p.woodDark,
      outlineWidth: 1,
    });
    // Song cửa chữ thập
    const bar = radius * 0.72;
    r.line(c.x - bar, c.y, c.x + bar, c.y, p.woodDark, 3);
    r.line(c.x, c.y - bar, c.x, c.y + bar, p.woodDark, 3);
  }

  private drawDoor(r: Renderer, p: Palette, night: number): void {
    // Khung vòm đá quanh cửa
    const frame = r.mask().polygon(this.poly(this.root, doorPolygon(5), HOUSE_BASE));
    r.shape(frame, {
      fill: lerpColor(p.mushroomStem, p.stone, 0.6),
      shade: p.stoneDark,
      outline: p.ink,
      outlineWidth: 2,
    });

    // Lòng nhà sau cánh cửa: ban ngày tối, ban đêm có đèn trong nhà
    const opening = this.poly(this.root, doorPolygon(0), HOUSE_BASE);
    const inside = lerpColor(lerpColor(p.ink, p.trunkDark, 0.4), p.windowGlow, night * 0.85);
    r.shape(r.mask().polygon(opening), {
      fill: inside,
      highlight: lerpColor(inside, p.ink, 0.5),
      outline: p.ink,
      outlineWidth: 2,
    });

    // Cánh cửa: hình cửa local (gốc ở bản lề) biến đổi theo Node bản lề
    const hinge = vec2(DOOR.x0, DOOR.yBottom);
    const leaf = this.poly(this.doorHinge, doorPolygon(0), hinge);
    r.shape(r.mask().polygon(leaf), {
      fill: p.door,
      shade: lerpColor(p.door, p.woodDark, 0.6),
      highlight: lerpColor(p.door, p.mushroomSpot, 0.3),
      outline: p.ink,
      outlineWidth: 2,
    });

    // Chi tiết trên cánh cửa cũng đi qua cùng ma trận bản lề nên co theo cánh cửa
    const m = this.doorHinge.worldMatrix();
    const at = (x: number, y: number): Vec2 => mat3Apply(m, vec2(x - DOOR.x0, y - DOOR.yBottom));
    const cx = (DOOR.x0 + DOOR.x1) / 2;
    const plank = lerpColor(p.door, p.woodDark, 0.7);
    for (const off of [-15, 0, 15]) {
      const top = DOOR.yTop - Math.sqrt(DOOR.archR ** 2 - off ** 2) + 4;
      const a = at(cx + off, top);
      const b = at(cx + off, DOOR.yBottom - 3);
      r.line(a.x, a.y, b.x, b.y, plank, 1, 'bresenham');
    }
    for (const y of [DOOR.yBottom - 72, DOOR.yBottom - 24]) {
      const a = at(DOOR.x0 + 3, y);
      const b = at(cx - 6, y);
      r.line(a.x, a.y, b.x, b.y, p.inkSoft, 3);
    }
    const knob = at(cx + 16, DOOR.yBottom - 44);
    const knobTop = at(cx + 16, DOOR.yBottom - 50);
    r.circle(knob.x, knob.y, 6 * this.doorHinge.transform.scaleX, p.inkSoft, false);
    r.circle(knobTop.x, knobTop.y, 2, p.inkSoft, true);

  }

  /** Ban đêm, cửa mở thì ánh đèn trong nhà hắt ra bậc thềm (vẽ sau bậc thềm). */
  private drawDoorLight(r: Renderer, p: Palette, night: number): void {
    if (night <= 0 || this.doorOpen <= 0) return;
    const a = 0.25 * night * this.doorOpen;
    const spill = this.poly(this.root, [
      vec2(DOOR.x0, DOOR.yBottom), vec2(DOOR.x1, DOOR.yBottom),
      vec2(DOOR.x1 + 40, DOOR.yBottom + 44), vec2(DOOR.x0 + 6, DOOR.yBottom + 44),
    ], HOUSE_BASE);
    r.polygon(spill, withAlpha(p.windowGlow, a), true);
  }

  private drawLantern(r: Renderer, p: Palette, night: number, time: number): void {
    const hook = this.at(this.lantern);
    // Cần treo cố định trên tường
    r.line(hook.x - 14, hook.y, hook.x, hook.y, p.woodDark, 3);
    r.line(hook.x - 14, hook.y - 8, hook.x - 14, hook.y + 8, p.woodDark, 3);

    // Thân đèn (đung đưa theo node lantern)
    const m = this.lantern.worldMatrix();
    const local = (pts: [number, number][]): Vec2[] => transformPoints(m, pts.map(([x, y]) => vec2(x, y)));
    r.line(hook.x, hook.y, mat3Apply(m, vec2(0, 6)).x, mat3Apply(m, vec2(0, 6)).y, p.ink, 1, 'bresenham');
    const lit = lerpColor(dayGlass(p), p.windowGlow, night);
    if (night > 0) {
      const c = mat3Apply(m, vec2(0, 18));
      const pulse = 0.8 + 0.2 * Math.sin(time * 3.1);
      r.circle(c.x, c.y, 34, withAlpha(p.windowGlow, 0.1 * night * pulse), true);
      r.circle(c.x, c.y, 20, withAlpha(p.windowGlow, 0.2 * night * pulse), true);
    }
    r.shape(r.mask().polygon(local([[-5, 6], [5, 6], [9, 12], [-9, 12]])), { fill: p.ink, outline: p.ink, outlineWidth: 1 });
    r.shape(r.mask().polygon(local([[-8, 12], [8, 12], [7, 28], [-7, 28]])), {
      fill: lit,
      highlight: lerpColor(lit, p.mushroomSpot, 0.5),
      outline: p.ink,
      outlineWidth: 2,
    });
    r.shape(r.mask().polygon(local([[-9, 28], [9, 28], [6, 32], [-6, 32]])), { fill: p.ink, outline: p.ink, outlineWidth: 1 });
  }
}

