import { DAY, NIGHT, mixPalette, type Palette } from '../core/palette.ts';

export interface Theme {
  readonly phase: number;
  readonly isNight: boolean;
  palette(): Palette;
  toggle(): void;
  update(dt: number): void;
}

const DURATION_SECONDS = 1.4;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Smooth reversible day/night transition; palette allocation happens only in update. */
export class DayNightCycle implements Theme {
  private progress = 0;
  private direction: 1 | -1 = -1;
  private currentPalette: Palette = DAY;

  get phase(): number { return smoothstep(this.progress); }
  get isNight(): boolean { return this.phase > 0.5; }
  palette(): Palette { return this.currentPalette; }

  toggle(): void {
    if (this.progress === 0) this.direction = 1;
    else if (this.progress === 1) this.direction = -1;
    else this.direction = this.direction === 1 ? -1 : 1;
  }

  update(dt: number): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.progress = Math.max(0, Math.min(1, this.progress + this.direction * elapsed / DURATION_SECONDS));
    const phase = this.phase;
    this.currentPalette = phase === 0 ? DAY : phase === 1 ? NIGHT : mixPalette(DAY, NIGHT, phase);
  }
}
