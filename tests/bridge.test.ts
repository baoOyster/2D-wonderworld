
import { describe, it, expect } from 'vitest';

import {
  BRIDGE,
  Bridge,
  bridgePoint,
  bridgeNormal,
  bridgeDeckPolygon,
  bridgePlanks,
  bridgePosts
} from '../src/scene/lakeside/bridge.ts';
import { vi } from 'vitest';

import type {
  Env,
  ClickContext
} from '../src/scene/types.ts';

import {
  segmentHitPolygon
} from '../src/scene/lakeside/bridge.ts';

import { Layer } from '../src/scene/layers.ts';

describe('Bridge geometry', () => {
  it('has correct endpoints', () => {
    expect(bridgePoint(0)).toEqual({
      x: 860,
      y: 520
    });

    expect(bridgePoint(1).x).toBeCloseTo(1120);
    expect(bridgePoint(1).y).toBeCloseTo(520);
  });

  it('has correct arch peak', () => {
    const peak = bridgePoint(0.5);

    expect(peak.x).toBeCloseTo(990);
    expect(peak.y).toBeCloseTo(462);
  });

  it('creates 20 planks', () => {
    const planks = bridgePlanks();

    expect(planks).toHaveLength(20);

    for (const plank of planks) {
      const length = Math.hypot(
        plank.b.x - plank.a.x,
        plank.b.y - plank.a.y
      );

      expect(length).toBeCloseTo(10);
    }
  });

  it('keeps planks perpendicular to the arch', () => {
    const t = 0.25;
    const n = bridgeNormal(t);

    const dx = BRIDGE.rightX - BRIDGE.leftX;
    const dy = -BRIDGE.archHeight *
      Math.PI * Math.cos(Math.PI * t);

    // Pháp tuyến vuông góc tiếp tuyến
    expect(dx * n.x + dy * n.y)
      .toBeCloseTo(0);
  });

  it('creates seven railing posts', () => {
    const posts = bridgePosts();

    expect(posts).toHaveLength(7);

    for (const post of posts) {
      expect(post.a.y - post.b.y)
        .toBeCloseTo(BRIDGE.railHeight + 2);
    }
  });

  it('creates a valid deck polygon', () => {
    const deck = bridgeDeckPolygon();

    expect(deck).toHaveLength(50);

    for (const point of deck) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('provides interactive scene metadata', () => {
    const bridge = new Bridge();

    expect(bridge.id).toBe('bridge');
    expect(bridge.name).toBe('Cầu gỗ');
    expect(bridge.layer).toBe(Layer.BRIDGE);
    expect(bridge.interactive).toBe(true);
    expect(bridge.root.children).toContain(bridge.deckNode);
  });
});


describe('Bridge hit-test', () => {
  it('creates valid hit polygons for a segment', () => {
    const polygon = segmentHitPolygon(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      5
    );

    expect(polygon).toHaveLength(4);

    for (const p of polygon) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('handles zero-length segments', () => {
    const polygon = segmentHitPolygon(
      { x: 10, y: 10 },
      { x: 10, y: 10 }
    );

    expect(polygon).toHaveLength(4);
  });

  it('includes deck, posts and railings', () => {
    const bridge = new Bridge();

    // hitPolygons hiện không đọc env
    const areas = bridge.hitPolygons({} as Env);

    expect(areas.length).toBeGreaterThan(30);

    for (const polygon of areas) {
      expect(polygon.length).toBeGreaterThanOrEqual(3);

      for (const point of polygon) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });
});


describe('Bridge animation', () => {
  it('selects the bridge when clicked', () => {
    const bridge = new Bridge();
    const select = vi.fn();

    bridge.onClick({
      ui: { select }
    } as unknown as ClickContext);

    expect(select).toHaveBeenCalledWith(bridge);
  });

  it('moves the deck after a click', () => {
    const bridge = new Bridge();

    bridge.onClick({
      ui: { select: vi.fn() }
    } as unknown as ClickContext);

    const env = {
      dt: 1 / 60
    } as Env;

    let maxOffset = 0;

    for (let i = 0; i < 15; i++) {
      bridge.update(env);

      maxOffset = Math.max(
        maxOffset,
        Math.abs(bridge.deckNode.transform.y)
      );
    }

    expect(maxOffset).toBeGreaterThan(0);
    expect(maxOffset).toBeLessThanOrEqual(3);
  });

  it('returns the deck to its initial position', () => {
    const bridge = new Bridge();

    bridge.onClick({
      ui: { select: vi.fn() }
    } as unknown as ClickContext);

    const env = {
      dt: 1 / 60
    } as Env;

    // Mô phỏng 36 frame = 0,6 giây
    for (let i = 0; i < 36; i++) {
      bridge.update(env);
    }

    expect(bridge.deckNode.transform.y).toBe(0);
  });

  it('restarts the bounce when clicked again', () => {
    const bridge = new Bridge();

    const ctx = {
      ui: { select: vi.fn() }
    } as unknown as ClickContext;

    const env = { dt: 1 / 60 } as Env;

    bridge.onClick(ctx);
    bridge.update(env);
    bridge.update(env);

    bridge.onClick(ctx);

    expect(bridge.deckNode.transform.y).not.toBeNaN();

    bridge.update(env);

    expect(bridge.deckNode.transform.y).not.toBe(0);
  });
});
