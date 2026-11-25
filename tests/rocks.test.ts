import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera.ts';
import { Framebuffer } from '../src/core/framebuffer.ts';
import { mat3Apply } from '../src/core/mat3.ts';
import { DAY, NIGHT, type Palette } from '../src/core/palette.ts';
import { FB_H, FB_W } from '../src/core/config.ts';
import { Renderer } from '../src/core/renderer.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';
import {
  BOULDERS,
  HOVER_MAX_LEAN,
  HOVER_RADIUS,
  LAKE,
  PEBBLE_COUNT,
  REED_CLUSTERS,
  REED_DAMPING,
  REED_STIFFNESS,
  REED_SWAY_SPEED,
  Boulders,
  Pebbles,
  Reeds,
  boulderShape,
  createRocks,
  generatePebbles,
  stoneTones,
} from '../src/scene/rocks/index.ts';
import type { Env, SceneObject } from '../src/scene/types.ts';

const CAMERA = new Camera();

function makeEnv(palette: Palette = DAY, pointer: Vec2 | null = null): Env {
  return {
    time: 0,
    dt: 1 / 60,
    dayPhase: palette === NIGHT ? 1 : 0,
    palette,
    camera: CAMERA,
    pointer,
  };
}

/** Chạy `frames` khung 1/60 giây, giữ con trỏ cố định; trả `Env` ở khung cuối. */
function run(obj: SceneObject, env: Env, frames: number, pointer: Vec2 | null = null): Env {
  let time = env.time;
  for (let i = 0; i < frames; i++) {
    time += 1 / 60;
    obj.update?.({ ...env, time, dt: 1 / 60, pointer });
  }
  return { ...env, time, pointer };
}

/** Lay theo gió mà thân `i` phải bám theo ở thời điểm `time`. */
function ambientAt(reeds: Reeds, time: number, i: number): number {
  const stem = reeds.stems[i];
  return stem.sway * Math.sin(time * REED_SWAY_SPEED + stem.phase);
}

const bbox = (pts: readonly Vec2[]) => ({
  x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)),
});

