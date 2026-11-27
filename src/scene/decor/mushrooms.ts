import { withAlpha } from '../../core/color.ts';
import { mat3Apply, mat3Multiply, mat3Rotate, mat3Translate, ellipsePolygon, transformPoints } from '../../core/mat3.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

interface Mushroom { x: number; y: number; capRx: number; capRy: number; stemH: number; small?: boolean; angle?: number; glowPhase?: number; }
const LARGE: Mushroom[] = [
  { x: 125, y: 423, capRx: 38, capRy: 25, stemH: 30, glowPhase: 0 },
  { x: 172, y: 462, capRx: 31, capRy: 20, stemH: 27, glowPhase: 2.1 },
  { x: 60, y: 626, capRx: 96, capRy: 42, stemH: 62, glowPhase: 4.2 },
];
const SMALL: Mushroom[] = (() => {
  const result: Mushroom[] = [];
  for (const [cx, cy, seed] of [[220, 476, 0x1811], [790, 485, 0x1822]] as const) {
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    for (let i = 0; i < 5; i++) {
      const h = 18 + random() * 22;
      result.push({ x: cx + (i - 2) * 13 + random() * 5, y: cy + (i % 2) * 4, capRx: 8 + random() * 7, capRy: 5 + random() * 5, stemH: h * 0.58, small: true, angle: (random() - 0.5) * 0.08 });
    }
  }
  return result;
})();

function capShape(m: Mushroom): Vec2[] {
  const points = ellipsePolygon(0, -m.stemH, m.capRx, m.capRy, 32);
  // Keep the lower half of the ellipse to form a shallow dome with a flat brim.
  const upper = points.filter((p) => p.y <= m.y - m.stemH);
  return [{ x: -m.capRx, y: -m.stemH }, ...upper, { x: m.capRx, y: -m.stemH }];
}

function drawOne(r: Renderer, env: Env, m: Mushroom): void {
  const rotation = m.angle ?? 0;
  const transform = mat3Multiply(mat3Translate(m.x, m.y), mat3Rotate(rotation));
  const stemLocal = [
    { x: -m.capRx * 0.32, y: -m.stemH }, { x: m.capRx * 0.32, y: -m.stemH },
    { x: m.capRx * 0.22, y: 0 }, { x: -m.capRx * 0.22, y: 0 },
  ];
  const stem = transformPoints(transform, stemLocal);
  const cap = transformPoints(transform, capShape(m));
  const stemMask = r.mask(); stemMask.polygon(stem);
  r.shape(stemMask, { fill: env.palette.mushroomStem, shade: env.palette.mushroomCapDark, highlight: env.palette.mushroomSpot, outline: env.palette.ink, outlineWidth: 1 });
  const capMask = r.mask(); capMask.polygon(cap);
  if (!m.small && env.dayPhase > 0.35) r.ellipse(m.x, m.y - m.stemH - 4, m.capRx * 1.1, m.capRy * 1.2, withAlpha(env.palette.mushroomSpot, 0.11), true);
  r.shape(capMask, { fill: env.palette.mushroomCap, shade: env.palette.mushroomCapDark, highlight: env.palette.flowerRed, outline: env.palette.ink, outlineWidth: 1 });
  const spots = r.mask();
  const radius = m.small ? 2 : Math.max(3, m.capRx * 0.09);
  const spotPoints: Vec2[] = [];
  for (const [dx, dy, scale] of [[-0.48, -0.18, 0.7], [-0.16, -0.52, 0.65], [0.2, -0.27, 0.82], [0.5, -0.48, 0.58], [0.43, 0.06, 0.55]] as const) {
    const point = mat3Apply(transform, { x: dx * m.capRx, y: -m.stemH + dy * m.capRy });
    spots.circle(point.x, point.y, radius * scale);
    spotPoints.push(point);
  }
  if (!m.small && env.dayPhase > 0.25) {
    const night = Math.max(0, Math.min(1, (env.dayPhase - 0.25) / 0.75));
    const pulse = 0.5 + 0.5 * Math.sin(env.time * 1.15 + (m.glowPhase ?? 0));
    for (const point of spotPoints) {
      r.circle(point.x, point.y, radius * 2.8, withAlpha(env.palette.mushroomSpot, night * (0.12 + pulse * 0.22)), true);
      r.circle(point.x, point.y, radius * 1.65, withAlpha(env.palette.mushroomSpot, night * (0.22 + pulse * 0.3)), true);
    }
  }
  r.shape(spots, { fill: env.palette.mushroomSpot, clip: capMask });
}

export class Mushrooms implements SceneObject {
  readonly id = 'mushrooms'; readonly name = 'Nấm rừng';
  readonly description = 'Nấm lớn và nấm nhỏ mọc thành cụm quanh gốc cây và ven lối đi.';
  readonly algorithms = ['Ellipse polygon', 'Node-style transform', 'Mask clipping', 'Midpoint circle'];
  readonly layer = Layer.SMALL_DECOR; readonly interactive = false;
  draw(r: Renderer, env: Env): void { for (const mushroom of LARGE) drawOne(r, env, mushroom); for (const mushroom of SMALL) drawOne(r, env, mushroom); }
}
