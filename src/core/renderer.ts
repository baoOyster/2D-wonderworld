import { RENDER_SCALE } from './config.ts';
import type { Camera } from './camera.ts';
import { unpack, type RGBA } from './color.ts';
import {
  floodFill,
  polygonFill,
  strokePolygon,
  type FloodFillOptions,
} from './fill.ts';
import { drawText } from './font.ts';
import type { Framebuffer } from './framebuffer.ts';
import { transformPoints } from './mat3.ts';
import { Mask, maskEllipse, maskPolygon } from './mask.ts';
import {
  circleMidpoint,
  ellipseMidpoint,
  lineBresenham,
  lineDDA,
  thickLine,
} from './raster.ts';
import type {
  Renderer as RendererApi,
  ShapeStyle,
  WorldMask as WorldMaskApi,
} from './renderer-types.ts';
import type { Vec2 } from './vec2.ts';

/** Tông tối ở mép dưới-trái, tính theo pixel màn hình. */
const SHADE_WORLD = 3;
/** Tông sáng mảnh hơn ở mép trên-phải. */
const HIGHLIGHT_WORLD = 2;
/** Độ dày viền mặc định theo world (SPEC: 2px world cho khối chính). */
const DEFAULT_OUTLINE_WORLD = 2;

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function intersectBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a || !b) return null;
  const bounds = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return bounds.x0 <= bounds.x1 && bounds.y0 <= bounds.y1 ? bounds : null;
}

function clippedBounds(bounds: Bounds, width: number, height: number): Bounds | null {
  const clipped = {
    x0: Math.max(0, bounds.x0),
    y0: Math.max(0, bounds.y0),
    x1: Math.min(width - 1, bounds.x1),
    y1: Math.min(height - 1, bounds.y1),
  };
  return clipped.x0 <= clipped.x1 && clipped.y0 <= clipped.y1 ? clipped : null;
}


/**
 * Vùng mask theo toạ độ world.
 *
 * `Renderer.mask()` cấp một bộ đệm từ pool và xoá sạch. Mỗi mask chỉ nên dùng
 * trong khung hiện tại; khung sau bộ đệm được tái sử dụng (không cấp phát
 * `Uint8Array` mới mỗi frame).
 */
export class WorldMask implements WorldMaskApi {
  readonly mask: Mask;
  private readonly camera: Camera;
  private trackedBounds: Bounds | null = null;

  constructor(mask: Mask, camera: Camera) {
    this.mask = mask;
    this.camera = camera;
  }

  polygon(points: readonly Vec2[]): this {
    if (points.length >= 3) {
      const screenPoints = transformPoints(this.camera.matrix(), points);
      maskPolygon(this.mask, screenPoints);
      this.expandFromPoints(screenPoints);
    }
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    if (![cx, cy, rx, ry].every(Number.isFinite)) return this;
    const p = this.camera.worldToScreen({ x: cx, y: cy });
    const scale = this.screenScale();
    maskEllipse(this.mask, p.x, p.y, rx * scale, ry * scale);
    this.expand(
      Math.floor(p.x - rx * scale) - 1,
      Math.floor(p.y - ry * scale) - 1,
      Math.ceil(p.x + rx * scale) + 1,
      Math.ceil(p.y + ry * scale) + 1,
    );
    return this;
  }

  circle(cx: number, cy: number, r: number): this {
    return this.ellipse(cx, cy, r, r);
  }

  union(other: WorldMaskApi): this {
    const source = otherMask(other, this.mask);
    const target = this.mask.data;
    const from = source.data;
    for (let i = 0; i < target.length; i++) target[i] |= from[i];
    this.trackedBounds = unionBounds(this.trackedBounds, otherWorldMask(other).trackedBounds);
    return this;
  }

  intersect(other: WorldMaskApi): this {
    const source = otherMask(other, this.mask);
    const target = this.mask.data;
    const from = source.data;
    for (let i = 0; i < target.length; i++) target[i] &= from[i];
    this.trackedBounds = intersectBounds(this.trackedBounds, otherWorldMask(other).trackedBounds);
    return this;
  }

  subtract(other: WorldMaskApi): this {
    const source = otherMask(other, this.mask);
    const target = this.mask.data;
    const from = source.data;
    for (let i = 0; i < target.length; i++) target[i] &= from[i] ^ 1;
    // Bounding box chỉ có thể nhỏ đi; giữ hộp cũ là cận trên an toàn.
    return this;
  }

  clear(): this {
    this.mask.clear();
    this.trackedBounds = null;
    return this;
  }

  isEmpty(): boolean {
    return this.trackedBounds === null || this.mask.bounds() === null;
  }

  /** Hộp bao pixel (cận trên) để renderer chỉ quét vùng có hình. */
  getBounds(): Bounds | null {
    return this.trackedBounds;
  }

