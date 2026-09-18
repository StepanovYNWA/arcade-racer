import type { Group, Quaternion, Vector3 } from "three/webgpu";

import {
  AI_MAXBASE,
  AI_RHYTHM_STEP,
  AI_SKILL_BASE,
  AI_SKILL_STEP,
  COLORS,
  MAXSPEED,
  NAMES,
  SUSPENSION_ANCHOR_Y,
  WHEELS,
} from "../constants";
import type { PlayerInput } from "../core/Input";
import { Vehicle } from "../physics/Vehicle";
import type { PhysicsWorld } from "../physics/World";
import { createCar, type Car } from "../render/Car";
import type { Track } from "../track/buildTrack";

import { AiDriver } from "./AiDriver";
import { gridSlot } from "./grid";
import { Progress } from "./progress";

/**
 * Участник гонки: физика, визуальная машинка, место в круге и тот, кто ей правит.
 *
 * Игрок и соперник отличаются ровно одним полем — есть ли `ai`. Всё остальное
 * общее, включая машину: соперник не «догоняет по скрипту», он едет по той же
 * физике и на тех же правилах, просто медленнее нажимает и ниже держит потолок.
 */
export class Racer {
  readonly vehicle: Vehicle;
  readonly car: Car;
  readonly progress: Progress;

  constructor(
    physics: PhysicsWorld,
    track: Track,
    /** место на стартовой сетке, 0 — поул */
    readonly position: number,
    readonly name: string,
    readonly color: number,
    /** null для игрока */
    readonly ai: AiDriver | null,
    topSpeed: number,
  ) {
    const slot = gridSlot(track, position);
    slot.position.y = SPAWN_LIFT;

    this.vehicle = new Vehicle(physics, slot, topSpeed);
    this.car = createCar(color);
    this.progress = new Progress(track, slot.position);
  }

  get group(): Group {
    return this.car.group;
  }

  /** Усилия на этот тик: у соперника их считает ИИ, у игрока приходят с клавиатуры. */
  think(track: Track, dt: number, human: PlayerInput): PlayerInput {
    return this.ai ? this.ai.update(track, this.vehicle, this.progress, dt) : human;
  }

  /** После шага мира: снять трансформ и обновить место в круге. */
  sync(track: Track): void {
    this.vehicle.sync();
    this.progress.update(track, this.vehicle.position);
  }

  /** Кадр между тиками: положение машинки, ход подвески, руль и качение колёс. */
  interpolate(alpha: number, pos: Vector3, rot: Quaternion): void {
    const v = this.vehicle;
    v.interpolate(alpha, pos, rot);
    this.car.group.position.copy(pos);
    this.car.group.quaternion.copy(rot);

    WHEELS.forEach((spec, i) => {
      const pivot = this.car.wheels[i]!;
      pivot.position.y = SUSPENSION_ANCHOR_Y - v.suspensionLength(i);
      pivot.rotation.y = spec.front ? v.steering : 0;
      pivot.rotation.x = v.wheelRotation(i);
    });
  }

  reset(track: Track): void {
    const slot = gridSlot(track, this.position);
    slot.position.y = SPAWN_LIFT;
    this.vehicle.reset(slot);
    this.progress.reset(track, slot.position);
    this.ai?.reset();
  }
}

/** чуть выше земли, чтобы на старте колёса не оказались в полу */
const SPAWN_LIFT = 0.1;

/**
 * Стартовое поле: игрок на поуле, остальные — соперники.
 *
 * Сила соперников разведена ровно как в прототипе (потолок скорости), плюс своя
 * доля ритма нажатий: в этой игре разгон живёт не в педали, а в такте, поэтому
 * разводить соперников только потолком было бы полдела.
 */
export function createField(physics: PhysicsWorld, track: Track, count: number): Racer[] {
  const out: Racer[] = [];
  for (let i = 0; i < count; i++) {
    const human = i === 0;
    const lane = (i - (count - 1) / 2) * 3.4;
    const top = human ? MAXSPEED : AI_MAXBASE * (AI_SKILL_BASE + i * AI_SKILL_STEP);
    const ai = human ? null : new AiDriver(lane, top, 1 - i * AI_RHYTHM_STEP);
    out.push(new Racer(physics, track, i, NAMES[i] ?? `ИИ ${i}`, COLORS[i] ?? 0xffffff, ai, top));
  }
  return out;
}
