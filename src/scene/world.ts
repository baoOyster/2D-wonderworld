import type { Camera } from '../core/camera.ts';
import type { Scene } from '../core/engine.ts';
import { boundsContain, boundsOf, pointInPolygon } from '../core/hit-test.ts';
import type { Renderer } from '../core/renderer-types.ts';
import type { Vec2 } from '../core/vec2.ts';
import type { Theme } from './theme.ts';
import type { Env, SceneObject, UiActions, WorldCallbacks } from './types.ts';

/**
 * Điều phối toàn bộ cảnh: giữ danh sách vật thể, tạo `Env` mỗi khung, vẽ theo
 * `layer`, và xử lý chọn/hover bằng point-in-polygon.
 *
 * `World` là nơi duy nhất quyết định thứ tự update/draw/pick; input và UI chỉ
 * gọi API công khai ở đây.
 */
export class World implements Scene, UiActions {
  private readonly camera: Camera;
  private readonly theme: Theme;
  private readonly callbacks: WorldCallbacks;
  private readonly objects: readonly SceneObject[];
  private currentEnv: Env;
  private selected: SceneObject | null = null;
  private hovered: SceneObject | null = null;

  constructor(
    camera: Camera,
    objects: readonly SceneObject[],
    theme: Theme,
    callbacks: WorldCallbacks = {},
  ) {
    this.camera = camera;
    this.theme = theme;
    this.callbacks = callbacks;
    // Sort ổn định: cùng layer giữ nguyên thứ tự đăng ký.
    this.objects = [...objects].sort((a, b) => a.layer - b.layer);
    this.currentEnv = this.makeEnv(0, 1 / 60);
  }

  /** Ảnh chụp môi trường của khung gần nhất (dùng cho demo/UI đọc palette). */
  get environment(): Env {
    return this.currentEnv;
  }

  /** Danh sách vật thể đã sắp theo layer (chỉ đọc). */
  get sceneObjects(): readonly SceneObject[] {
    return this.objects;
  }

  update(dt: number, time: number): void {
    this.theme.update(dt);
    this.currentEnv = this.makeEnv(time, dt);
    for (const obj of this.objects) obj.update?.(this.currentEnv);
  }

  draw(renderer: Renderer): void {
    for (const obj of this.objects) obj.draw(renderer, this.currentEnv);
  }

  /**
   * Viền tạm cho vật đang chọn (ray casting polygon). #25 sẽ thay bằng hiệu
   * ứng outline/hover đầy đủ.
   */
  drawOverlay(renderer: Renderer): void {
    const selected = this.selected;
    if (!selected?.hitPolygons) return;
    const color = this.currentEnv.palette.selection;
    for (const poly of selected.hitPolygons(this.currentEnv)) {
      renderer.polygon(poly, color, false);
    }
  }

  toggleDayNight(): void {
    this.theme.toggle();
  }

  select(obj: SceneObject | null): void {
    if (obj === this.selected) return;
    this.selected = obj;
    this.callbacks.onSelectionChange?.(obj);
  }

  getSelected(): SceneObject | null {
    return this.selected;
  }

  /** Vật đang hover (do input cập nhật), hoặc `null`. */
  getHovered(): SceneObject | null {
    return this.hovered;
  }

  /** Cập nhật hover; chỉ gọi callback khi trạng thái đổi. */
  setHover(obj: SceneObject | null): void {
    if (obj === this.hovered) return;
    this.hovered = obj;
    this.callbacks.onHoverChange?.(obj);
  }

  /** Pick theo toạ độ **screen** (pixel framebuffer, trước `screenToWorld`). */
  pickFromScreen(screenPoint: Vec2): SceneObject | null {
    return this.pickAt(this.camera.screenToWorld(screenPoint));
  }

  /** Pick theo toạ độ world. */
  pickAt(worldPoint: Vec2): SceneObject | null {
    // Duyệt từ layer cao xuống: vật vẽ sau nằm trên, được ưu tiên.
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      if (!obj.interactive || !obj.hitPolygons) continue;

      const polygons = obj.hitPolygons(this.currentEnv);
      const bounds = boundsOf(polygons);
      if (!bounds || !boundsContain(bounds, worldPoint)) continue;

      for (const poly of polygons) {
        if (pointInPolygon(worldPoint, poly)) return obj;
      }
    }
    return null;
  }

  /** Pick theo screen rồi cập nhật hover; trả vật dưới con trỏ. */
  hoverFromScreen(screenPoint: Vec2): SceneObject | null {
    const hit = this.pickFromScreen(screenPoint);
    this.setHover(hit);
    return hit;
  }

  /**
   * Xử lý một cú click trái tại toạ độ screen: chọn vật trên cùng, gọi
   * `onClick` của nó; click vào nền thì bỏ chọn.
   */
  clickFromScreen(screenPoint: Vec2): SceneObject | null {
    const hit = this.pickFromScreen(screenPoint);
    this.select(hit);
    hit?.onClick?.({ env: this.currentEnv, ui: this });
    return hit;
  }

  private makeEnv(time: number, dt: number): Env {
    return {
      time,
      dt,
      dayPhase: this.theme.phase,
      palette: this.theme.palette(),
      camera: this.camera,
    };
  }
}
