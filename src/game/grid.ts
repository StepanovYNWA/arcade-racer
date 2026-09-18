import { Vector3 } from "three/webgpu";

import { GRID_LANE, GRID_ROW_GAP, GRID_START_GAP, N } from "../constants";
import type { Track } from "../track/buildTrack";

export interface GridSlot {
  position: Vector3;
  /** курс в тех же единицах, что и mesh.rotation.y: atan2(tan.x, tan.z) */
  heading: number;
}

/**
 * Место на стартовой сетке. Порт placeGrid из прототипа: сетка отступает от линии
 * старта назад, машины стоят в шахматном порядке через GRID_LANE по ширине
 * и через GRID_ROW_GAP по длине.
 *
 * Отличие от прототипа одно, и оно обязательное: назад отступаем ПО ОСЕВОЙ ЛИНИИ,
 * а не по прямой вдоль касательной. В прототипе прямой отступ сходил с рук, потому
 * что стен не существовало и неудачно поставленная машина просто выезжала на полотно.
 * Здесь барьеры настоящие: на «Серпантине» трасса успевает завернуть на тех самых
 * двух десятках метров, и машина из второго ряда оказывалась замурованной ЗА барьером,
 * где и стояла неподвижно всю гонку.
 */
export function gridSlot(track: Track, position: number): GridSlot {
  let i = N - GRID_START_GAP;
  let back = GRID_ROW_GAP + position * GRID_ROW_GAP;
  while (back > 0) {
    const prev = (i - 1 + N) % N;
    back -= track.path[i]!.distanceTo(track.path[prev]!);
    i = prev;
  }

  const base = track.path[i]!;
  const nn = track.nrm[i]!;
  const t = track.tan[i]!;
  const lane = ((position % 2) * 2 - 1) * GRID_LANE;

  return {
    position: new Vector3(base.x + nn.x * lane, 0, base.z + nn.z * lane),
    heading: Math.atan2(t.x, t.z),
  };
}
