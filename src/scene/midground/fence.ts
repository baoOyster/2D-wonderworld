/**
 * Hàng rào gỗ (#16): 2 đoạn hai bên nhà nấm, không tương tác.
 *
 * Thuật toán dùng:
 * - Thanh ngang: nét dày dọc đoạn thẳng, mép trên/dưới kẻ bằng Bresenham.
 * - Trụ: đa giác đầu vát nhọn, tô scanline; mọi trụ gộp một mask rồi tô 3 tông + viền.
 * - Biến đổi lặp: mỗi trụ là một Node con, translate + scale hơi khác nhau
 *   từ cùng một hình trụ mẫu.
 * - Bóng chân trụ: elip alpha.
 *
 * Toạ độ world 1280×720. Hai đoạn đặt theo nhà nấm sau khi hạ xuống mặt đất
 * (xem `HOUSE_DROP` trong mushroom-house.ts).
 */
import { lerpColor } from '../../core/color.ts';
import { ellipsePolygon, mat3Apply, transformPoints } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import { vec2, type Vec2 } from '../../core/vec2.ts';
import { Layer } from '../layers.ts';
import { HOUSE_SHIFT } from './mushroom-house.ts';
import type { Env, SceneObject } from '../types.ts';

/** Một đoạn rào: chân trụ đầu và cuối (đường chân hơi dốc theo đất), số trụ, chiều cao. */
export interface FenceSegment {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly posts: number;
  readonly height: number;
}

/** Cả hai đoạn đứng trên gò đất: đoạn trái trước thân nhà (chừa cửa), đoạn phải ngắn giữa bậc thềm và mép phải gò. */
export const FENCE_SEGMENTS: readonly FenceSegment[] = [
  { from: vec2(292 + HOUSE_SHIFT, 510), to: vec2(442 + HOUSE_SHIFT, 510), posts: 6, height: 38 },
  { from: vec2(570 + HOUSE_SHIFT, 510), to: vec2(590 + HOUSE_SHIFT, 510), posts: 2, height: 38 },
];

/** Trụ mẫu (local): rộng 10, đầu vát nhọn, chân tại (0,0), cao 1 (nhân theo scale). */
const POST: readonly Vec2[] = [
  vec2(-5, 0), vec2(5, 0), vec2(5, -0.82), vec2(0, -1), vec2(-5, -0.82),
];

/** Độ cao 2 thanh ngang, tính theo phần chiều cao trụ. */
const RAILS = [0.35, 0.72] as const;

export class Fence implements SceneObject {
  readonly id = 'fence';
  readonly name = 'Hàng rào';
  readonly description = 'Hàng rào gỗ thấp hai bên nhà nấm.';
  readonly algorithms: readonly string[] = [
    'Bresenham (mép thanh ngang)',
    'Nét dày (thanh ngang)',
    'Scanline polygon fill (trụ)',
    'Biến đổi lặp: mỗi trụ là Node translate + scale',
    'Alpha blending (bóng chân trụ)',
  ];
  readonly layer = Layer.FENCE;
  readonly interactive = false;

  /** Node gốc của từng đoạn và các trụ con. */
  readonly segments: readonly { root: Node; posts: readonly Node[]; seg: FenceSegment }[];

  constructor() {
    this.segments = FENCE_SEGMENTS.map((seg) => {
      const root = new Node();
      root.transform.x = seg.from.x;
      root.transform.y = seg.from.y;
      const posts: Node[] = [];
      for (let i = 0; i < seg.posts; i++) {
        const t = seg.posts === 1 ? 0 : i / (seg.posts - 1);
        const node = new Node();
        node.transform.x = (seg.to.x - seg.from.x) * t;
        node.transform.y = (seg.to.y - seg.from.y) * t;
        // Mỗi trụ cao thấp khác nhau một chút (cố định, không random)
        node.transform.scaleX = 1;
        node.transform.scaleY = seg.height * (0.94 + 0.06 * Math.sin(i * 2.3 + seg.from.x));
        root.add(node);
        posts.push(node);
      }
      return { root, posts, seg };
    });
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    for (const { posts, seg } of this.segments) {
      const feet = posts.map((n) => mat3Apply(n.worldMatrix(), vec2(0, 0)));

      // Bóng chân trụ
      for (const f of feet) r.polygon(ellipsePolygon(f.x + 3, f.y, 9, 3, 12), p.shadow, true);

      // Thanh ngang: vẽ trước để trụ che mối nối
      const first = feet[0];
      const last = feet[feet.length - 1];
      for (const k of RAILS) {
        const y0 = first.y - seg.height * k;
        const y1 = last.y - seg.height * k;
        r.line(first.x - 6, y0, last.x + 6, y1, lerpColor(p.fence, p.fenceDark, 0.25), 5);
        r.line(first.x - 6, y0 - 3, last.x + 6, y1 - 3, p.ink, 1, 'bresenham');
        r.line(first.x - 6, y0 + 3, last.x + 6, y1 + 3, p.ink, 1, 'bresenham');
      }

      // Trụ: cùng một hình mẫu, mỗi trụ biến đổi theo Node của nó; gộp một mask
      const postMask = r.mask();
      for (const n of posts) postMask.polygon(transformPoints(n.worldMatrix(), POST));
      r.shape(postMask, {
        fill: p.fence,
        shade: p.fenceDark,
        highlight: lerpColor(p.fence, p.mushroomSpot, 0.35),
        outline: p.ink,
        outlineWidth: 2,
      });
    }
  }
}
