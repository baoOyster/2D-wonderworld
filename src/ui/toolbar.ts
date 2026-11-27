/**
 * Toolbar điều khiển: zoom +/−, đặt lại camera, chuyển ngày/đêm.
 *
 * Toolbar gọi thẳng API của `Camera`/`World` (không tự giữ trạng thái cảnh).
 * `sync()` đọc lại trạng thái thật để nhãn zoom và ngày/đêm luôn khớp, kể cả
 * khi người dùng dùng chuột/phím tắt thay vì bấm nút.
 */
import type { Camera } from '../core/camera.ts';
import type { World } from '../scene/world.ts';
import { dayNightLabel, formatZoom, SHORTCUT_HINTS } from './labels.ts';

/** Phần engine mà toolbar cần: camera và kích thước framebuffer để lấy tâm. */
export interface UiEngine {
  readonly camera: Camera;
  readonly framebuffer: { readonly width: number; readonly height: number };
}

export interface ToolbarOptions {
  engine: UiEngine;
  world: World;
}

export interface Toolbar {
  readonly element: HTMLElement;
  /** Đồng bộ nhãn với trạng thái hiện tại của camera/cảnh. */
  sync(): void;
  destroy(): void;
}

const ZOOM_FACTOR = 1.2;

interface ButtonSpec {
  label: string;
  title: string;
  ariaLabel: string;
  onClick: () => void;
}

export function createToolbar(root: HTMLElement, { engine, world }: ToolbarOptions): Toolbar {
  const element = document.createElement('div');
  element.className = 'ui-toolbar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Điều khiển cảnh');

  const center = (): { x: number; y: number } => ({
    x: engine.framebuffer.width / 2,
    y: engine.framebuffer.height / 2,
  });

  const makeButton = (spec: ButtonSpec): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-toolbar__button';
    button.textContent = spec.label;
    button.title = spec.title;
    button.setAttribute('aria-label', spec.ariaLabel);
    button.addEventListener('click', spec.onClick);
    return button;
  };

  const zoomIn = makeButton({
    label: '+',
    title: 'Phóng to (+)',
    ariaLabel: 'Phóng to',
    onClick: () => engine.camera.zoomAt(center(), ZOOM_FACTOR),
  });
  const zoomOut = makeButton({
    label: '−',
    title: 'Thu nhỏ (−)',
    ariaLabel: 'Thu nhỏ',
    onClick: () => engine.camera.zoomAt(center(), 1 / ZOOM_FACTOR),
  });
  const reset = makeButton({
    label: 'Đặt lại',
    title: 'Về khung mặc định (0)',
    ariaLabel: 'Đặt lại camera',
    onClick: () => engine.camera.reset(),
  });

  const readout = document.createElement('span');
  readout.className = 'ui-toolbar__readout';
  readout.setAttribute('aria-live', 'polite');
  readout.title = 'Mức phóng to hiện tại';

  const dayNight = makeButton({
    label: 'Ngày',
    title: 'Chuyển ngày/đêm (N)',
    ariaLabel: 'Chuyển ngày/đêm',
    onClick: () => world.toggleDayNight(),
  });
  dayNight.setAttribute('aria-pressed', 'false');

  const hint = document.createElement('span');
  hint.className = 'ui-toolbar__hint';
  hint.textContent = SHORTCUT_HINTS;

  element.append(zoomIn, zoomOut, reset, readout, dayNight, hint);
  root.appendChild(element);

  let lastLabel = '';
  let lastZoom = Number.NaN;

  function sync(): void {
    const label = dayNightLabel(world.environment.dayPhase);
    if (label !== lastLabel) {
      lastLabel = label;
      dayNight.textContent = label;
      dayNight.setAttribute('aria-pressed', label === 'Đêm' ? 'true' : 'false');
    }

    const zoom = engine.camera.zoom;
    if (zoom !== lastZoom) {
      lastZoom = zoom;
      readout.textContent = formatZoom(zoom);
    }
  }

  sync();

  return {
    element,
    sync,
    destroy() {
      element.remove();
    },
  };
}
