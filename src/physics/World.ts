import RAPIER from "@dimforge/rapier3d-compat";

import { GRAVITY, PHYSICS_HZ } from "../constants";

/**
 * Физический мир Rapier.
 *
 * Шаг всегда фиксированный (PHYSICS_HZ) — на переменном шаге Rapier ведёт себя
 * недетерминированно, и одна и та же гонка на 60 и 144 Гц разошлась бы. Шагает
 * его Loop.fixedUpdate, здесь только мир и статичная земля.
 */
export class PhysicsWorld {
  readonly rapier = RAPIER;
  readonly world: RAPIER.World;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = 1 / PHYSICS_HZ;

    // земля: один большой короб, верхняя грань ровно на y = 0
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(800, 1, 800).setTranslation(0, -1, 0).setFriction(1.0),
      groundBody,
    );
  }

  /** WASM грузится асинхронно — это первый await в bootstrap. */
  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  step(): void {
    this.world.step();
  }
}
