import { Matrix4, OrthographicCamera, Vector3 } from "three/webgpu";

import { CAM_DISTANCE, CAM_HEIGHT, CAM_MARGIN, CAM_PADDING, ROAD_HW } from "../constants";

/**
 * Статичная изометрическая ортокамера — как в прототипе.
 *
 * Камера не следует за машиной: вся трасса всегда в кадре, масштаб внутри заезда
 * постоянный. Направление взгляда — вдоль (1,1,1), то есть азимут 45° и наклон ~35.26°.
 */

/** ось, вдоль которой камера отодвигается от центра сцены */
const ISO = new Vector3(1, 1, 1).normalize();
const CENTER = new Vector3(0, 0, 0);

export function createCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-100, 100, 100, -100, 0.1, 2500);
  camera.position.copy(ISO).multiplyScalar(CAM_DISTANCE).add(CENTER);
  camera.up.set(0, 1, 0);
  camera.lookAt(CENTER);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Подгоняет границы отсечения под габариты трассы.
 *
 * Все точки осевой линии раздвигаются по нормали на полуширину дороги плюс обочину,
 * берутся на двух высотах и проецируются в пространство камеры; по получившемуся
 * прямоугольнику и выставляются left/right/top/bottom. Узкая сторона расширяется
 * под пропорции окна, поэтому трасса не обрезается ни в каком соотношении сторон.
 *
 * Вызывать после смены трассы и на resize.
 */
export function fitCamera(
  camera: OrthographicCamera,
  path: readonly Vector3[],
  nrm: readonly Vector3[],
  aspect: number,
): void {
  camera.position.copy(ISO).multiplyScalar(CAM_DISTANCE).add(CENTER);
  camera.up.set(0, 1, 0);
  camera.lookAt(CENTER);
  camera.updateMatrixWorld(true);

  const inv = new Matrix4().copy(camera.matrixWorld).invert();
  const v = new Vector3();
  const M = ROAD_HW + CAM_MARGIN;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const n = nrm[i]!;
    for (const s of [-M, M]) {
      for (const h of [0, CAM_HEIGHT]) {
        v.set(p.x + n.x * s, h, p.z + n.z * s).applyMatrix4(inv);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    }
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let hw = (maxX - minX) / 2 + CAM_PADDING;
  let hh = (maxY - minY) / 2 + CAM_PADDING;
  if (hw / hh < aspect) hw = hh * aspect;
  else hh = hw / aspect;

  camera.left = cx - hw;
  camera.right = cx + hw;
  camera.top = cy + hh;
  camera.bottom = cy - hh;
  camera.near = 0.1;
  camera.far = 2500;
  camera.updateProjectionMatrix();
}
