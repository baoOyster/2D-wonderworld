import type { SceneObject } from '../scene/types.ts';
import type { Camera } from './camera.ts';
import { RENDER_SCALE } from './config.ts';
import type { Vec2 } from './vec2.ts';

/** Phần engine mà input cần: chỉ camera (để quy đổi và điều khiển zoom/pan). */
export interface InputEngine {
  readonly camera: Camera;
}

/** Phần `World` mà input cần; `World` scene triển khai đủ các hàm này. */
export interface InputWorld {
  pickFromScreen(screenPoint: Vec2): SceneObject | null;
  setHover(obj: SceneObject | null): void;
  clickFromScreen(screenPoint: Vec2): SceneObject | null;
  toggleDayNight(): void;
  select(obj: SceneObject | null): void;
}

/** Hình chữ nhật của `getBoundingClientRect()` (đủ dùng, không phụ thuộc DOM). */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Toạ độ con trỏ theo pixel CSS (giống `MouseEvent`). */
export interface ClientPoint {
  clientX: number;
  clientY: number;
}

/** Khoảng cách tối đa (pixel canvas) để coi một lần nhấn-thả là click. */
const CLICK_SLOP = 4;
/** Tỉ lệ zoom mỗi lần bấm phím +/-. */
const KEY_ZOOM_STEP = 1.2;

/**
 * Quy đổi toạ độ chuột (pixel CSS) → pixel **canvas** (backing store), bù cho
 * việc canvas bị CSS co giãn/letterbox.
 *
 * Kết quả là toạ độ "logical" mà `Camera.screenToWorld` chờ đợi
 * (`screen = world · RENDER_SCALE`).
 */
export function canvasPointToLogical(
  point: ClientPoint,
  rect: RectLike,
  canvasWidth: number,
  canvasHeight: number,
): Vec2 {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((point.clientX - rect.left) / rect.width) * canvasWidth,
    y: ((point.clientY - rect.top) / rect.height) * canvasHeight,
  };
}

/** Hệ số zoom từ `WheelEvent.deltaY`; cuộn lên (deltaY < 0) là phóng to. */
export function wheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  return Math.exp(-deltaY * 0.0015);
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable === true;
}

/**
 * Gắn chuột/bàn phím vào canvas và điều khiển `camera` + `world`.
 *
 * - Chuột trái: chọn vật trên cùng / bỏ chọn khi bấm nền.
 * - Di chuột: cập nhật hover + đổi cursor.
 * - Cuộn: zoom quanh con trỏ (1×–3×).
 * - Giữ chuột giữa/phải hoặc `Space` + kéo trái: pan (camera tự clamp).
 * - `N` ngày/đêm, `+`/`-` zoom, `0` reset, `Esc` bỏ chọn.
 *
 * Trả về hàm cleanup để gỡ mọi listener (dùng cho HMR/test).
 */
export function attachInput(
  canvas: HTMLCanvasElement,
  engine: InputEngine,
  world: InputWorld,
): () => void {
  const camera = engine.camera;

  let panning = false;
  let panPointerId = -1;
  let spaceHeld = false;
  let lastScreen: Vec2 | null = null;
  let pressScreen: Vec2 | null = null;

  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const screenOf = (event: ClientPoint): Vec2 =>
    canvasPointToLogical(event, rect(), canvas.width, canvas.height);

  const setCursor = (value: string): void => {
    canvas.style.cursor = value;
  };

  const centerScreen = (): Vec2 => ({ x: canvas.width / 2, y: canvas.height / 2 });

  const onPointerDown = (event: PointerEvent): void => {
    if (
      event.button === 1 ||
      event.button === 2 ||
      (event.button === 0 && spaceHeld)
    ) {
      panning = true;
      panPointerId = event.pointerId;
      lastScreen = screenOf(event);
      pressScreen = null;
      canvas.setPointerCapture?.(event.pointerId);
      setCursor('grabbing');
      event.preventDefault();
      return;
    }

    if (event.button === 0) {
      pressScreen = screenOf(event);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (panning) {
      const screen = screenOf(event);
      if (lastScreen) {
        camera.panX += (screen.x - lastScreen.x) / RENDER_SCALE;
        camera.panY += (screen.y - lastScreen.y) / RENDER_SCALE;
      }
      lastScreen = screen;
      return;
    }

    const hit = world.pickFromScreen(screenOf(event));
    world.setHover(hit);
    setCursor(hit ? 'pointer' : 'default');
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (panning) {
      if (event.pointerId === panPointerId) {
        panning = false;
        panPointerId = -1;
        lastScreen = null;
        canvas.releasePointerCapture?.(event.pointerId);
        setCursor('default');
      }
      return;
    }

    if (event.button === 0 && pressScreen) {
      const screen = screenOf(event);
      const dx = screen.x - pressScreen.x;
      const dy = screen.y - pressScreen.y;
      pressScreen = null;
      if (dx * dx + dy * dy <= CLICK_SLOP * CLICK_SLOP) {
        world.clickFromScreen(screen);
      }
    }
  };

  const onPointerLeave = (): void => {
    if (panning) return;
    world.setHover(null);
    setCursor('default');
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    camera.zoomAt(screenOf(event), wheelZoomFactor(event.deltaY));
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;

    if (event.key === ' ') {
      spaceHeld = true;
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case 'n':
      case 'N':
        world.toggleDayNight();
        break;
      case '+':
      case '=':
        camera.zoomAt(centerScreen(), KEY_ZOOM_STEP);
        break;
      case '-':
      case '_':
        camera.zoomAt(centerScreen(), 1 / KEY_ZOOM_STEP);
        break;
      case '0':
        camera.reset();
        break;
      case 'Escape':
      case 'Esc':
        world.select(null);
        world.setHover(null);
        break;
      default:
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ') spaceHeld = false;
  };

  const onBlur = (): void => {
    spaceHeld = false;
    panning = false;
    panPointerId = -1;
    lastScreen = null;
  };

  const view = canvas.ownerDocument?.defaultView ?? null;

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  view?.addEventListener('keydown', onKeyDown);
  view?.addEventListener('keyup', onKeyUp);
  view?.addEventListener('blur', onBlur);

  return (): void => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    view?.removeEventListener('keydown', onKeyDown);
    view?.removeEventListener('keyup', onKeyUp);
    view?.removeEventListener('blur', onBlur);
    canvas.style.cursor = '';
  };
}