describe('hình học đá theo layout.md', () => {
  it('đủ 8 tảng, đúng toạ độ layout: 4 ven hồ rồi 4 tiền cảnh', () => {
    expect(BOULDERS.map((b) => [b.at.x, b.at.y])).toEqual([
      [735, 540], [826, 526], [1186, 506], [1136, 526], [300, 665], [432, 660], [495, 628], [752, 692],
    ]);
    expect(BOULDERS.slice(0, 4).every((b) => b.shore)).toBe(true);
    expect(BOULDERS.filter((b) => b.shore)).toHaveLength(4);
  });

  it('cỡ mỗi tảng trong khoảng 14–85 px, có cả tảng nhỏ và tảng lớn', () => {
    for (const b of BOULDERS) {
      expect(b.size).toBeGreaterThanOrEqual(14);
      expect(b.size).toBeLessThanOrEqual(85);
    }
    expect(Math.min(...BOULDERS.map((b) => b.size))).toBeLessThan(20);
    expect(Math.max(...BOULDERS.map((b) => b.size))).toBeGreaterThan(80);
  });

  it('mỗi tảng là đa giác 6–8 cạnh, đáy phẳng, cỡ khớp khai báo', () => {
    for (const spec of BOULDERS) {
      const shape = boulderShape(spec);
      expect(shape.outline.length).toBeGreaterThanOrEqual(6);
      expect(shape.outline.length).toBeLessThanOrEqual(8);
      expect(new Set(shape.outline.map((p) => `${p.x},${p.y}`)).size).toBe(shape.outline.length);
      expect(shape.baseY).toBeCloseTo(spec.at.y + 0.5 * spec.size);
      // Đáy phẳng: không đỉnh nào thấp hơn đường đáy
      expect(Math.max(...shape.outline.map((p) => p.y))).toBeLessThanOrEqual(shape.baseY + 1e-9);
      // Bề ngang nằm giữa 1,2 và 2 lần cỡ (bán kính mỗi đỉnh 0,74–1,0 lần size)
      const b = bbox(shape.outline);
      expect(b.x1 - b.x0).toBeGreaterThanOrEqual(1.2 * spec.size);
      expect(b.x1 - b.x0).toBeLessThanOrEqual(2 * spec.size + 1e-6);
      expect(shape.outline.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    }
  });

  it('mặt tối nằm dưới-trái, mặt sáng trên-phải, highlight men cạnh trên', () => {
    for (const spec of BOULDERS) {
      const shape = boulderShape(spec);
      // Hiệu (x − cx) − (y − cy) âm là phía dưới-trái, dương là trên-phải.
      const side = (pts: readonly Vec2[]): number =>
        pts.reduce((sum, p) => sum + (p.x - spec.at.x) - (p.y - spec.at.y), 0) / pts.length;
      expect(side(shape.darkFacet)).toBeLessThan(0);
      expect(side(shape.lightFacet)).toBeGreaterThan(0);
      expect(shape.darkFacet.length).toBeGreaterThanOrEqual(3);
      expect(shape.lightFacet.length).toBeGreaterThanOrEqual(3);
      // Mặt đá nằm trong biên (số đỉnh ít hơn biên) nên khối vẫn còn dải nền
      expect(shape.lightFacet.length).toBeLessThan(shape.outline.length);
      // Cạnh trên: ít nhất 2 đỉnh, đều ở nửa trên và trung bình cao hơn tâm nhiều
      expect(shape.topEdge.length).toBeGreaterThanOrEqual(2);
      expect(shape.topEdge.every((p) => p.y < spec.at.y)).toBe(true);
      const meanY = shape.topEdge.reduce((sum, p) => sum + p.y, 0) / shape.topEdge.length;
      expect(meanY).toBeLessThan(spec.at.y - 0.2 * spec.size);
    }
  });

  it('cùng seed cho cùng hình; khác seed cho hình khác', () => {
    const a = boulderShape(BOULDERS[0]);
    expect(boulderShape({ ...BOULDERS[0], at: vec2(BOULDERS[0].at.x, BOULDERS[0].at.y) })).toEqual(a);
    expect(boulderShape({ ...BOULDERS[0], seed: 999 })).not.toEqual(a);
  });

  it('tông đá suy từ palette, khác nhau giữa ngày và đêm', () => {
    expect(stoneTones(DAY).fill).toBe(DAY.stone);
    expect(stoneTones(DAY).shade).toBe(DAY.stoneDark);
    expect(stoneTones(NIGHT).fill).toBe(NIGHT.stone);
    expect(stoneTones(DAY).highlight).not.toBe(stoneTones(NIGHT).highlight);
    expect(stoneTones(DAY).highlight).not.toBe(DAY.stone);
    expect(stoneTones(DAY).darkFace).not.toBe(DAY.stoneDark);
  });
});

describe('sỏi', () => {
  it('16 viên (12–18) ven bờ và trong nước nông, không đè lên đá lớn', () => {
    const pebbles = generatePebbles();
    expect(pebbles).toHaveLength(PEBBLE_COUNT);
    expect(PEBBLE_COUNT).toBeGreaterThanOrEqual(12);
    expect(PEBBLE_COUNT).toBeLessThanOrEqual(18);
    for (const s of pebbles) {
      // Hệ số bán kính elip hồ: 0,72–1,06 ⇒ nước nông hoặc sát mép bờ
      const factor = Math.hypot((s.at.x - LAKE.cx) / LAKE.rx, (s.at.y - LAKE.cy) / LAKE.ry);
      expect(factor).toBeGreaterThanOrEqual(0.7);
      expect(factor).toBeLessThanOrEqual(1.1);
      expect(s.at.y).toBeLessThan(LAKE.cy);
      expect(s.rx).toBeGreaterThan(0);
      expect(s.ry).toBeLessThan(s.rx);
      expect(s.alpha).toBeGreaterThan(0);
      expect(s.alpha).toBeLessThanOrEqual(1);
      expect(s.tone).toBeGreaterThanOrEqual(0);
      expect(s.tone).toBeLessThan(1);
      for (const b of BOULDERS) {
        expect(Math.hypot(b.at.x - s.at.x, b.at.y - s.at.y)).toBeGreaterThanOrEqual(b.size * 0.8);
      }
    }
  });

  it('không rải đều như lưới: khoảng cách tới viên gần nhất lệch nhau rõ', () => {
    const pebbles = generatePebbles();
    const nearest = pebbles.map((s, i) => Math.min(...pebbles.map((o, j) =>
      i === j ? Infinity : Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y))));
    const mean = nearest.reduce((a, b) => a + b, 0) / nearest.length;
    const spread = Math.sqrt(nearest.reduce((a, b) => a + (b - mean) ** 2, 0) / nearest.length);
    expect(spread).toBeGreaterThan(0);
    expect(spread / mean).toBeGreaterThan(0.2);
  });

  it('cùng seed cho cùng danh sách', () => {
    expect(generatePebbles(5)).toEqual(generatePebbles(5));
    expect(generatePebbles(5)).not.toEqual(generatePebbles(6));
  });
});

