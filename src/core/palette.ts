import { lerpColor, rgb, rgba, type RGBA } from './color.ts';

/** Mọi object chỉ dùng palette, không hardcode màu. Keys khớp SPEC #1. */
export interface Palette {
  skyTop: RGBA; skyMid: RGBA; skyBottom: RGBA; star: RGBA; sun: RGBA; sunGlow: RGBA; moon: RGBA; moonGlow: RGBA;
  cloud: RGBA; cloudShade: RGBA; mountainFar: RGBA; mountainNear: RGBA; forestFar: RGBA; forestNear: RGBA;
  ground: RGBA; groundDark: RGBA; waterDeep: RGBA; waterShallow: RGBA; waterHighlight: RGBA;
  trunk: RGBA; trunkDark: RGBA; trunkLight: RGBA; canopyDark: RGBA; canopy: RGBA; canopyLight: RGBA;
  mushroomCap: RGBA; mushroomCapDark: RGBA; mushroomSpot: RGBA; mushroomStem: RGBA;
  door: RGBA; window: RGBA; windowGlow: RGBA; fence: RGBA; fenceDark: RGBA; wood: RGBA; woodDark: RGBA;
  stone: RGBA; stoneDark: RGBA; pathStone: RGBA; pathStoneDark: RGBA; stem: RGBA; leaf: RGBA;
  flowerRed: RGBA; flowerYellow: RGBA; flowerBlue: RGBA; flowerPurple: RGBA;
  fish: RGBA; fishDark: RGBA; butterflyA: RGBA; butterflyB: RGBA; butterflyC: RGBA;
  firefly: RGBA; fireflyGlow: RGBA; text: RGBA; textDim: RGBA; selection: RGBA; shadow: RGBA;
  brick: RGBA; moss: RGBA; rabbit: RGBA; leafFg: RGBA; ink: RGBA; inkSoft: RGBA;
}

type PaletteInput = { [K in keyof Palette]: string | RGBA };
const makePalette = (colors: PaletteInput): Palette =>
  Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, typeof value === 'string' ? rgb(value) : value])) as unknown as Palette;

/** Ngày: màu tham khảo được tinh chỉnh để phân lớp rõ, giữ tông ấm cho vật thể. */
export const DAY: Palette = makePalette({
  skyTop:'#86bff8', skyMid:'#8ec9f9', skyBottom:'#9fd6f9', star:'#fff7d5', sun:'#fcf9e2', sunGlow:'#ffe8a3', moon:'#fcf9e2', moonGlow:'#fff1c2',
  cloud:'#ffffff', cloudShade:'#cee0f0', mountainFar:'#77b3db', mountainNear:'#679fbe', forestFar:'#7bb1b6', forestNear:'#5b9ba0',
  ground:'#80a444', groundDark:'#3b7050', waterDeep:'#49849a', waterShallow:'#7eb5c2', waterHighlight:'#b9e5dc',
  trunk:'#654d3e', trunkDark:'#49382f', trunkLight:'#89664a', canopyDark:'#28543a', canopy:'#51714a', canopyLight:'#80a444',
  mushroomCap:'#c3574b', mushroomCapDark:'#913e3b', mushroomSpot:'#fff1d5', mushroomStem:'#f9dfb2',
  door:'#d48c58', window:'#c48f5d', windowGlow:'#ffe4a0', fence:'#aa875e', fenceDark:'#72583e', wood:'#8d6948', woodDark:'#604832',
  stone:'#d4bfb4', stoneDark:'#95847e', pathStone:'#f1c791', pathStoneDark:'#bd9168', stem:'#568044', leaf:'#538849',
  flowerRed:'#ed7180', flowerYellow:'#f7d56b', flowerBlue:'#73a9dc', flowerPurple:'#ad83ce',
  fish:'#e78b63', fishDark:'#a85d50', butterflyA:'#e7a7d0', butterflyB:'#82b8e8', butterflyC:'#f0bf69',
  firefly:'#fff3a3', fireflyGlow:'#ffe782', text:'#3a2e2a', textDim:'#6b5e57', selection:'#ffd166', shadow:rgba('#34261f', 0.25),
  brick:'#a95e4b', moss:'#547b45', rabbit:'#e8d8bd', leafFg:'#28543a', ink:'#34261f', inkSoft:'#50403a',
});

/** Đêm: màu lạnh giữ silhouette; nguồn sáng vàng giữ điểm nhấn. */
export const NIGHT: Palette = makePalette({
  skyTop:'#03245b', skyMid:'#48547f', skyBottom:'#204285', star:'#fff1c2', sun:'#fcf9e2', sunGlow:'#fff1c2', moon:'#fbe7b2', moonGlow:'#f6d982',
  cloud:'#46557c', cloudShade:'#303e68', mountainFar:'#0d2e69', mountainNear:'#153b70', forestFar:'#12356b', forestNear:'#0e2f5f',
  ground:'#2d4d2f', groundDark:'#0e3746', waterDeep:'#142b52', waterShallow:'#26426c', waterHighlight:'#7187a8',
  trunk:'#28222d', trunkDark:'#171923', trunkLight:'#3c3440', canopyDark:'#0a2836', canopy:'#192b38', canopyLight:'#29454a',
  mushroomCap:'#5b2034', mushroomCapDark:'#3d1b32', mushroomSpot:'#f0c0a0', mushroomStem:'#ae8273',
  door:'#9a5531', window:'#f6be61', windowGlow:'#ffdc78', fence:'#59434b', fenceDark:'#392e3b', wood:'#3e2f36', woodDark:'#29232f',
  stone:'#4b5786', stoneDark:'#343f68', pathStone:'#73687b', pathStoneDark:'#514b69', stem:'#344c3d', leaf:'#294b42',
  flowerRed:'#ad526e', flowerYellow:'#d0ab62', flowerBlue:'#6686b5', flowerPurple:'#80639f',
  fish:'#8b779d', fishDark:'#5a4d78', butterflyA:'#9f82ba', butterflyB:'#7199c1', butterflyC:'#c49b69',
  firefly:'#fff2a1', fireflyGlow:'#f6be61', text:'#f2ead8', textDim:'#b8a890', selection:'#ffd166', shadow:rgba('#080d25', 0.5),
  brick:'#633c4c', moss:'#243d35', rabbit:'#9a8b83', leafFg:'#0a2836', ink:'#0a0a16', inkSoft:'#141424',
});

/** Mix each packed RGBA entry through the shared color interpolation function. */
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const result = {} as Palette;
  for (const key of Object.keys(a) as (keyof Palette)[]) result[key] = lerpColor(a[key], b[key], t);
  return result;
}
