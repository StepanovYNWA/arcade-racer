import { Mesh, PlaneGeometry } from "three/webgpu";

import { COLORS } from "./constants";
import { Loop } from "./core/Loop";
import { gridSlot } from "./game/grid";
import { createCar } from "./render/Car";
import { createCamera, fitCamera } from "./render/Camera";
import { PALETTE, flatMaterial } from "./render/materials";
import { createLighting, createRenderer, createScene } from "./render/Renderer";
import { buildTrack, disposeTrack, type Track } from "./track/buildTrack";
import { TRACKS } from "./track/tracks";
import { DebugPanel, showFatal } from "./ui/debug";

/**
 * M0–M1: каркас.
 *
 * Есть: рендерер (WebGPU с автофоллбэком на WebGL2), фиксированный игровой цикл,
 * статичная изокамера с подгонкой под трассу, геометрия всех пяти трасс, одна машинка.
 * Нет: физики, управления, ИИ, препятствий, правил — это M2 и дальше.
 */

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("не найден контейнер #app");

  const { renderer, backend } = await createRenderer(app);
  const debug = new DebugPanel();
  debug.setBackend(backend);

  const scene = createScene();
  createLighting(scene);
  const camera = createCamera();

  const ground = new Mesh(new PlaneGeometry(1600, 1600), flatMaterial(PALETTE.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const car = createCar(COLORS[0]!);
  scene.add(car.group);

  let trackIndex = 0;
  let track: Track | null = null;

  function loadTrack(index: number): void {
    if (track) {
      scene.remove(track.group);
      disposeTrack(track);
    }

    trackIndex = index;
    // сид от индекса: декор одной и той же трассы не пляшет между запусками
    track = buildTrack(TRACKS[index]!, index + 1);
    scene.add(track.group);

    fitCamera(camera, track.path, track.nrm, innerWidth / innerHeight);

    // машинка на поул-позишн — та же формула, что расставит всю сетку в M6
    const slot = gridSlot(track, 0);
    car.group.position.copy(slot.position);
    car.group.rotation.y = slot.heading;

    debug.setTrack(index, TRACKS.length, track.def.name);
  }

  loadTrack(0);

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    if (track) fitCamera(camera, track.path, track.nrm, innerWidth / innerHeight);
  });

  addEventListener("keydown", (e) => {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= TRACKS.length && n - 1 !== trackIndex) {
      loadTrack(n - 1);
      loop.reset();
    }
  });

  const loop = new Loop({
    fixedUpdate: () => {
      // сюда с M2 приходят шаг Rapier, ввод и фазовые часы —
      // вся геймлогика должна жить здесь, а не в render()
    },
    render: () => {
      renderer.render(scene, camera);
    },
  });

  if (import.meta.env.DEV) {
    Object.assign(globalThis, { __racer: { scene, camera, renderer, getTrack: () => track } });
  }

  renderer.setAnimationLoop((now: number) => {
    loop.tick(now);
    debug.setFps(loop.fps, now);
  });
}

main().catch(showFatal);