describe('lau sậy', () => {
  it('2 cụm ở bờ trái/phải hồ, mỗi cụm 7–9 thân cao 40–80 px, có bông', () => {
    expect(REED_CLUSTERS).toHaveLength(2);
    const clusters = new Reeds().clusters;
    expect(clusters).toHaveLength(2);
    // Mép trái hồ x ≈ 710, mép phải x ≈ 1310; hai cụm nép vào hai mép đó
    for (const cluster of clusters) {
      expect(Math.hypot((cluster.base.x - LAKE.cx) / LAKE.rx, (cluster.base.y - LAKE.cy) / LAKE.ry))
        .toBeLessThan(1.05);
      expect(cluster.stems.length).toBeGreaterThanOrEqual(7);
      expect(cluster.stems.length).toBeLessThanOrEqual(9);
      for (const stem of cluster.stems) {
        expect(stem.height).toBeGreaterThanOrEqual(40);
        expect(stem.height).toBeLessThanOrEqual(80);
        expect(Math.abs(stem.bend)).toBeGreaterThanOrEqual(4);
        // Cung bắt đầu ở gốc, kết thúc ở ngọn, uốn nhẹ
        expect(stem.curve[0].x).toBeCloseTo(0);
        expect(stem.curve[0].y).toBeCloseTo(0);
        expect(stem.curve[stem.curve.length - 1].x).toBeCloseTo(stem.bend);
        expect(stem.curve[stem.curve.length - 1].y).toBeCloseTo(-stem.height);
        expect(Math.max(...stem.curve.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(Math.abs(stem.bend) + 1e-9);
      }
      const withHead = cluster.stems.filter((s) => s.head).length;
      expect(withHead).toBeGreaterThanOrEqual(2);
      expect(withHead).toBeLessThan(cluster.stems.length);
    }
    expect(clusters[0].base.x).toBeLessThan(clusters[1].base.x);
  });

  it('lay theo gió quanh gốc: gốc đứng yên, góc bám biên độ · sin(ωt + φ)', () => {
    const reeds = new Reeds();
    let env = makeEnv(DAY);
    let maxAngle = 0;
    let maxTip = 0;
    for (let f = 0; f < 600; f++) {
      env = run(reeds, env, 1);
      const stem = reeds.stems[0];
      const tip = mat3Apply(reeds.nodes[0].worldMatrix(), vec2(stem.bend, -stem.height));
      maxTip = Math.max(maxTip, Math.hypot(tip.x - (stem.base.x + stem.bend), tip.y - (stem.base.y - stem.height)));
      for (let i = 0; i < reeds.stems.length; i++) maxAngle = Math.max(maxAngle, Math.abs(reeds.angleOf(i)));
    }
    // Biên độ lay lớn nhất của mọi thân là 0,055 rad ⇒ ngọn dời vài px
    expect(maxAngle).toBeGreaterThan(0.04);
    expect(maxTip).toBeGreaterThan(1);
    // Gốc sậy không dời: xoay quanh gốc
    reeds.stems.forEach((stem, i) => {
      const base = mat3Apply(reeds.nodes[i].worldMatrix(), vec2(0, 0));
      expect(base.x).toBeCloseTo(stem.base.x, 6);
      expect(base.y).toBeCloseTo(stem.base.y, 6);
      // Lò xo bám sát hình sin của gió
      expect(Math.abs(reeds.angleOf(i) - ambientAt(reeds, env.time, i))).toBeLessThan(0.012);
    });
  });

  it('con trỏ bên phải ⇒ ngả phải, bên trái ⇒ ngả trái, không quá góc tối đa', () => {
    for (const side of [1, -1] as const) {
      const reeds = new Reeds();
      const stem = reeds.stems[0];
      const env = run(reeds, makeEnv(DAY), 120, vec2(stem.base.x + side * 30, stem.base.y - 50));
      expect(Math.sign(reeds.angleOf(0))).toBe(side);
      expect(Math.abs(reeds.angleOf(0))).toBeGreaterThan(0.05);
      expect(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0))).toBeLessThanOrEqual(HOVER_MAX_LEAN);
      // Thân ở xa con trỏ cũng ngả cùng hướng nhưng ít hơn
      const far = reeds.stems[reeds.stems.length - 1];
      if (Math.hypot(far.base.x - stem.base.x, far.base.y - stem.base.y) > 120) {
        expect(Math.abs(reeds.angleOf(reeds.stems.length - 1))).toBeLessThan(Math.abs(reeds.angleOf(0)));
      }
    }
  });

  it('con trỏ ngoài bán kính ảnh hưởng thì chỉ còn lay theo gió', () => {
    const reeds = new Reeds();
    const stem = reeds.stems[0];
    const env = run(reeds, makeEnv(DAY), 120, vec2(stem.base.x + HOVER_RADIUS + 40, stem.base.y));
    expect(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0))).toBeLessThan(0.012);
  });

  it('bỏ con trỏ: phản ứng tắt dần rồi về đúng trạng thái cũ', () => {
    const reeds = new Reeds();
    const stem = reeds.stems[0];
    const held = run(reeds, makeEnv(DAY), 120, vec2(stem.base.x + 24, stem.base.y - 40));
    const leaned = reeds.angleOf(0) - ambientAt(reeds, held.time, 0);
    expect(leaned).toBeGreaterThan(0.05);

    const deviation: number[] = [];
    let env = held;
    for (let i = 0; i < 300; i++) {
      env = run(reeds, env, 1, null);
      deviation.push(Math.abs(reeds.angleOf(0) - ambientAt(reeds, env.time, 0)));
    }
    // Tắt dần: biên độ đầu khung lớn, 2 giây sau đã nhỏ, cuối cùng về ~0
    expect(Math.max(...deviation.slice(0, 30))).toBeGreaterThan(0.03);
    expect(Math.max(...deviation.slice(120, 150))).toBeLessThan(Math.max(...deviation.slice(0, 30)));
    expect(Math.max(...deviation.slice(-60))).toBeLessThan(0.02);
  });

  it('lò xo có dao động tắt dần (cản < 2√k), không lệch vĩnh viễn', () => {
    expect(REED_DAMPING).toBeLessThan(2 * Math.sqrt(REED_STIFFNESS));
    const reeds = new Reeds();
    const stem = reeds.stems[0];
    let env = run(reeds, makeEnv(DAY), 120, vec2(stem.base.x + 20, stem.base.y - 30));
    // Nhả chuột: độ lệch đổi dấu ít nhất một lần (dao động) rồi tắt
    let crossings = 0;
    for (let i = 0; i < 300; i++) {
      const before = reeds.angleOf(0) - ambientAt(reeds, env.time, 0);
      env = run(reeds, env, 1, null);
      const after = reeds.angleOf(0) - ambientAt(reeds, env.time, 0);
      if (before > 0 !== after > 0) crossings++;
    }
    expect(crossings).toBeGreaterThan(0);
  });
});

