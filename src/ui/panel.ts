/**
 * Panel thông tin vật thể: tên, mô tả và các chip thuật toán.
 *
 * Panel chỉ hiển thị dữ liệu do `World` chọn; đóng panel (nút × hoặc Esc) gọi
 * `onClose` để lớp gọi bỏ chọn. Nội dung đặt bằng `textContent` nên an toàn với
 * ký tự đặc biệt, không dùng `innerHTML`.
 */
import type { SceneObject } from '../scene/types.ts';

export interface InfoPanelOptions {
  /** Gọi khi người dùng đóng panel (nút × hoặc Esc). */
  onClose?: () => void;
}

export interface InfoPanel {
  readonly element: HTMLElement;
  /** Cập nhật vật đang chọn; `null` sẽ ẩn panel. */
  setObject(obj: SceneObject | null): void;
  /** Ẩn panel ngay. */
  hide(): void;
  /** Gỡ listener và phần tử khỏi DOM. */
  destroy(): void;
}

let panelSeq = 0;

export function createInfoPanel(root: HTMLElement, options: InfoPanelOptions = {}): InfoPanel {
  const titleId = `ui-panel-title-${++panelSeq}`;

  const element = document.createElement('aside');
  element.className = 'ui-panel';
  element.hidden = true;
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-labelledby', titleId);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ui-panel__close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Đóng bảng thông tin');
  close.title = 'Đóng (Esc)';

  const title = document.createElement('h2');
  title.className = 'ui-panel__title';
  title.id = titleId;

  const description = document.createElement('p');
  description.className = 'ui-panel__description';

  const algorithms = document.createElement('ul');
  algorithms.className = 'ui-panel__algorithms';
  algorithms.setAttribute('aria-label', 'Thuật toán sử dụng');

  element.append(close, title, description, algorithms);
  root.appendChild(element);

  let current: SceneObject | null = null;

  function render(obj: SceneObject | null): void {
    if (obj === current) return;
    current = obj;

    if (!obj) {
      element.hidden = true;
      title.textContent = '';
      description.textContent = '';
      algorithms.replaceChildren();
      return;
    }

    title.textContent = obj.name;
    description.textContent = obj.description;
    algorithms.replaceChildren(
      ...obj.algorithms.map((name) => {
        const chip = document.createElement('li');
        chip.className = 'ui-panel__algorithm';
        chip.textContent = name;
        return chip;
      }),
    );
    element.hidden = false;
  }

  function hide(): void {
    render(null);
  }

  function closePanel(): void {
    hide();
    options.onClose?.();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || element.hidden) return;
    event.preventDefault();
    closePanel();
  }

  close.addEventListener('click', closePanel);
  document.addEventListener('keydown', onKeydown);

  return {
    element,
    setObject: render,
    hide,
    destroy() {
      close.removeEventListener('click', closePanel);
      document.removeEventListener('keydown', onKeydown);
      element.remove();
    },
  };
}
