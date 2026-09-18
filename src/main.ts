import { Mesh, PlaneGeometry, Quaternion, Vector3 } from "three/webgpu";

import { FIELD_SIZE, OBSTACLES_ENABLED } from "./constants";
import { KeyboardInput } from "./core/Input";
import { Loop } from "./core/Loop";
import { createField, type Racer } from "./game/Racer";
import { Barriers } from "./physics/Barriers";
import { Obstacles } from "./physics/Obstacles";
import { PhysicsDebugRender } from "./physics/DebugRender";
import { PhysicsWorld } from "./physics/World";
import { createCamera, fitCamera } from "./render/Camera";
import { PALETTE, flatMaterial } from "./render/materials";
import { createLighting, createRenderer, createScene } from "./render/Renderer";
import { buildTrack, disposeTrack, type Track } from "./track/buildTrack";
import { TRACKS } from "./track/tracks";
import { DebugPanel, showFatal } from "./ui/debug";

/**
 * M5: соперники.
 *
 * Есть: raycast-подвеска, стены по кромкам дороги, газ через частоту нажатий,
 * руль, тормоз, задний ход, занос, конусы и покрышки, трое соперников с ИИ.
 * Всё это крутится в фиксированном тике, рендер интерполирует между тиками.
 * Препятствия сейчас отключены флагом OBSTACLES_ENABLED: управление и правила
 * доводятся на чистом полотне, флаг возвращает их обратно.
 * Нет: правил и фаз уик-энда (M6).
 */

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) throw new Error("не найден контейнер #app");

  // WASM Rapier грузится асинхронно — это первый await в bootstrap
  const physics = await PhysicsWorld.create();
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

  const input = new KeyboardInput();
  const physicsDebug = new URLSearchParams(location.search).has("physics")
    ? new PhysicsDebugRender(physics, scene)
    : null;

  let trackIndex = 0;
  let track: Track | null = null;
  let barriers: Barriers | null = null;
  let obstacles: Obstacles | null = null;
  let racers: Racer[] = [];

  function loadTrack(index: number): void {
    if (track) {
      scene.remove(track.group);
      disposeTrack(track);
    }
    barriers?.dispose();
    obstacles?.dispose();

    trackIndex = index;
    // сид от индекса: декор одной и той же трассы не пляшет между запусками
    track = buildTrack(TRACKS[index]!, index + 1);
    scene.add(track.group);
    barriers = new Barriers(physics, track);
    // сид тот же, что у декора: раскладка препятствий не пляшет между запусками
    obstacles = OBSTACLES_ENABLED
      ? new Obstacles(physics, track, scene, index + 1)
      : null;

    fitCamera(camera, track.path, track.nrm, innerWidth / innerHeight);

    // Поле строится заново на каждой трассе: сетка стоит в её координатах, а
    // переносить четыре тела по кругу дороже и запутаннее, чем пересобрать.
    for (const r of racers) scene.remove(r.group);
    racers = createField(physics, track, FIELD_SIZE);
    for (const r of racers) scene.add(r.group);

    input.clear();
    debug.setTrack(index, TRACKS.length, track.def.name);
  }

  loadTrack(0);

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    if (track) fitCamera(camera, track.path, track.nrm, innerWidth / innerHeight);
  });

  addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && track) {
      for (const r of racers) r.reset(track);
      obstacles?.reset();
      input.clear();
      return;
    }
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= TRACKS.length && n - 1 !== trackIndex) {
      loadTrack(n - 1);
      loop.reset();
    }
  });

  const framePos = new Vector3();
  const frameRot = new Quaternion();

  const loop = new Loop({
    fixedUpdate: (dt) => {
      // порядок важен: силы колёс -> шаг мира -> снять трансформ.
      // Клавиатура читается ОДИН раз на тик: read() обнуляет накопленные нажатия,
      // и второй вызов внутри цикла по участникам съедал бы газ игрока.
      const human = input.read();
      const t = track!;
      for (const r of racers) r.vehicle.update(r.think(t, dt, human), dt);
      physics.step();
      for (const r of racers) r.sync(t);
      obstacles?.sync();
    },
    render: (alpha) => {
      for (const r of racers) r.interpolate(alpha, framePos, frameRot);

      obstacles?.interpolate(alpha);
      const me = racers[0]!.vehicle;
      debug.setDrive(me.speed, me.revsNorm, me.slipAngle);
      debug.setOrder(racers, track!.length);
      physicsDebug?.update();
      renderer.render(scene, camera);
    },
  });

  if (import.meta.env.DEV) {
    Object.assign(globalThis, {
      __racer: {
        scene,
        camera,
        renderer,
        physics,
        loop,
        getTrack: () => track,
        getRacers: () => racers,
        getVehicle: () => racers[0]?.vehicle ?? null,
      },
    });
  }

  renderer.setAnimationLoop((now: number) => {
    loop.tick(now);
    debug.setFps(loop.fps, now);
  });
}

main().catch(showFatal);
