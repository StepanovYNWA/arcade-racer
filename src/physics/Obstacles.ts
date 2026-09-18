import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3, type Mesh, type Scene } from "three/webgpu";

import {
  CONE_CHAIN_AT,
  CONE_CHAIN_COUNT,
  CONE_CHAIN_LATERAL,
  CONE_CHAIN_STEP,
  CONE_HEIGHT,
  CONE_MASS,
  CONE_RADIUS,
  N,
  OBS_ANGULAR_DAMPING,
  OBS_FRIC,
  TIRE_MASS,
  TIRE_RADIUS,
  TIRE_STACK_AT,
  TIRE_STACK_HEIGHT,
  TIRE_STACK_OFFSET,
  TIRE_THICKNESS,
} from "../constants";
import { makeRng } from "../core/rng";
import { createConeMesh, createTireMesh } from "../render/obstacleMeshes";
import type { Track } from "../track/buildTrack";

import type { PhysicsWorld } from "./World";

/** зазор между покрышками в стопке, чтобы солвер не расталкивал их на старте */
const STACK_GAP = 0.02;
/** разброс стопки, как в прототипе */
const STACK_JITTER = 0.3;

interface Obstacle {
  readonly body: RAPIER.RigidBody;
  readonly mesh: Mesh;
  /** исходное положение — куда препятствие возвращается при рестарте */
  readonly home: Vector3;
  readonly prevPos: Vector3;
  readonly currPos: Vector3;
  readonly prevRot: Quaternion;
  readonly currRot: Quaternion;
}

/**
 * Конусы и покрышки как настоящие тела.
 *
 * В прототипе они разлетались по рукописной модели: скорость, затухание, ручные
 * отскоки. Здесь это обычные динамические тела Rapier, поэтому удар толкает их
 * с честной массой и вращением, стопка покрышек рассыпается сама, а сбитая покрышка
 * может попасть под колесо — лучи подвески видят её наравне с землёй.
 *
 * Раскладка взята из прототипа: доли вдоль круга и смещения те же.
 */
export class Obstacles {
  private readonly world: RAPIER.World;
  private readonly scene: Scene;
  private readonly items: Obstacle[] = [];

  constructor(physics: PhysicsWorld, track: Track, scene: Scene, seed: number) {
    this.world = physics.world;
    this.scene = scene;
    const rnd = makeRng(seed);

    // стопки покрышек на обочине
    for (const fraction of TIRE_STACK_AT) {
      const i = Math.floor(fraction * N);
      const p = track.path[i]!;
      const n = track.nrm[i]!;
      const bx = p.x + n.x * TIRE_STACK_OFFSET;
      const bz = p.z + n.z * TIRE_STACK_OFFSET;

      for (let s = 0; s < TIRE_STACK_HEIGHT; s++) {
        const jx = bx + (rnd() - 0.5) * STACK_JITTER;
        const jz = bz + (rnd() - 0.5) * STACK_JITTER;
        const y = TIRE_THICKNESS / 2 + s * (TIRE_THICKNESS + STACK_GAP);
        this.add(
          createTireMesh(),
          new Vector3(jx, y, jz),
          RAPIER.ColliderDesc.cylinder(TIRE_THICKNESS / 2, TIRE_RADIUS)
            .setMass(TIRE_MASS)
            .setFriction(0.8)
            .setRestitution(0.25),
        );
      }
    }

    // цепочка конусов поперёк полотна
    const start = Math.floor(CONE_CHAIN_AT * N);
    for (let c = 0; c < CONE_CHAIN_COUNT; c++) {
      const j = (start + c * CONE_CHAIN_STEP) % N;
      const p = track.path[j]!;
      const n = track.nrm[j]!;
      const off = (c % 2 ? 1 : -1) * CONE_CHAIN_LATERAL;
      this.add(
        createConeMesh(),
        new Vector3(p.x + n.x * off, CONE_HEIGHT / 2, p.z + n.z * off),
        RAPIER.ColliderDesc.cone(CONE_HEIGHT / 2, CONE_RADIUS)
          .setMass(CONE_MASS)
          .setFriction(0.5)
          .setRestitution(0.1),
      );
    }
  }

  private add(mesh: Mesh, at: Vector3, collider: RAPIER.ColliderDesc): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(at.x, at.y, at.z)
        .setLinearDamping(OBS_FRIC)
        .setAngularDamping(OBS_ANGULAR_DAMPING)
        // машина проходит до 0.77 м за тик — без CCD она прошивала бы препятствие
        .setCcdEnabled(true),
    );
    this.world.createCollider(collider, body);

    mesh.position.copy(at);
    this.scene.add(mesh);

    this.items.push({
      body,
      mesh,
      home: at.clone(),
      prevPos: at.clone(),
      currPos: at.clone(),
      prevRot: new Quaternion(),
      currRot: new Quaternion(),
    });
  }

  /** Снять трансформы после world.step(). */
  sync(): void {
    for (const o of this.items) {
      o.prevPos.copy(o.currPos);
      o.prevRot.copy(o.currRot);
      const t = o.body.translation();
      const r = o.body.rotation();
      o.currPos.set(t.x, t.y, t.z);
      o.currRot.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Разложить трансформы по мешам для кадра между тиками. */
  interpolate(alpha: number): void {
    for (const o of this.items) {
      // спящие тела не двигаются — интерполировать нечего
      if (o.body.isSleeping()) continue;
      o.mesh.position.lerpVectors(o.prevPos, o.currPos, alpha);
      o.mesh.quaternion.copy(o.prevRot).slerp(o.currRot, alpha);
    }
  }

  /** Вернуть всё на исходные места — при рестарте заезда. */
  reset(): void {
    for (const o of this.items) {
      o.body.setTranslation({ x: o.home.x, y: o.home.y, z: o.home.z }, true);
      o.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      o.currPos.copy(o.home);
      o.prevPos.copy(o.home);
      o.currRot.set(0, 0, 0, 1);
      o.prevRot.set(0, 0, 0, 1);
      o.mesh.position.copy(o.home);
      o.mesh.quaternion.set(0, 0, 0, 1);
    }
  }

  dispose(): void {
    for (const o of this.items) {
      this.world.removeRigidBody(o.body);
      this.scene.remove(o.mesh);
    }
    this.items.length = 0;
  }
}
