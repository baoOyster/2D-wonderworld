import { withAlpha } from '../../core/color.ts';
import { mat3Apply, ellipsePolygon, transformPoints } from '../../core/mat3.ts';
import { Node } from '../../core/node.ts';
import { Layer } from '../layers.ts';
import type { Renderer } from '../../core/renderer-types.ts';
import type { ClickContext, Env, SceneObject } from '../types.ts';
import type { Vec2 } from '../../core/vec2.ts';

const HOME = { x: 346, y: 585 };
const BODY_HIT = ellipsePolygon(346, 566, 27, 18, 32);
const HEAD_HIT = ellipsePolygon(367, 550, 13, 13, 28);
const ROOT = new Node();
const EAR_L = new Node(), EAR_R = new Node();
ROOT.add(EAR_L).add(EAR_R);
let jumpStart = -Infinity;

export class Rabbit implements SceneObject {
  readonly id = 'rabbit'; readonly name = 'Thỏ trắng';
  readonly description = 'Một chú thỏ nhỏ ngồi cạnh lối đi, vểnh tai khi có người đến gần.';
  readonly algorithms = ['Midpoint ellipse / circle', 'Node hierarchy', 'Parabolic jump', 'Hit polygon'];
  readonly layer = Layer.RABBIT; readonly interactive = true;

  hitPolygons(_env: Env): readonly Vec2[][] { return [BODY_HIT, HEAD_HIT]; }
  onClick(ctx: ClickContext): void { ctx.ui.select(this); jumpStart = ctx.env.time; }

  draw(r: Renderer, env: Env): void {
    const pointer = (env as Env & { pointer?: Vec2 | null }).pointer;
    const near = !!pointer && Math.hypot(pointer.x - HOME.x, pointer.y - (HOME.y - 25)) < 75;
    const jumpAge = env.time - jumpStart;
    const jumping = jumpAge >= 0 && jumpAge < 0.6;
    const t = jumping ? jumpAge / 0.6 : 1;
    const lift = jumping ? 4 * 58 * t * (1 - t) : 0;
    const squash = jumping && t > 0.82 ? 1 - 0.1 * Math.sin(((t - 0.82) / 0.18) * Math.PI) : 1;
    const baseY = HOME.y - lift;
    ROOT.transform = { x: HOME.x, y: baseY, rotation: 0, scaleX: squash, scaleY: jumping ? 1 / squash : 1 };
    const root = ROOT.worldMatrix();
    const earAngle = near ? -0.12 : Math.sin(env.time * 2.2) * 0.035;
    // Ear nodes are anchored at the top edge of the head; local geometry
    // extends upward from each anchor, keeping the ears attached while they sway.
    EAR_L.transform = { x: 13, y: -47, rotation: -0.05 + earAngle, scaleX: 1, scaleY: 1 };
    EAR_R.transform = { x: 26, y: -47, rotation: 0.08 + earAngle * 0.45, scaleX: 1, scaleY: 1 };

    const earLocal = ellipsePolygon(0, -13, 4.5, 16, 20);
    const localEarL = transformPoints(EAR_L.localMatrix(), earLocal);
    const localEarR = transformPoints(EAR_R.localMatrix(), earLocal);
    const bodyWorld = r.mask(); bodyWorld.polygon(transformPoints(root, ellipsePolygon(-1, -19, 27, 18, 32)));
    bodyWorld.polygon(transformPoints(root, ellipsePolygon(20, -35, 13, 13, 28)));
    bodyWorld.polygon(transformPoints(root, ellipsePolygon(-25, -19, 7, 7, 20)));
    bodyWorld.polygon(transformPoints(root, localEarL)); bodyWorld.polygon(transformPoints(root, localEarR));
    r.shape(bodyWorld, { fill: env.palette.rabbit, shade: env.palette.stone, highlight: env.palette.mushroomSpot, outline: env.palette.ink, outlineWidth: 2 });

    // Front and rear feet are separate outlined shapes drawn over the body.
    const legsWorld = r.mask();
    legsWorld.polygon(transformPoints(root, ellipsePolygon(-12, -5, 9, 5, 20)));
    legsWorld.polygon(transformPoints(root, ellipsePolygon(12, -5, 9, 5, 20)));
    r.shape(legsWorld, { fill: env.palette.rabbit, shade: env.palette.stone, outline: env.palette.ink, outlineWidth: 1 });

    const earInnerL = mat3Apply(EAR_L.worldMatrix(), { x: 0, y: -13 });
    const earInnerR = mat3Apply(EAR_R.worldMatrix(), { x: 0, y: -13 });
    r.ellipse(earInnerL.x, earInnerL.y, 2, 10, withAlpha(env.palette.flowerRed, 0.4), true);
    r.ellipse(earInnerR.x, earInnerR.y, 2, 10, withAlpha(env.palette.flowerRed, 0.4), true);
    const face = mat3Apply(root, { x: 25, y: -38 });
    r.circle(face.x, face.y, 1.8, env.palette.ink, true);
    r.circle(face.x + 5, face.y + 5, 2.5, withAlpha(env.palette.flowerRed, 0.4), true);
  }
}
