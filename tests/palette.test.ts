import { describe, expect, it } from 'vitest';
import { DAY, NIGHT, mixPalette } from '../src/core/palette.ts';
import { lerpColor } from '../src/core/color.ts';
import { DayNightCycle } from '../src/scene/theme.ts';

const SPEC_KEYS = `skyTop skyMid skyBottom star sun sunGlow moon moonGlow cloud cloudShade mountainFar mountainNear forestFar forestNear ground groundDark waterDeep waterShallow waterHighlight trunk trunkDark trunkLight canopyDark canopy canopyLight mushroomCap mushroomCapDark mushroomSpot mushroomStem door window windowGlow fence fenceDark wood woodDark stone stoneDark pathStone pathStoneDark stem leaf flowerRed flowerYellow flowerBlue flowerPurple fish fishDark butterflyA butterflyB butterflyC firefly fireflyGlow text textDim selection shadow brick moss rabbit leafFg ink inkSoft`.split(' ');

describe('palette', () => {
  it('matches exactly the 63 palette keys in SPEC #1', () => {
    expect(SPEC_KEYS).toHaveLength(63);
    expect(Object.keys(DAY).sort()).toEqual([...SPEC_KEYS].sort());
    expect(Object.keys(NIGHT).sort()).toEqual([...SPEC_KEYS].sort());
  });

  it('mixes endpoints, midpoint and clamps t', () => {
    expect(mixPalette(DAY, NIGHT, 0)).toEqual(DAY);
    expect(mixPalette(DAY, NIGHT, 1)).toEqual(NIGHT);
    expect(mixPalette(DAY, NIGHT, 0.5).skyTop).toBe(lerpColor(DAY.skyTop, NIGHT.skyTop, 0.5));
    expect(mixPalette(DAY, NIGHT, -2)).toEqual(DAY);
    expect(mixPalette(DAY, NIGHT, 2)).toEqual(NIGHT);
  });
});

describe('DayNightCycle', () => {
  it('reaches exact endpoints and reports night state', () => {
    const cycle = new DayNightCycle();
    cycle.toggle();
    cycle.update(1.4);
    expect(cycle.phase).toBe(1);
    expect(cycle.isNight).toBe(true);
    expect(cycle.palette()).toBe(NIGHT);
    cycle.toggle();
    cycle.update(1.4);
    expect(cycle.phase).toBe(0);
    expect(cycle.isNight).toBe(false);
    expect(cycle.palette()).toBe(DAY);
  });

  it('reverses in mid-transition without a phase jump', () => {
    const cycle = new DayNightCycle();
    cycle.toggle();
    cycle.update(0.5);
    const before = cycle.phase;
    cycle.toggle();
    expect(cycle.phase).toBe(before);
    cycle.update(0.2);
    expect(cycle.phase).toBeLessThan(before);
  });

  it('clamps large elapsed time and handles invalid dt', () => {
    const cycle = new DayNightCycle();
    cycle.toggle();
    cycle.update(100);
    expect(cycle.phase).toBe(1);
    cycle.update(100);
    expect(cycle.phase).toBe(1);
    cycle.toggle();
    cycle.update(Number.NaN);
    expect(cycle.phase).toBe(1);
  });

  it('returns a cached palette between updates', () => {
    const cycle = new DayNightCycle();
    const cached = cycle.palette();
    cycle.toggle();
    expect(cycle.palette()).toBe(cached);
    cycle.update(0.2);
    expect(cycle.palette()).not.toBe(cached);
  });
});
