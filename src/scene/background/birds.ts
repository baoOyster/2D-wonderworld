import { withAlpha } from '../../core/color.ts';
import { mat3Apply } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface BirdState { x: number; y: number; speed: number; phase: number; trigger: number; wasNear: boolean; left: Node; right: Node; }
const BIRDS: BirdState[] = [
  { x: 1065, y: 215, speed: 11, phase: 0.4, trigger: -Infinity, wasNear: false, left: new Node(), right: new Node() },
  { x: 1137, y: 190, speed: 14, phase: 2.1, trigger: -Infinity, wasNear: false, left: new Node(), right: new Node() },
];
const FLY_MIN = 860, FLY_RANGE = 380;

function birdPosition(bird: BirdState, time: number): Vec2 {
  return {
    x: FLY_MIN + (((bird.x - FLY_MIN + time * bird.speed) % FLY_RANGE) + FLY_RANGE) % FLY_RANGE,
    y: bird.y + Math.sin(time * 0.8 + bird.phase) * 6,
  };
}

export class Birds implements SceneObject {
  readonly id = 'birds'; readonly name = 'Chim';
  readonly description = 'Hai chú chim bay vòng trên hồ, chỉ xuất hiện ban ngày.';
  readonly algorithms = ['Midpoint ellipse', 'Node wing transform', 'Damped flight response', 'World wrap'];
  readonly layer = Layer.BIRD; readonly interactive = false;

  draw(r: Renderer, env: Env): void {
    const visibility = Math.max(0, Math.min(1, (0.4 - env.dayPhase) / 0.4));
    if (visibility <= 0) return;
    const pointer = (env as Env & { pointer?: Vec2 | null }).pointer;
    const bodyColor = withAlpha(env.palette.inkSoft, visibility);
    for (const bird of BIRDS) {
      const position = birdPosition(bird, env.time);
      const near = !!pointer && Math.hypot(pointer.x - position.x, pointer.y - position.y) < 70;
      if (near && !bird.wasNear) bird.trigger = env.time;
      bird.wasNear = near;
      const age = env.time - bird.trigger;
      const flight = age >= 0 && age < 1.8 ? 118 * (1 - Math.exp(-10 * age)) * Math.exp(-2.4 * age) : 0;
      const y = position.y - flight;
      const flapRate = near ? 24 : 9;
      const flap = Math.sin(env.time * flapRate + bird.phase) * (near ? 0.8 : 0.42);
      bird.left.transform = { x: position.x + 1, y: y - 1, rotation: flap, scaleX: 1, scaleY: 1 };
      bird.right.transform = { x: position.x - 2, y: y - 1, rotation: -flap, scaleX: 1, scaleY: 1 };

      // Far wing first, then a clear body/head silhouette, then the near wing.
      const wingShape = [
        { x: 0, y: 0 }, { x: 3, y: -6 }, { x: 11, y: -15 },
        { x: 9, y: -6 }, { x: 6, y: -1 }, { x: 2, y: 2 },
      ];
      r.polygon(wingShape.map((point) => mat3Apply(bird.left.worldMatrix(), point)), bodyColor);
      r.polygon([
        { x: position.x - 10, y }, { x: position.x - 17, y: y - 4 },
        { x: position.x - 14, y: y + 1 }, { x: position.x - 18, y: y + 4 },
        { x: position.x - 8, y: y + 3 },
      ], bodyColor);
      r.ellipse(position.x, y, 10, 5, bodyColor, true);
      r.circle(position.x + 7, y - 3, 4.2, bodyColor, true);
      r.polygon(wingShape.map((point) => mat3Apply(bird.right.worldMatrix(), point)), bodyColor);
      r.polygon([
        { x: position.x + 10, y: y - 4 }, { x: position.x + 17, y: y - 2 }, { x: position.x + 11, y },
      ], withAlpha(env.palette.flowerYellow, visibility));
      r.circle(position.x + 8, y - 4, 1.1, withAlpha(env.palette.mushroomSpot, visibility), true);
    }
  }
}