describe('draw()', () => {
  it('mỗi tảng đá: mask thân tô 3 tông + viền ink 2 px, mặt đá bị cắt trong thân, có highlight cạnh trên', () => {
    for (const palette of [DAY, NIGHT]) {
      const tone = stoneTones(palette);
      const styles: Record<string, unknown>[] = [];
      const ops: string[] = [];
      const r = {
        mask: () => {
          const m = { polygon: () => m, ellipse: () => m, circle: () => m };
          return m;
        },
        shape: (_m: unknown, style: Record<string, unknown>) => {
          styles.push(style);
          ops.push(style.clip ? 'facet' : 'body');
        },
        polyline: () => { ops.push('top-edge'); },
        line: () => { ops.push('line'); },
        ellipse: () => { ops.push('ellipse'); },
      };
      new Boulders().draw(r as unknown as Renderer, makeEnv(palette));
      const bodies = styles.filter((s) => !s.clip);
      expect(ops.filter((o) => o === 'body')).toHaveLength(BOULDERS.length);
      expect(ops.filter((o) => o === 'facet').length).toBeGreaterThanOrEqual(BOULDERS.length);
      expect(ops.filter((o) => o === 'top-edge')).toHaveLength(BOULDERS.length);
      // Bóng chân cho mọi tảng + vũng nước nông cho 4 tảng ven hồ
      expect(ops.filter((o) => o === 'ellipse')).toHaveLength(BOULDERS.length + 4);
      for (const body of bodies) {
        expect(body.fill).toBe(tone.fill);
        expect(body.shade).toBe(tone.shade);
        expect(body.highlight).toBe(tone.highlight);
        expect(body.outline).toBe(palette.ink);
        expect(body.outlineWidth).toBe(2);
      }
      const facets = styles.filter((s) => s.clip);
      expect(facets.some((f) => f.fill === tone.darkFace)).toBe(true);
      expect(facets.some((f) => f.fill === tone.lightFace)).toBe(true);
    }
  });

  it('sỏi vẽ bằng elip alpha < 255 theo palette', () => {
    const alphas: number[] = [];
    const colors: number[] = [];
    const r = {
      ellipse: (_x: number, _y: number, _rx: number, _ry: number, color: number) => {
        alphas.push(color & 0xff);
        colors.push(color);
      },
    };
    new Pebbles().draw(r as unknown as Renderer, makeEnv(DAY));
    expect(alphas).toHaveLength(PEBBLE_COUNT);
    expect(alphas.every((a) => a > 0 && a < 255)).toBe(true);
    expect(new Set(colors).size).toBeGreaterThan(4);
    const nightColors: number[] = [];
    new Pebbles().draw({
      ellipse: (_x: number, _y: number, _rx: number, _ry: number, color: number) => { nightColors.push(color); },
    } as unknown as Renderer, makeEnv(NIGHT));
    expect(nightColors[0] & 0xffffff00).not.toBe(colors[0] & 0xffffff00);
  });

  it('sậy: thân bằng nét dày DDA, bông bằng mask/ellipse vẽ sau thân', () => {
    const ops: string[] = [];
    const r = {
      ellipse: () => { ops.push('shadow'); },
      line: () => { ops.push('dda'); },
      mask: () => {
        ops.push('head-mask');
        const m = { polygon: () => m, ellipse: () => m, circle: () => m };
        return m;
      },
      shape: () => { ops.push('head-shape'); },
    };
    const reeds = new Reeds();
    reeds.draw(r as unknown as Renderer, makeEnv(DAY));
    expect(ops.filter((o) => o === 'dda').length).toBeGreaterThan(reeds.stems.length);
    expect(ops.filter((o) => o === 'shadow')).toHaveLength(reeds.stems.length);
    expect(ops.filter((o) => o === 'head-shape').length).toBe(reeds.stems.filter((s) => s.head).length);
    expect(ops.indexOf('head-mask')).toBeGreaterThan(ops.indexOf('dda'));
  });

  it('ngọn sậy vẽ ra toạ độ lệch theo hướng con trỏ', () => {
    const tipXs = (pointer: Vec2): number[] => {
      const reeds = new Reeds();
      const env = run(reeds, makeEnv(DAY), 120, pointer);
      const xs: number[] = [];
      const r = {
        ellipse: () => {},
        line: (x0: number, _y0: number, x1: number, _y1: number) => { xs.push(x0, x1); },
        mask: () => {
          const m = { polygon: () => m, ellipse: () => m, circle: () => m };
          return m;
        },
        shape: () => {},
      };
      reeds.draw(r as unknown as Renderer, { ...env, pointer });
      // Chỉ lấy cụm bên trái (cụm phải nằm ngoài bán kính ảnh hưởng của con trỏ)
      return xs.filter((x) => x < 1000);
    };
    const stem = new Reeds().stems[0];
    const right = tipXs(vec2(stem.base.x + 40, stem.base.y - 60));
    const left = tipXs(vec2(stem.base.x - 40, stem.base.y - 60));
    expect(Math.max(...right)).toBeGreaterThan(Math.max(...left));
    expect(Math.min(...left)).toBeLessThan(Math.min(...right));
  });
});

