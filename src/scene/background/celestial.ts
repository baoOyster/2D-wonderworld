import { lerpColor, withAlpha } from '../../core/color.ts';
import { Layer } from '../layers.ts';
import type { ClickContext, Env, SceneObject } from '../types.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { Vec2 } from '../../core/vec2.ts';

const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const SUN = { x: 1188, y: 85, r: 34 }, MOON = { x: 1188, y: 150, r: 30 };
function disk(cx: number, cy: number, radius: number, count = 32): Vec2[] {
  return Array.from({ length: count }, (_, i) => ({ x: cx + Math.cos(i * Math.PI * 2 / count) * radius, y: cy + Math.sin(i * Math.PI * 2 / count) * radius }));
}

export class Celestial implements SceneObject {
  readonly id = 'celestial'; readonly name = 'Mặt trời / Mặt trăng';
  readonly description = 'Bấm vào thiên thể đang hiện để đổi ngày và đêm.';
  readonly algorithms = ['Midpoint circle', 'Alpha glow', 'Smoothstep crossfade', 'Point-in-polygon'];
  readonly layer = Layer.CELESTIAL; readonly interactive = true;
  hitPolygons(env: Env): readonly Vec2[][] {
    const phase = smooth(env.dayPhase);
    return [ ...(1 - phase > 0.2 ? [disk(SUN.x, SUN.y, SUN.r)] : []), ...(phase > 0.2 ? [disk(MOON.x, MOON.y, MOON.r)] : []) ];
  }
  onClick(ctx: ClickContext): void { ctx.ui.toggleDayNight(); }
  draw(r: Renderer, env: Env): void {
    const night = smooth(env.dayPhase), day = 1 - night, p = env.palette;
    const sunRim = lerpColor(p.sun, p.inkSoft, 0.55);
    const moonRim = lerpColor(p.moon, p.inkSoft, 0.5);
    if (day > 0.005) {
      for (const [radius, alpha] of [[58, 0.08], [49, 0.12], [41, 0.2]] as const) r.circle(SUN.x, SUN.y, radius, withAlpha(p.sunGlow, alpha * day), true);
      r.circle(SUN.x, SUN.y, SUN.r, withAlpha(sunRim, day));
      r.circle(SUN.x, SUN.y, SUN.r - 2, withAlpha(p.sun, day), true);
    }
    if (night > 0.005) {
      r.circle(MOON.x, MOON.y, 46, withAlpha(p.moonGlow, 0.12 * night), true);
      r.circle(MOON.x, MOON.y, MOON.r, withAlpha(moonRim, night));
      r.circle(MOON.x, MOON.y, MOON.r - 2, withAlpha(p.moon, night), true);
      const crater = lerpColor(p.moon, p.inkSoft, 0.28);
      r.circle(1179, 142, 4, withAlpha(crater, night)); r.circle(1197, 158, 3, withAlpha(crater, night)); r.circle(1185, 166, 2, withAlpha(crater, night));
    }
  }
}