  private screenScale(): number {
    return RENDER_SCALE * this.camera.zoom;
  }

  private expandFromPoints(points: readonly Vec2[]): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    this.expand(Math.floor(minX) - 1, Math.floor(minY) - 1, Math.ceil(maxX) + 1, Math.ceil(maxY) + 1);
  }

  private expand(x0: number, y0: number, x1: number, y1: number): void {
    const next = clippedBounds({ x0, y0, x1, y1 }, this.mask.width, this.mask.height);
    this.trackedBounds = unionBounds(this.trackedBounds, next);
  }
}

function otherWorldMask(other: WorldMaskApi): WorldMask {
  if (!(other instanceof WorldMask)) {
    throw new TypeError('Renderer: mask phải do Renderer.mask() tạo ra');
  }
  return other;
}

function otherMask(
  other: WorldMaskApi,
  expected: Pick<Mask, 'width' | 'height'>,
): Mask {
  const source = otherWorldMask(other);
  if (source.mask.width !== expected.width || source.mask.height !== expected.height) {
    throw new RangeError('Renderer: hai mask khác kích thước framebuffer');
  }
  return source.mask;
}

/**
 * Cài đặt `Renderer` theo SPEC #1 mục 3.6.
 *
 * - Toạ độ/bán kính/độ dày là world; renderer nhân `RENDER_SCALE · zoom` rồi
 *   gọi raster/fill/mask/font. Overlay dùng camera zoom 1 pan 0 nên không bị
 *   phóng to theo camera thế giới.
 * - Mask lấy từ pool, dùng lại giữa các khung.
 * - Tông tối/sáng và viền tính trực tiếp trên mask nên không cấp phát mask phụ.
 */
export class Renderer implements RendererApi {
  readonly framebuffer: Framebuffer;
  readonly camera: Camera;

  private readonly masks: Mask[] = [];
  private maskCursor = 0;
  private outlineVisited: Uint8Array | null = null;
  private outlineQueue: Int32Array | null = null;

  constructor(framebuffer: Framebuffer, camera: Camera) {
    this.framebuffer = framebuffer;
    this.camera = camera;
  }

  begin(clearColor: RGBA): void {
    this.framebuffer.clear(clearColor);
    this.maskCursor = 0;
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: RGBA,
    width = 1,
    alg: 'dda' | 'bresenham' = 'bresenham',
  ): void {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;

    const a = this.camera.worldToScreen({ x: x0, y: y0 });
    const b = this.camera.worldToScreen({ x: x1, y: y1 });
    const screenWidth = Math.max(1, width * this.screenScale());
    const fb = this.framebuffer;

    if (screenWidth > 1.5) {
      thickLine(fb, a.x, a.y, b.x, b.y, screenWidth, color);
    } else if (alg === 'dda') {
      lineDDA(fb, a.x, a.y, b.x, b.y, color);
    } else {
      lineBresenham(fb, a.x, a.y, b.x, b.y, color);
    }
  }

