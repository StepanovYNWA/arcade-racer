import { Color, MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";

/**
 * Low-poly материалы. Палитра — из прототипа.
 *
 * Берём node-материалы (MeshStandardNodeMaterial и т.д.): на WebGPU-бэкенде они
 * компилируются в WGSL, на WebGL2-фоллбэке — в GLSL, один и тот же код работает на обоих.
 * Плоский шейдинг (flatShading) — то, что и даёт гранёный low-poly вид.
 */

export const PALETTE = {
  sky: 0x87b7e8,
  ground: 0x6ab04a,
  asphalt: 0x33383f,
  kerb: 0xf2f2f2,
  trunk: 0x6b4a2b,
  leaf: 0x2f7d34,
  cone: 0xff7a1a,
  tire: 0x1b1b1b,
  cabin: 0x1b2733,
  wheel: 0x15181c,
  checkerDark: 0x111111,
  checkerLight: 0xffffff,
} as const;

/** Один материал на цвет — сотня деревьев не должна плодить сотню программ. */
const flatCache = new Map<number, MeshStandardNodeMaterial>();

/** Плоскошейдинговый standard-материал; для одинакового цвета возвращает тот же объект. */
export function flatMaterial(color: number): MeshStandardNodeMaterial {
  let m = flatCache.get(color);
  if (!m) {
    m = new MeshStandardNodeMaterial({
      color: new Color(color),
      flatShading: true,
      roughness: 0.85,
      metalness: 0.0,
    });
    flatCache.set(color, m);
  }
  return m;
}

/** Материал для плоской разметки: без граней, но и без лишних бликов. */
export function markingMaterial(color: number): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({
    color: new Color(color),
    roughness: 0.95,
    metalness: 0.0,
  });
}

/** Подтенок под машиной — простой полупрозрачный круг, как в прототипе. */
export function blobShadowMaterial(): MeshBasicNodeMaterial {
  return new MeshBasicNodeMaterial({
    color: new Color(0x000000),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
}

/** Сбросить кэш материалов (на случай смены палитры в рантайме). */
export function disposeMaterials(): void {
  for (const m of flatCache.values()) m.dispose();
  flatCache.clear();
}
