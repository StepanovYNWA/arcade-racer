import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh } from "three/webgpu";

import { PALETTE, blobShadowMaterial, flatMaterial } from "./materials";

/**
 * Визуальная машинка — копия low-poly модели из прототипа.
 * Это только меш: с M2 шасси будет двигать Rapier, а группа станет его представлением.
 */
export interface Car {
  readonly group: Group;
  /** кузов — его кренит в повороте (rotation.z) */
  readonly body: Mesh;
  /** четыре колеса — их крутит по скорости (rotation.x) */
  readonly wheels: Mesh[];
}

/** смещения колёс от центра: [x, z] */
const WHEEL_OFFSETS: readonly (readonly [number, number])[] = [
  [-1.05, -1.3],
  [1.05, -1.3],
  [-1.05, 1.3],
  [1.05, 1.3],
];

export function createCar(color: number): Car {
  const group = new Group();

  const body = new Mesh(new BoxGeometry(2.2, 0.8, 4.2), flatMaterial(color));
  body.position.y = 0.75;
  body.castShadow = true;

  const cabin = new Mesh(new BoxGeometry(1.7, 0.7, 2.0), flatMaterial(PALETTE.cabin));
  cabin.position.set(0, 1.35, -0.2);
  cabin.castShadow = true;

  const wheels: Mesh[] = [];
  const wheelGeom = new CylinderGeometry(0.6, 0.6, 0.5, 10);
  const wheelMat = flatMaterial(PALETTE.wheel);
  for (const [x, z] of WHEEL_OFFSETS) {
    const w = new Mesh(wheelGeom, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.6, z);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }

  // мягкий подтенок: настоящая тень от кузова на тёмном асфальте почти не читается
  const blob = new Mesh(new CircleGeometry(2.4, 16), blobShadowMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;

  group.add(body, cabin, blob);
  return { group, body, wheels };
}