  polyline(points: readonly Vec2[], color: RGBA, width = 1): void {
    if (points.length === 0) return;
    if (points.length === 1) {
      this.line(points[0].x, points[0].y, points[0].x, points[0].y, color, width);
      return;
    }
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.line(a.x, a.y, b.x, b.y, color, width);
    }
  }

  circle(cx: number, cy: number, r: number, color: RGBA, filled = false): void {
    if (![cx, cy, r].every(Number.isFinite)) return;
    const p = this.camera.worldToScreen({ x: cx, y: cy });
    circleMidpoint(this.framebuffer, p.x, p.y, Math.max(0, r * this.screenScale()), color, filled);
  }

  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: RGBA,
    filled = false,
  ): void {
    if (![cx, cy, rx, ry].every(Number.isFinite)) return;
    const p = this.camera.worldToScreen({ x: cx, y: cy });
    const scale = this.screenScale();
    ellipseMidpoint(
      this.framebuffer,
      p.x,
      p.y,
      Math.max(0, rx * scale),
      Math.max(0, ry * scale),
      color,
      filled,
    );
  }

  polygon(points: readonly Vec2[], color: RGBA, filled = true): void {
    if (points.length === 0 || !points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      return;
    }
    const screenPoints = transformPoints(this.camera.matrix(), points);
    if (filled) {
      polygonFill(this.framebuffer, screenPoints, color);
    } else {
      strokePolygon(this.framebuffer, screenPoints, color, Math.max(1, this.screenScale()));
    }
  }

  floodFill(x: number, y: number, color: RGBA, options?: FloodFillOptions): void {
    if (![x, y].every(Number.isFinite)) return;
    const p = this.camera.worldToScreen({ x, y });
    floodFill(this.framebuffer, p.x, p.y, color, options);
  }

  text(
    text: string,
    x: number,
    y: number,
    color: RGBA,
    scale = 1,
    align: 'left' | 'center' | 'right' = 'left',
    shadow?: RGBA,
  ): void {
    if (![x, y, scale].every(Number.isFinite)) return;
    const p = this.camera.worldToScreen({ x, y });
    // Bitmap font 8×22: ở Full HD cần scale ≥ 2 để đọc được trên màn hình.
    const pixelScale = Math.max(2, Math.round(scale * this.screenScale()));
    drawText(this.framebuffer, text, p.x, p.y, color, {
      scale: pixelScale,
      align,
      ...(shadow === undefined ? {} : { shadow }),
    });
  }

  mask(): WorldMask {
    return new WorldMask(this.acquireMask(), this.camera);
  }

  shape(mask: WorldMaskApi, style: ShapeStyle): void {
    const sourceMask = otherWorldMask(mask);
    if (
      sourceMask.mask.width !== this.framebuffer.width ||
      sourceMask.mask.height !== this.framebuffer.height
    ) {
      throw new RangeError('Renderer: mask khác kích thước framebuffer');
    }
    const source = sourceMask.mask;
    const clip = style.clip ? otherMask(style.clip, this.framebuffer) : undefined;
    const bounds = sourceMask.getBounds();
    if (!bounds) return;

    const scale = this.screenScale();
    const shadeOffset = style.shade === undefined
      ? 0
      : Math.max(1, Math.round(SHADE_WORLD * scale));
    const highlightOffset = style.highlight === undefined
      ? 0
      : Math.max(1, Math.round(HIGHLIGHT_WORLD * scale));

    this.fillShape(source, bounds, style, clip, shadeOffset, highlightOffset);

    if (style.outline !== undefined) {
      const worldWidth = style.outlineWidth ?? DEFAULT_OUTLINE_WORLD;
      if (worldWidth > 0) {
        const screenWidth = Math.min(255, Math.max(1, Math.round(worldWidth * scale)));
        this.fillOutline(source, style.outline, screenWidth, bounds, clip);
      }
    }
  }

  private screenScale(): number {
    return RENDER_SCALE * this.camera.zoom;
  }

  private acquireMask(): Mask {
    let mask = this.masks[this.maskCursor];
    if (!mask) {
      mask = new Mask(this.framebuffer.width, this.framebuffer.height);
      this.masks.push(mask);
    } else {
      mask.clear();
    }
    this.maskCursor++;
    return mask;
  }

  /**
   * Tô nền + tông tối + tông sáng trong **một** lượt quét hộp bao.
   *
   * Mỗi pixel thuộc mask chọn đúng một màu:
   * - tối nếu pixel lệch `(+s, −s)` không thuộc mask (`m − shift(m, +s, −s)`);
   * - ngược lại sáng nếu pixel lệch `(−h, +h)` không thuộc mask;
   * - ngược lại màu nền.
   *
   * Viền được vẽ sau nên luôn nằm trên cùng.
   */
  private fillShape(
    source: Mask,
    bounds: Bounds,
    style: ShapeStyle,
    clip: Mask | undefined,
    shadeOffset: number,
    highlightOffset: number,
  ): void {
    const { width: w, height: h, data } = source;
    const fb = this.framebuffer;
    const fbData = fb.data;
    const fbWidth = fb.width;
    const clipData = clip?.data;

    const baseColor = style.fill;
    const base = unpack(baseColor);
    const shadeColor = style.shade;
    const shade = shadeColor === undefined ? null : unpack(shadeColor);
    const highlightColor = style.highlight;
    const highlight = highlightColor === undefined ? null : unpack(highlightColor);

    for (let y = bounds.y0; y <= bounds.y1; y++) {
      const row = y * w;
      const dstRow = y * fbWidth;
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        const index = row + x;
        if (data[index] === 0) continue;
        if (clipData && clipData[index] === 0) continue;

        let chosen = baseColor;
        let channels = base;

        if (shade) {
          const sx = x - shadeOffset;
          const sy = y + shadeOffset;
          if (sx < 0 || sy >= h || data[sy * w + sx] === 0) {
            chosen = shadeColor!;
            channels = shade;
          }
        }

        if (channels === base && highlight) {
          const sx = x + highlightOffset;
          const sy = y - highlightOffset;
          if (sx >= w || sy < 0 || data[sy * w + sx] === 0) {
            chosen = highlightColor!;
            channels = highlight;
          }
        }

        const dst = (dstRow + x) * 4;
        if (channels.a === 0xff) {
          fbData[dst] = channels.r;
          fbData[dst + 1] = channels.g;
          fbData[dst + 2] = channels.b;
          fbData[dst + 3] = 0xff;
        } else {
          fb.blendPixel(x, y, chosen);
        }
      }
    }
  }

  /**
   * Vẽ viền bên trong mask bằng BFS từ biên vào trong.
   *
   * Pixel thuộc mask có hàng xóm 4 hướng nằm ngoài mask là lớp viền thứ nhất;
   * hàng xóm kề nó là lớp thứ hai… Chỉ duyệt sâu tối đa `width` lớp nên chi phí
   * O(số pixel viền), không phụ thuộc diện tích hộp bao, và không cấp phát mask
   * mới. Hai mảng đệm `outlineVisited` / `outlineQueue` được dùng lại giữa các
   * lần gọi.
   *
   * Mép framebuffer được coi là "trong mask" nên vật bị khung cắt không sinh
   * viền giả dọc mép ảnh.
   */
  private fillOutline(
    source: Mask,
    color: RGBA,
    width: number,
    bounds: Bounds,
    clip?: Mask,
  ): void {
    const { width: maskW, height: maskH, data } = source;
    const x0 = Math.max(0, bounds.x0 - 1);
    const y0 = Math.max(0, bounds.y0 - 1);
    const x1 = Math.min(maskW - 1, bounds.x1 + 1);
    const y1 = Math.min(maskH - 1, bounds.y1 + 1);
    const regionW = x1 - x0 + 1;
    const regionH = y1 - y0 + 1;
    const total = regionW * regionH;
    if (total <= 0) return;

    let visited = this.outlineVisited;
    if (!visited || visited.length < total) {
      visited = new Uint8Array(total);
      this.outlineVisited = visited;
    } else {
      visited.fill(0, 0, total);
    }

    let queue = this.outlineQueue;
    if (!queue || queue.length < total) {
      queue = new Int32Array(total);
      this.outlineQueue = queue;
    }

    // Nạp lớp viền thứ nhất: pixel mask có hàng xóm ngoài mask.
    let tail = 0;
    for (let y = y0; y <= y1; y++) {
      const maskRow = y * maskW;
      const regionRow = (y - y0) * regionW;
      for (let x = x0; x <= x1; x++) {
        const maskIndex = maskRow + x;
        if (data[maskIndex] === 0) continue;
        // 4 hàng xóm, viết thẳng (không cấp phát iterator); ngoài khung coi như
        // "trong mask" nên pixel ở mép ảnh không thành viền.
        if (!(
          (x > 0 && data[maskIndex - 1] === 0)
          || (x < maskW - 1 && data[maskIndex + 1] === 0)
          || (y > 0 && data[maskIndex - maskW] === 0)
          || (y < maskH - 1 && data[maskIndex + maskW] === 0)
        )) continue;
        const index = regionRow + x - x0;
        visited[index] = 1;
        queue[tail++] = index;
      }
    }

    const fb = this.framebuffer;
    const fbData = fb.data;
    const fbWidth = fb.width;
    const clipData = clip?.data;
    const channels = unpack(color);
    const opaque = channels.a === 0xff;

    // BFS tới `width` lớp; tô ngay khi lấy pixel khỏi hàng đợi.
    let head = 0;
    while (head < tail) {
      const index: number = queue[head++]!;
      const depth: number = visited[index]!;
      const x: number = x0 + (index % regionW);
      const y: number = y0 + Math.floor(index / regionW);

      const maskIndex = y * maskW + x;
      if (!clipData || clipData[maskIndex] !== 0) {
        if (opaque) {
          const dst = (y * fbWidth + x) * 4;
          fbData[dst] = channels.r;
          fbData[dst + 1] = channels.g;
          fbData[dst + 2] = channels.b;
          fbData[dst + 3] = 0xff;
        } else {
          fb.blendPixel(x, y, color);
        }
      }

      if (depth >= width) continue;
      // Hàng xóm 4 hướng, viết thẳng (không cấp phát iterator mỗi pixel).
      if (x > 0) {
        const next = index - 1;
        if (data[maskIndex - 1] !== 0 && visited[next] === 0) {
          visited[next] = depth + 1;
          queue[tail++] = next;
        }
      }
      if (x < maskW - 1) {
        const next = index + 1;
        if (data[maskIndex + 1] !== 0 && visited[next] === 0) {
          visited[next] = depth + 1;
          queue[tail++] = next;
        }
      }
      if (y > 0) {
        const next = index - regionW;
        if (data[maskIndex - maskW] !== 0 && visited[next] === 0) {
          visited[next] = depth + 1;
          queue[tail++] = next;
        }
      }
      if (y < maskH - 1) {
        const next = index + regionW;
        if (data[maskIndex + maskW] !== 0 && visited[next] === 0) {
          visited[next] = depth + 1;
          queue[tail++] = next;
        }
      }
    }
  }
}
