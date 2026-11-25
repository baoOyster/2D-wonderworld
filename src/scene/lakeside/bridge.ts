
import { Node } from '../../core/node.ts';
import { Layer } from '../layers.ts';
import type { Vec2 } from '../../core/vec2.ts';
import type {
  SceneObject,
  Env,
  ClickContext
} from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';

export const BRIDGE = {
  leftX: 860,
  rightX: 1120,
  groundY: 520,
  archHeight: 58,
  deckThickness: 12,
  railHeight: 40,
  plankCount: 20,
  postCount: 7,
  segments: 24
} as const;

/** Tọa độ trên cung vòm theo tham số t = 0..1. */
export function bridgePoint(t: number): Vec2 {
  const x = BRIDGE.leftX +
    (BRIDGE.rightX - BRIDGE.leftX) * t;

  const y = BRIDGE.groundY -
    BRIDGE.archHeight * Math.sin(Math.PI * t);

  return { x, y };
}

/** Vector pháp tuyến hướng xuống mặt cầu. */
export function bridgeNormal(t: number): Vec2 {
  const dx = BRIDGE.rightX - BRIDGE.leftX;

  const dy = -BRIDGE.archHeight *
    Math.PI * Math.cos(Math.PI * t);

  const len = Math.hypot(dx, dy);

  return {
    x: -dy / len,
    y: dx / len
  };
}

/** Tạo đa giác mặt cầu từ 25 điểm trên cung vòm. */
export function bridgeDeckPolygon(
  offsetY = 0
): Vec2[] {
  const upper: Vec2[] = [];
  const lower: Vec2[] = [];

  for (let i = 0; i <= BRIDGE.segments; i++) {
    const t = i / BRIDGE.segments;
    const p = bridgePoint(t);
    const n = bridgeNormal(t);

    upper.push({
      x: p.x,
      y: p.y + offsetY
    });

    lower.push({
      x: p.x + n.x * BRIDGE.deckThickness,
      y: p.y + n.y * BRIDGE.deckThickness
        + offsetY
    });
  }

  return [...upper, ...lower.reverse()];
}

export interface BridgeSegment {
  a: Vec2;
  b: Vec2;
}

/** Vị trí các khe ván vuông góc với cung vòm. */
export function bridgePlanks(
  offsetY = 0
): BridgeSegment[] {
  const segments: BridgeSegment[] = [];

  for (let i = 0; i < BRIDGE.plankCount; i++) {
    const t = (i + 0.5) / BRIDGE.plankCount;
    const p = bridgePoint(t);
    const n = bridgeNormal(t);

    segments.push({
      a: {
        x: p.x + n.x,
        y: p.y + n.y + offsetY
      },
      b: {
        x: p.x + n.x * 11,
        y: p.y + n.y * 11 + offsetY
      }
    });
  }

  return segments;
}

/** Vị trí 7 trụ lan can. */
export function bridgePosts(): BridgeSegment[] {
  return Array.from(
    { length: BRIDGE.postCount },
    (_, i) => {
      const t = i / (BRIDGE.postCount - 1);
      const p = bridgePoint(t);

      return {
        a: { x: p.x, y: p.y + 2 },
        b: { x: p.x, y: p.y - BRIDGE.railHeight }
      };
    }
  );
}


/**
 * Tạo đa giác bao quanh một đoạn thẳng.
 * Dùng để nhận click trên thanh lan can.
 *
 * padding là độ dày vùng nhận click.
 */
export function segmentHitPolygon(
  a: Vec2,
  b: Vec2,
  padding = 6
): Vec2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return [
      { x: a.x - padding, y: a.y - padding },
      { x: a.x + padding, y: a.y - padding },
      { x: a.x + padding, y: a.y + padding },
      { x: a.x - padding, y: a.y + padding }
    ];
  }

  const nx = -dy / length * padding;
  const ny = dx / length * padding;

  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny }
  ];
}


export class Bridge implements SceneObject {
  readonly id = 'bridge';
  readonly name = 'Cầu gỗ';
  readonly description =
    'Cây cầu gỗ hình vòm bắc qua hồ nước.';
  readonly algorithms = [
    'DDA',
    'Bresenham',
    'Scanline Polygon Fill',
    'Biến đổi 2D'
  ];
  readonly layer = Layer.BRIDGE;
  readonly interactive = true;

  readonly root = new Node();
  readonly deckNode = new Node();

  private elapsed = 0;
  private animating = false;

  constructor() {
    this.root.add(this.deckNode);
  }

