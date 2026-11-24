import './style.css';
import { Engine, type Scene } from './core/engine.ts';
import { Renderer } from './core/renderer.ts';
import { demoNames, resolveDemo } from './demo/index.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Không tìm thấy canvas #stage');

const params = new URLSearchParams(location.search);
const demoName = params.get('demo');
const debug = params.get('debug') === '1';
const demo = resolveDemo(demoName);

const engine = new Engine(
  canvas,
  (framebuffer, camera) => new Renderer(framebuffer, camera),
);

const scene: Scene = {
  update(): void {
    // Demo tự dùng `time` khi vẽ; update dành cho scene chung (#9).
  },
  draw(_renderer): void {
    demo(engine.framebuffer, engine.time);
  },
  drawOverlay(renderer): void {
    if (!debug) return;

    const label = demoName && demoNames.includes(demoName)
      ? `demo=${demoName}`
      : 'demo=gradient';
    renderer.text(
      `FPS ${engine.fps.toFixed(0)}  ·  Zoom ${engine.camera.zoom.toFixed(2)}x`,
      14,
      14,
      0xfff8e7ff,
      1,
      'left',
      0x000000b0,
    );
    renderer.text(
      `${label}  ·  vẽ ${engine.renderTime.toFixed(1)} ms`,
      14,
      46,
      0xfff8e7ff,
      1,
      'left',
      0x000000b0,
    );
  },
};

engine.mount(scene);
engine.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => engine.stop());
}
