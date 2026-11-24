import { RENDER_SCALE, WORLD_H, WORLD_W } from './config.ts';
import { mat3Apply, mat3Multiply, mat3Scale, mat3Translate, type Mat3 } from './mat3.ts';
import { clamp, vec2, type Vec2 } from './vec2.ts';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Camera world → screen.
 *
 * Ma trận đúng SPEC #1:
 *
 * ```
 * screen = scale(RENDER_SCALE) · translate(panX, panY) · scale(zoom) · world
 * ```
 *
 * Chỉ tịnh tiến + phóng đều, **không xoay**, nên đường tròn/elip không méo và
 * raster chỉ cần nhân bán kính với `RENDER_SCALE · zoom`.
 *
 * Gốc pan = 0 ứng với góc trên-trái world. Khi zoom > 1, pan bị kẹp trong
 * `[WORLD_W · (1 − zoom), 0]` (tương tự trục y) để khung nhìn không lộ ra
 * ngoài world.
 */
export class Camera {
  private currentZoom = MIN_ZOOM;
  private currentPanX = 0;
  private currentPanY = 0;
  private cachedMatrix: Mat3 | null = null;

  get zoom(): number {
    return this.currentZoom;
  }

  set zoom(value: number) {
    this.currentZoom = clamp(Number.isFinite(value) ? value : MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
    this.clampPan();
    this.cachedMatrix = null;
  }

  get panX(): number {
    return this.currentPanX;
  }

  set panX(value: number) {
    this.currentPanX = Number.isFinite(value) ? value : 0;
    this.clampPan();
    this.cachedMatrix = null;
  }

  get panY(): number {
    return this.currentPanY;
  }

  set panY(value: number) {
    this.currentPanY = Number.isFinite(value) ? value : 0;
    this.clampPan();
    this.cachedMatrix = null;
  }

  /** Ma trận world → screen (cache tới khi zoom/pan đổi). */
  matrix(): Mat3 {
    if (this.cachedMatrix === null) {
      this.cachedMatrix = mat3Multiply(
        mat3Scale(RENDER_SCALE, RENDER_SCALE),
        mat3Multiply(
          mat3Translate(this.currentPanX, this.currentPanY),
          mat3Scale(this.currentZoom, this.currentZoom),
        ),
      );
    }
    return this.cachedMatrix;
  }

  /** Đổi điểm screen (pixel framebuffer) sang world. */
  screenToWorld(p: Vec2): Vec2 {
    return vec2(
      (p.x / RENDER_SCALE - this.currentPanX) / this.currentZoom,
      (p.y / RENDER_SCALE - this.currentPanY) / this.currentZoom,
    );
  }

  /** Đổi điểm world sang screen (pixel framebuffer). */
  worldToScreen(p: Vec2): Vec2 {
    return mat3Apply(this.matrix(), p);
  }

  /**
   * Phóng to/thu nhỏ quanh một điểm trên màn hình, giữ nguyên điểm world nằm
   * dưới con trỏ:
   *
   * ```
   * pan' = screen / RENDER_SCALE − zoom' · worldUnderCursor
   * ```
   *
   * Nếu pan' vượt biên world thì bị kẹp, nên ở sát mép điểm dưới con trỏ có
   * thể xê dịch một chút — đúng quy ước không cho lộ ngoài world.
   */
  zoomAt(screenPoint: Vec2, factor: number): void {
    if (!Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) return;
    if (!Number.isFinite(factor)) return;

    const before = this.screenToWorld(screenPoint);
    const nextZoom = clamp(this.currentZoom * factor, MIN_ZOOM, MAX_ZOOM);

    this.currentZoom = nextZoom;
    this.currentPanX = screenPoint.x / RENDER_SCALE - nextZoom * before.x;
    this.currentPanY = screenPoint.y / RENDER_SCALE - nextZoom * before.y;
    this.clampPan();
    this.cachedMatrix = null;
  }

  /** Về mức 1×, góc trên-trái world. */
  reset(): void {
    this.currentZoom = MIN_ZOOM;
    this.currentPanX = 0;
    this.currentPanY = 0;
    this.cachedMatrix = null;
  }

  private clampPan(): void {
    if (this.currentZoom <= MIN_ZOOM) {
      this.currentPanX = 0;
      this.currentPanY = 0;
      return;
    }
    this.currentPanX = clamp(this.currentPanX, WORLD_W * (1 - this.currentZoom), 0);
    this.currentPanY = clamp(this.currentPanY, WORLD_H * (1 - this.currentZoom), 0);
  }
}
