import type { SceneObject } from '../types.ts';
import { Celestial } from './celestial.ts';
import { CloudLayer } from './clouds.ts';
import { Forest } from './forest.ts';
import { Ground } from './ground.ts';
import { Mountains } from './mountains.ts';
import { Sky } from './sky.ts';
import { Stars } from './stars.ts';

export { Sky } from './sky.ts';
export { Stars } from './stars.ts';
export { Celestial } from './celestial.ts';
export { CloudLayer } from './clouds.ts';
export { Mountains } from './mountains.ts';
export { Forest } from './forest.ts';
export { Ground } from './ground.ts';

/** Sky, night stars, and clickable sun/moon; later background parts append here. */
export function createBackground(): SceneObject[] {
  return [new Sky(), new Stars(), new Celestial(), new CloudLayer(), new Mountains(), new Forest(), new Ground()];
}
