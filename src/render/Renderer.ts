import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  WebGPURenderer,
} from "three/webgpu";
import WebGPU from "three/addons/capabilities/WebGPU.js";

import { PALETTE } from "./materials";

export type BackendName = "WebGPU" | "WebGL2";

export interface RendererBundle {
  renderer: WebGPURenderer;
  /** какой бэкенд реально поднялся — показываем на экране, чтобы фоллбэк не был молчаливым */
  backend: BackendName;
}

function isWebGPU(renderer: WebGPURenderer): boolean {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
}

async function makeRenderer(forceWebGL: boolean): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap в WebGPURenderer больше не поддерживается (удалён в r186)
  renderer.shadowMap.type = PCFShadowMap;
  await renderer.init();
  return renderer;
}

/**
 * Пробный кадр.
 *
 * init() может пройти успешно, а первый же render() — упасть: так ведёт себя браузер
 * с частичной или устаревшей реализацией WebGPU (навигатор рапортует поддержку, адаптер
 * выдаётся, а дальше рендерер натыкается на незнакомое поле дескриптора). Без этой
 * проверки пользователь получил бы ровно тот чёрный экран, от которого нас страхует
 * фоллбэк. Пустой сцены достаточно — падение происходит на подготовке целей рендера.
 */
function smokeTest(renderer: WebGPURenderer): boolean {
  try {
    renderer.render(new Scene(), new OrthographicCamera(-1, 1, 1, -1, 0.1, 10));
    return true;
  } catch (err) {
    console.warn("[renderer] WebGPU-бэкенд не пережил пробный кадр:", err);
    return false;
  }
}

/**
 * Создаёт рендерер.
 *
 * WebGPURenderer сам умеет откатываться на WebGL2-бэкенд, если WebGPU недоступен
 * (Safari, старые драйверы, headless-окружения). Мы добавляем к этому проверку боем:
 * если WebGPU поднялся, но не рисует, пересоздаём рендерер с forceWebGL.
 * `?webgl` в адресной строке включает фоллбэк принудительно.
 */
export async function createRenderer(container: HTMLElement): Promise<RendererBundle> {
  const forceWebGL = new URLSearchParams(location.search).has("webgl");
  if (!forceWebGL && !WebGPU.isAvailable()) {
    console.warn("[renderer] WebGPU недоступен — уходим на WebGL2-бэкенд");
  }

  let renderer = await makeRenderer(forceWebGL);
  container.appendChild(renderer.domElement);

  if (isWebGPU(renderer) && !smokeTest(renderer)) {
    container.removeChild(renderer.domElement);
    renderer.dispose();
    renderer = await makeRenderer(true);
    container.appendChild(renderer.domElement);
  }

  return { renderer, backend: isWebGPU(renderer) ? "WebGPU" : "WebGL2" };
}

export interface Lighting {
  sun: DirectionalLight;
  hemi: HemisphereLight;
}

/** полуразмер ортобокса теней: трассы укладываются в ~±130 */
const SHADOW_EXTENT = 130;

/**
 * Свет — по мотивам прототипа (r128).
 *
 * Прототип писался до r155, где отключили legacy-режим освещения: тогда интенсивность
 * прямого света домножалась на π внутри рендерера. Чтобы яркость сцены осталась той же,
 * исходные значения (hemi 0.85, sun 1.15) домножаем на π здесь.
 */
export function createLighting(scene: Scene): Lighting {
  const hemi = new HemisphereLight(0xbfe0ff, 0x4a6b3a, 0.85 * Math.PI);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff4e0, 1.15 * Math.PI);
  sun.position.set(80, 150, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);

  const cam = sun.shadow.camera;
  cam.left = -SHADOW_EXTENT;
  cam.right = SHADOW_EXTENT;
  cam.top = SHADOW_EXTENT;
  cam.bottom = -SHADOW_EXTENT;
  cam.near = 1;
  cam.far = 460;
  cam.updateProjectionMatrix();

  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  return { sun, hemi };
}

/** Небо — тот же цвет, что и фон страницы, чтобы не было вспышки при загрузке. */
export function createScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  return scene;
}
