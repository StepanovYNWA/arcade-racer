import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
} from "three/webgpu";

import { N, ROAD_HW } from "../constants";
import { makeRng, type Rng } from "../core/rng";
import { PALETTE, flatMaterial, markingMaterial } from "../render/materials";

import { buildCenterline, computeCurveSpeed, computeFrames } from "./path";
import type { TrackDef } from "./tracks";

/**
 * Геометрия трассы: полотно, кромки, стартовые шашечки, деревья.
 * Порт buildTrack из прототипа; расстановка декора теперь идёт от сида,
 * поэтому одна и та же трасса выглядит одинаково от запуска к запуску.
 */
export interface Track {
  readonly def: TrackDef;
  readonly group: Group;
  /** осевая линия, N точек, старт в path[0], курс на старте — в +x */
  readonly path: Vector3[];
  readonly tan: Vector3[];
  /** левая нормаль; по ней же с M2 встанут коллайдеры-барьеры на кромках */
  readonly nrm: Vector3[];
  /** целевая скорость ИИ по кривизне (M5) */
  readonly curveSpeed: number[];
}

/**
 * Полоса между двумя смещениями по нормали — этим строится и полотно, и белые кромки.
 * `hi`/`ho` — внутреннее и внешнее смещение, `y` — высота над землёй (борьба с z-fighting).
 */
function ribbon(
  path: readonly Vector3[],
  nrm: readonly Vector3[],
  hi: number,
  ho: number,
  y: number,
  color: number,
): Mesh {
  const verts: number[] = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const pi = path[i]!;
    const pj = path[j]!;
    const ni = nrm[i]!;
    const nj = nrm[j]!;

    const iL = [pi.x + ni.x * ho, y, pi.z + ni.z * ho];
    const iR = [pi.x + ni.x * hi, y, pi.z + ni.z * hi];
    const jL = [pj.x + nj.x * ho, y, pj.z + nj.z * ho];
    const jR = [pj.x + nj.x * hi, y, pj.z + nj.z * hi];

    verts.push(...iL, ...jL, ...iR, ...iR, ...jL, ...jR);
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();

  const mesh = new Mesh(g, flatMaterial(color));
  mesh.receiveShadow = true;
  return mesh;
}

function tree(x: number, z: number): Group {
  const g = new Group();

  const trunk = new Mesh(new CylinderGeometry(0.4, 0.5, 2.2, 6), flatMaterial(PALETTE.trunk));
  trunk.position.y = 1.1;
  trunk.castShadow = true;

  const leaf = new Mesh(new ConeGeometry(2.0, 4.2, 7), flatMaterial(PALETTE.leaf));
  leaf.position.y = 4.2;
  leaf.castShadow = true;

  g.add(trunk, leaf);
  g.position.set(x, 0, z);
  return g;
}

/** Шашечки старт/финиш поперёк полотна в path[0]. */
function startLine(path: readonly Vector3[], tan: readonly Vector3[], nrm: readonly Vector3[]): Group {
  const g = new Group();
  const p0 = path[0]!;
  const n0 = nrm[0]!;
  const t0 = tan[0]!;
  const cols = 12;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) {
      const color = (c + r) % 2 ? PALETTE.checkerDark : PALETTE.checkerLight;
      const sq = new Mesh(new PlaneGeometry((ROAD_HW * 2) / cols, 2), markingMaterial(color));
      sq.rotation.x = -Math.PI / 2;
      const off = (c / (cols - 1) - 0.5) * ROAD_HW * 2 * 0.95;
      const back = (r - 0.5) * 2;
      sq.position.set(p0.x + n0.x * off - t0.x * back, 0.09, p0.z + n0.z * off - t0.z * back);
      g.add(sq);
    }
  }
  return g;
}

/** Деревья по обочинам: сторона чередуется каждые 8 точек, отступ и пропуски — от сида. */
function scenery(path: readonly Vector3[], nrm: readonly Vector3[], rnd: Rng): Group {
  const g = new Group();
  for (let i = 0; i < N; i += 8) {
    const side = i % 16 < 8 ? 1 : -1;
    const dist = ROAD_HW + 5 + rnd() * 8;
    const p = path[i]!;
    const nn = nrm[i]!;
    if (rnd() < 0.55) g.add(tree(p.x + nn.x * dist * side, p.z + nn.z * dist * side));
  }
  return g;
}

export function buildTrack(def: TrackDef, seed: number): Track {
  const path = buildCenterline(def.V, def.fillet);
  const { tan, nrm } = computeFrames(path);
  const curveSpeed = computeCurveSpeed(tan);

  const group = new Group();
  group.name = `track:${def.name}`;

  // полотно и две белые кромки чуть выше него
  group.add(ribbon(path, nrm, -ROAD_HW, ROAD_HW, 0.05, PALETTE.asphalt));
  group.add(ribbon(path, nrm, ROAD_HW - 0.5, ROAD_HW, 0.07, PALETTE.kerb));
  group.add(ribbon(path, nrm, -ROAD_HW, -ROAD_HW + 0.5, 0.07, PALETTE.kerb));
  group.add(startLine(path, tan, nrm));
  group.add(scenery(path, nrm, makeRng(seed)));

  return { def, group, path, tan, nrm, curveSpeed };
}

/** Освободить геометрию трассы. Материалы общие и кэшированные — их не трогаем. */
export function disposeTrack(track: Track): void {
  track.group.traverse((obj) => {
    if (obj instanceof Mesh) obj.geometry.dispose();
  });
}
