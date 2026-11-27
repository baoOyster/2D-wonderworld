/**
 * Điểm vào lớp UI: gắn toolbar + panel lên một container (thường `document.body`).
 *
 * UI chỉ đọc trạng thái qua `World`/`Camera` và gọi API công khai; một vòng
 * `requestAnimationFrame` đồng bộ panel/nhãn, không cần `World` biết về DOM.
 */
import './ui.css';
import type { SceneObject } from '../scene/types.ts';
import type { World } from '../scene/world.ts';
import { createInfoPanel } from './panel.ts';
import { createToolbar, type UiEngine } from './toolbar.ts';

export type { InfoPanel } from './panel.ts';
export type { Toolbar, UiEngine } from './toolbar.ts';
export { createInfoPanel } from './panel.ts';
export { createToolbar } from './toolbar.ts';

/**
 * Gắn UI vào `container`; trả hàm cleanup để gỡ toàn bộ (dùng khi HMR/unmount).
 */
export function mountUi(container: HTMLElement, engine: UiEngine, world: World): () => void {
  const shell = document.createElement('div');
  shell.className = 'ui-shell';

  const toolbarRoot = document.createElement('div');
  toolbarRoot.className = 'ui-shell__toolbar';

  const panelRoot = document.createElement('div');
  panelRoot.className = 'ui-shell__panel';

  shell.append(toolbarRoot, panelRoot);
  container.appendChild(shell);

  const panel = createInfoPanel(panelRoot, {
    onClose: () => world.select(null),
  });
  const toolbar = createToolbar(toolbarRoot, { engine, world });

  let lastSelected: SceneObject | null | undefined;
  let frame = 0;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;

    const selected = world.getSelected();
    if (selected !== lastSelected) {
      lastSelected = selected;
      panel.setObject(selected);
    }
    toolbar.sync();

    frame = requestAnimationFrame(tick);
  };

  lastSelected = world.getSelected();
  panel.setObject(lastSelected);
  frame = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    panel.destroy();
    toolbar.destroy();
    shell.remove();
  };
}
