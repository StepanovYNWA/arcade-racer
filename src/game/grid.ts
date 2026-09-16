import { Vector3 } from "three/webgpu";

import { N } from "../constants";
import type { Track } from "../track/buildTrack";

export interface GridSlot {
  position: Vector3;
  /** курс в тех же единицах, что и mesh.rotation.y: atan2(tan.x, tan.z) */
  heading: number;
}

/**
 * Место на стартовой сетке. Порт placeGrid из прототипа:
 * сетка отступает от линии старта назад, машины стоят в шахматном порядке
 * через 3.4 по ширине и через 6 по длине.
 */
export function gridSlot(track: Track, position: number): GridSlot {
  const s = N - 6;
  const base = track.path[s]!;
  const nn = track.nrm[s]!;
  const t = track.tan[s]!;

  const lane = ((position % 2) * 2 - 1) * 3.4;
  const back = 6 + position * 6;

  return {
    position: new Vector3(base.x + nn.x * lane - t.x * back, 0, base.z + nn.z * lane - t.z * back),
    heading: Math.atan2(t.x, t.z),
  };
}
