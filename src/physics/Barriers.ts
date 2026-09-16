import RAPIER from "@dimforge/rapier3d-compat";

import { BARRIER_HEIGHT, BARRIER_THICKNESS, N, ROAD_HW } from "../constants";
import type { Track } from "../track/buildTrack";

import type { PhysicsWorld } from "./World";

/**
 * Стены по кромкам дороги.
 *
 * В прототипе машину держал мягкий зажим к полотну — координата просто пересчитывалась
 * на кромку. Здесь кромки становятся настоящими коллайдерами: вылет наружу — это
 * реальный удар о стену с потерей скорости, а не телепорт. Ровно это и придаёт смысл
 * рублёным поворотам, ради которых трассы такой формы.
 *
 * Стены строятся из тех же нормалей `nrm`, что рисуют белую разметку, поэтому
 * физическая кромка совпадает с видимой пиксель в пиксель.
 */
export class Barriers {
  private readonly body: RAPIER.RigidBody;
  private readonly world: RAPIER.World;

  constructor(physics: PhysicsWorld, track: Track) {
    this.world = physics.world;
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    // внутренняя грань стены встаёт ровно на кромку полотна
    const offset = ROAD_HW + BARRIER_THICKNESS / 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const p = track.path[i]!;
        const q = track.path[j]!;
        const np = track.nrm[i]!;
        const nq = track.nrm[j]!;

        const ax = p.x + np.x * offset * side;
        const az = p.z + np.z * offset * side;
        const bx = q.x + nq.x * offset * side;
        const bz = q.z + nq.z * offset * side;

        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-4) continue;

        // сегменты перекрываются: на внутренней стороне поворота соседние точки
        // кромки сходятся, и стык встык оставил бы щели
        const half = (len / 2) * 1.2;
        const yaw = Math.atan2(dx, dz);

        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(BARRIER_THICKNESS / 2, BARRIER_HEIGHT / 2, half)
            .setTranslation((ax + bx) / 2, BARRIER_HEIGHT / 2, (az + bz) / 2)
            .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
            .setFriction(0.2)
            .setRestitution(0.1),
          this.body,
        );
      }
    }
  }

  /** Снести стены вместе с их телом — коллайдеры уходят следом. */
  dispose(): void {
    this.world.removeRigidBody(this.body);
  }
}
