import { ConeGeometry, CylinderGeometry, Mesh } from "three/webgpu";

import { CONE_HEIGHT, CONE_RADIUS, TIRE_RADIUS, TIRE_THICKNESS } from "../constants";

import { PALETTE, flatMaterial } from "./materials";

/**
 * Меши препятствий — из прототипа. Начало меша совпадает с началом физического тела,
 * поэтому трансформ от Rapier кладётся в меш как есть.
 */

const coneGeometry = new ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 10);
const tireGeometry = new CylinderGeometry(TIRE_RADIUS, TIRE_RADIUS, TIRE_THICKNESS, 14);

export function createConeMesh(): Mesh {
  const m = new Mesh(coneGeometry, flatMaterial(PALETTE.cone));
  m.castShadow = true;
  return m;
}

export function createTireMesh(): Mesh {
  const m = new Mesh(tireGeometry, flatMaterial(PALETTE.tire));
  m.castShadow = true;
  return m;
}