describe('renderer thật: pixel theo palette ngày/đêm', () => {
  const camera = new Camera();
  const render = (palette: Palette, draw: (r: Renderer, env: Env) => void): Framebuffer => {
    const fb = new Framebuffer(FB_W, FB_H);
    const r = new Renderer(fb, camera);
    r.begin(palette.skyBottom);
    draw(r, makeEnv(palette));
    return fb;
  };
  /** Hộp bao world → hộp bao pixel framebuffer. */
  const screenBox = (box: { x0: number; x1: number; y0: number; y1: number }) => {
    const a = camera.worldToScreen(vec2(box.x0, box.y0));
    const b = camera.worldToScreen(vec2(box.x1, box.y1));
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  };
  const countColor = (fb: Framebuffer, color: number, area: { x0: number; x1: number; y0: number; y1: number }): number => {
    let count = 0;
    for (let y = Math.floor(area.y0); y <= Math.ceil(area.y1); y++) {
      for (let x = Math.floor(area.x0); x <= Math.ceil(area.x1); x++) if (fb.getPixel(x, y) === color) count++;
    }
    return count;
  };
  const pixel = (fb: Framebuffer, p: Vec2): number => {
    const s = camera.worldToScreen(p);
    return fb.getPixel(s.x, s.y);
  };
  const big = BOULDERS.reduce((a, b) => (b.size > a.size ? b : a));

  it('đá tô đúng `stone`/`stoneDark`/`ink` của palette đang dùng, không hardcode', () => {
    const area = screenBox(bbox(boulderShape(big).outline));
    const day = render(DAY, (r, env) => new Boulders().draw(r, env));
    expect(countColor(day, DAY.stone, area)).toBeGreaterThan(300);
    expect(countColor(day, DAY.stoneDark, area)).toBeGreaterThan(30);
    expect(countColor(day, DAY.ink, area)).toBeGreaterThan(50);
    // Màu của palette bên kia không xuất hiện
    expect(countColor(day, NIGHT.stone, area)).toBe(0);

    const night = render(NIGHT, (r, env) => new Boulders().draw(r, env));
    expect(countColor(night, NIGHT.stone, area)).toBeGreaterThan(300);
    expect(countColor(night, DAY.stone, area)).toBe(0);
    expect(night.data).not.toEqual(day.data);
  });

  it('bóng chân và vũng nước nông làm pixel quanh chân đá khác nền', () => {
    const fb = render(DAY, (r, env) => new Boulders().draw(r, env));
    const shadow = pixel(fb, vec2(big.at.x, big.at.y + 0.5 * big.size + 3));
    expect(shadow).not.toBe(DAY.skyBottom);
    const shore = BOULDERS[0];
    const water = pixel(fb, vec2(shore.at.x - shore.size * 0.8, shore.at.y + 0.5 * shore.size));
    expect(water).not.toBe(DAY.skyBottom);
  });

  it('sỏi và sậy vẽ pixel thật, đổi theo palette ngày/đêm', () => {
    const draw = (r: Renderer, env: Env): void => {
      new Pebbles().draw(r, env);
      new Reeds().draw(r, env);
    };
    const day = render(DAY, draw);
    const night = render(NIGHT, draw);

    // Sỏi: pixel ở tâm viên sỏi là màu sỏi trộn với nền, khác nhau giữa ngày và đêm
    const pebble = new Pebbles().pebbles[0];
    expect(pixel(day, pebble.at)).not.toBe(DAY.skyBottom);
    expect(pixel(day, pebble.at)).not.toBe(pixel(night, pebble.at));

    // Sậy: vùng quanh cụm trái có pixel khác nền trời
    const stems = new Reeds().clusters[0].stems;
    const area = screenBox(bbox(stems.flatMap((s) => [s.base, vec2(s.base.x + s.bend, s.base.y - s.height)])));
    const total = (area.x1 - area.x0 + 1) * (area.y1 - area.y0 + 1);
    expect(total - countColor(day, DAY.skyBottom, area)).toBeGreaterThan(200);
    const stem = stems[0];
    const mid = vec2(stem.base.x + stem.curve[2].x, stem.base.y + stem.curve[2].y);
    expect(pixel(day, mid)).not.toBe(DAY.skyBottom);
    expect(pixel(day, mid)).not.toBe(pixel(night, mid));
  });
});

