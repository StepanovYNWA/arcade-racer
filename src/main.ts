import { Mesh, PlaneGeometry, Quaternion, Vector3 } from "three/webgpu";

import { COLORS, OBSTACLES_ENABLED, SUSPENSION_ANCHOR_Y, WHEELS } from "./constants";
import { KeyboardInput } from "./core/Input";
import { Loop } from "./core/Loop";
import { gridSlot } from "./game/grid";
import { Barriers } from "./physics/Barriers";
import { Obstacles } from "./physics/Obstacles";
import { PhysicsDebugRender } from "./physics/DebugRender";
import { Vehicle, type Spawn } from "./physics/Vehicle";
import { PhysicsWorld } from "./physics/World";
import { createCar } from "./render/Car";
import { createCamera, fitCamera } from "./render/Camera";
import { PALETTE, flatMaterial } from "./render/materials";
import { createLighting, createRenderer, createScene } from "./render/Renderer";
import { buildTrack, disposeTrack, type Track } from "./track/buildTrack";
import { TRACKS } from "./track/tracks";
import { DebugPanel, showFatal } from "./ui/debug";

/**
 * M4: препятствия как настоящие тела.
 *
 * Есть: raycast-подвеска, стены по кромкам дороги, газ через частоту нажатий,
 * руль, тормоз, задний ход, занос, конусы и покрышки. Всё это крутится
 * в фиксированном тике, рендер интерполирует между тиками.
 * Препятствия сейчас отключены флагом OBSTACLES_ENABLED: управление и правила
 * доводятся на чистом полотне, флаг возвращает их обратно.
 * Нет: ИИ (M5), правил (M6).
 */

/** чуть выше земли, чтобы на старте колёса не оказались в полу */
const SPAWN_LIFT = 0.1;

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

  const car = createCar(COLORS[0]!);
  scene.add(car.group);

  const input = new KeyboardInput();
  const physicsDebug = new URLSearchParams(location.search).has("physics")
    ? new PhysicsDebugRender(physics, scene)
    : null;

  let trackIndex = 0;
  let track: Track | null = null;
  let barriers: Barriers | null = null;
  let obstacles: Obstacles | null = null;
  let vehicle: Vehicle | null = null;

  function spawnPoint(t: Track): Spawn {
    const slot = gridSlot(t, 0);
    return { position: slot.position.clone().setY(SPAWN_LIFT), heading: slot.heading };
  }

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

    const spawn = spawnPoint(track);
    if (vehicle) vehicle.reset(spawn);
    else vehicle = new Vehicle(physics, spawn);

    input.clear();
    debug.setTrack(index, TRACKS.length, track.def.name);
  }

  loadTrack(0);

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    if (track) fitCamera(camera, track.path, track.nrm, innerWidth / innerHeight);
  });

  addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && track && vehicle) {
      vehicle.reset(spawnPoint(track));
      obstacles?.reset();
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
      // порядок важен: силы колёс -> шаг мира -> снять трансформ
      vehicle!.update(input.read(), dt);
      physics.step();
      vehicle!.sync();
      obstacles?.sync();
    },
    render: (alpha) => {
      const v = vehicle!;
      v.interpolate(alpha, framePos, frameRot);
      car.group.position.copy(framePos);
      car.group.quaternion.copy(frameRot);

      WHEELS.forEach((spec, i) => {
        const pivot = car.wheels[i]!;
        pivot.position.y = SUSPENSION_ANCHOR_Y - v.suspensionLength(i);
        pivot.rotation.y = spec.front ? v.steering : 0;
        pivot.rotation.x = v.wheelRotation(i);
      });

      obstacles?.interpolate(alpha);
      debug.setDrive(v.speed, v.revsNorm, v.slipAngle);
      physicsDebug?.update();
      renderer.render(scene, camera);
    },
  });

  if (import.meta.env.DEV) {
    Object.assign(globalThis, {
      __racer: { scene, camera, renderer, physics, loop, getTrack: () => track, getVehicle: () => vehicle },
    });
  }

  renderer.setAnimationLoop((now: number) => {
    loop.tick(now);
    debug.setFps(loop.fps, now);
  });
}

main().catch(showFatal);
