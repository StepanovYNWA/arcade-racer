import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh } from "three/webgpu";

import { WHEELS, WHEEL_RADIUS } from "../constants";

import { PALETTE, blobShadowMaterial, flatMaterial } from "./materials";

/**
 * Визуальная машинка — low-poly модель из прототипа.
 * Положение группы задаёт физика; колёса подчиняются подвеске и рулю.
 */
export interface Car {
  readonly group: Group;
  /** кузов — его кренит в повороте */
  readonly body: Mesh;
  /**
   * Пивоты колёс в порядке WHEELS. Поворот руля идёт в rotation.y, качение —
   * в rotation.x, ход подвески — в position.y; порядок Эйлера YXZ, чтобы
   * колесо крутилось вокруг уже повёрнутой оси, а не вокруг исходной.
   */
  readonly wheels: Group[];
}

export function createCar(color: number): Car {
  const group = new Group();

  const body = new Mesh(new BoxGeometry(2.2, 0.8, 4.2), flatMaterial(color));
  body.position.y = 0.75;
  body.castShadow = true;

  const cabin = new Mesh(new BoxGeometry(1.7, 0.7, 2.0), flatMaterial(PALETTE.cabin));
  cabin.position.set(0, 1.35, -0.2);
  cabin.castShadow = true;

  const wheels: Group[] = [];
  const wheelGeom = new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.5, 10);
  const wheelMat = flatMaterial(PALETTE.wheel);
  for (const spec of WHEELS) {
    const mesh = new Mesh(wheelGeom, wheelMat);
    mesh.rotation.z = Math.PI / 2; // положить цилиндр на бок
    mesh.castShadow = true;

    const pivot = new Group();
    pivot.rotation.order = "YXZ";
    pivot.position.set(spec.x, WHEEL_RADIUS, spec.z);
    pivot.add(mesh);

    group.add(pivot);
    wheels.push(pivot);
  }

  // мягкий подтенок: настоящая тень от кузова на тёмном асфальте почти не читается
  const blob = new Mesh(new CircleGeometry(2.4, 16), blobShadowMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;

  group.add(body, cabin, blob);
  return { group, body, wheels };
}