describe('ràng buộc bố cục', () => {
  it('đá không che cá bơi: không tảng nào chồng lên dải bơi của cá', () => {
    // Cá bơi theo elip tâm (1010, 600), rx 220, ry 36 (layout.md, #21)
    const fish = { x0: 790, x1: 1230, y0: 564, y1: 636 };
    for (const spec of BOULDERS) {
      const shape = boulderShape(spec);
      const b = bbox(shape.outline);
      const overlapsY = b.y1 > fish.y0 && b.y0 < fish.y1;
      const overlapsX = b.x1 > fish.x0 && b.x0 < fish.x1;
      expect(overlapsY && overlapsX, `${spec.at.x},${spec.at.y}`).toBe(false);
    }
  });

  it('đá và sậy nằm dưới cầu: layer ROCK (12) < BRIDGE (13)', () => {
    for (const o of createRocks()) expect(o.layer).toBeLessThan(13);
  });
});

describe('vật thể trong cảnh', () => {
  it('createRocks trả về sỏi, đá, sậy — cùng layer ROCK, đều không tương tác', () => {
    const objects = createRocks();
    expect(objects.map((o) => o.id)).toEqual(['pebbles', 'boulders', 'reeds']);
    for (const o of objects) {
      expect(o.layer).toBe(12);
      expect(o.interactive).toBe(false);
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.description.length).toBeGreaterThan(0);
      expect(o.algorithms.length).toBeGreaterThanOrEqual(3);
    }
  });
});