  update(env: Env): void {
    if (!this.animating) return;

    this.elapsed += env.dt;

    if (this.elapsed >= 0.5) {
      this.animating = false;
      this.deckNode.transform.y = 0;
      return;
    }

    // Nhún và dao động tắt dần trong 0,5 giây.
    this.deckNode.transform.y =
      2.8 *
      Math.exp(-3 * this.elapsed) *
      Math.sin(10 * Math.PI * this.elapsed);
  }

  draw(r: Renderer, env: Env): void {
    const p = env.palette;
    const offset = this.deckNode.transform.y;

    // 1. Bóng đổ trên mặt hồ
    const shadow = r.mask();
    shadow.ellipse(990, 540, 125, 15);

    r.shape(shadow, { fill: p.shadow });

    // 2. Mặt cầu
    const deck = r.mask();
    deck.polygon(bridgeDeckPolygon(offset));

    r.shape(deck, {
      fill: p.wood,
      shade: p.woodDark,
      highlight: p.trunkLight,
      outline: p.ink,
      outlineWidth: 2
    });

    // 3. Ván cầu: DDA
    // Các đoạn ngắn nằm theo pháp tuyến cung vòm.
    bridgePlanks(offset).forEach((segment, i) => {
      r.line(
        segment.a.x,
        segment.a.y,
        segment.b.x,
        segment.b.y,
        i % 2 === 0 ? p.inkSoft : p.woodDark,
        1,
        'dda'
      );
    });

    // 4. Lan can: 7 trụ
    for (const post of bridgePosts()) {
      r.line(
        post.a.x, post.a.y,
        post.b.x, post.b.y,
        p.ink, 7, 'bresenham'
      );

      r.line(
        post.a.x, post.a.y,
        post.b.x, post.b.y,
        p.wood, 4, 'bresenham'
      );

      // Đầu trụ có viền ink
      const cap = [
        { x: post.b.x - 4, y: post.b.y - 3 },
        { x: post.b.x + 4, y: post.b.y - 3 },
        { x: post.b.x + 4, y: post.b.y + 3 },
        { x: post.b.x - 4, y: post.b.y + 3 }
      ];

      const capMask = r.mask();
      capMask.polygon(cap);
      r.shape(capMask, {
        fill: p.wood,
        outline: p.ink,
        outlineWidth: 1
      });
    }

    // 5. Thanh lan can uốn theo vòm
    for (let i = 0; i < BRIDGE.segments; i++) {
      const a = bridgePoint(i / BRIDGE.segments);
      const b = bridgePoint((i + 1) / BRIDGE.segments);

      r.line(
        a.x, a.y - 34,
        b.x, b.y - 34,
        p.ink, 5, 'bresenham'
      );

      r.line(
        a.x, a.y - 34,
        b.x, b.y - 34,
        p.wood, 3, 'bresenham'
      );
    }

    // 6. Giằng chéo lan can
    const posts = bridgePosts();

    for (let i = 0; i < posts.length - 1; i++) {
      const a = posts[i];
      const b = posts[i + 1];

      r.line(
        a.a.x, a.a.y - 4,
        b.b.x, b.b.y + 6,
        p.inkSoft, 1, 'bresenham'
      );
    }
  }

  
hitPolygons(_env: Env): Vec2[][] {
  const areas: Vec2[][] = [];

  // 1. Mặt cầu
  areas.push(
    bridgeDeckPolygon(this.deckNode.transform.y)
  );

  // 2. Các trụ lan can
  const posts = bridgePosts();

  for (const post of posts) {
    areas.push(
      segmentHitPolygon(post.a, post.b, 6)
    );
  }

  // 3. Thanh lan can cong
  for (let i = 0; i < BRIDGE.segments; i++) {
    const a = bridgePoint(i / BRIDGE.segments);
    const b = bridgePoint((i + 1) / BRIDGE.segments);

    areas.push(
      segmentHitPolygon(
        { x: a.x, y: a.y - 34 },
        { x: b.x, y: b.y - 34 },
        5
      )
    );
  }

  // 4. Giằng chéo giữa các trụ
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i];
    const b = posts[i + 1];

    areas.push(
      segmentHitPolygon(
        { x: a.a.x, y: a.a.y - 4 },
        { x: b.b.x, y: b.b.y + 6 },
        4
      )
    );
  }

  return areas;
}


  onClick(ctx: ClickContext): void {
    ctx.ui.select(this);

    this.elapsed = 0;
    this.animating = true;
  }
}
