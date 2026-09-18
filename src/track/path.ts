// Всё из "three/webgpu": этот бандл содержит и ядро, и node-материалы.
// Смешивать импорты из "three" и "three/webgpu" нельзя — Vite соберёт две копии
// библиотеки, и instanceof/классы перестанут совпадать.
import { MathUtils, Vector3 } from "three/webgpu";

import { AI_MAXBASE, CURVE_SPEED_MIN, N } from "../constants";

/**
 * Геометрия осевой линии трассы. Прямой порт roundedPath/resampleClosed из прототипа:
 * ломаная из вершин со срезанными углами даёт «рублёные» повороты между длинными прямыми.
 */

/**
 * Скругляет углы замкнутой ломаной дугами радиуса ~R.
 * Радиус зажимается длиной соседних сегментов (0.49 каждой стороны),
 * поэтому на коротких участках угол просто срезается слабее.
 */
export function roundedPath(verts: readonly Vector3[], R: number): Vector3[] {
  const n = verts.length;
  const out: Vector3[] = [];

  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]!;
    const cur = verts[i]!;
    const next = verts[(i + 1) % n]!;

    const d1 = cur.clone().sub(prev);
    const l1 = d1.length();
    d1.normalize();
    const d2 = next.clone().sub(cur);
    const l2 = d2.length();
    d2.normalize();

    const a = d1.clone().negate();
    const b = d2.clone();
    let ang = Math.acos(MathUtils.clamp(a.dot(b), -1, 1));
    if (ang < 1e-3) ang = 1e-3;

    const t = Math.min(R / Math.tan(ang / 2), l1 * 0.49, l2 * 0.49);
    const rEff = t * Math.tan(ang / 2);

    const tp1 = cur.clone().addScaledVector(d1, -t);
    const tp2 = cur.clone().addScaledVector(d2, t);
    const bis = a.clone().add(b).normalize();
    const center = cur.clone().addScaledVector(bis, rEff / Math.sin(ang / 2));

    const a1 = Math.atan2(tp1.z - center.z, tp1.x - center.x);
    const a2 = Math.atan2(tp2.z - center.z, tp2.x - center.x);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;

    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 14)));
    out.push(tp1.clone());
    for (let s = 1; s < steps; s++) {
      const ta = a1 + (da * s) / steps;
      out.push(new Vector3(center.x + rEff * Math.cos(ta), 0, center.z + rEff * Math.sin(ta)));
    }
    out.push(tp2.clone());
  }

  // выкинуть дубликаты подряд и замыкающую точку
  const cleaned: Vector3[] = [];
  for (const p of out) {
    const last = cleaned[cleaned.length - 1];
    if (!last || p.distanceTo(last) > 1e-3) cleaned.push(p);
  }
  if (cleaned.length > 1 && cleaned[0]!.distanceTo(cleaned[cleaned.length - 1]!) < 1e-3) cleaned.pop();
  return cleaned;
}

/** Равномерно по длине пересемплирует замкнутую ломаную в ровно `count` точек. */
export function resampleClosed(pts: readonly Vector3[], count: number): Vector3[] {
  const m = pts.length;
  const seg = new Array<number>(m);
  let total = 0;
  for (let i = 0; i < m; i++) {
    seg[i] = pts[i]!.distanceTo(pts[(i + 1) % m]!);
    total += seg[i]!;
  }

  const res: Vector3[] = [];
  const step = total / count;
  let i = 0;
  let acc = 0;
  for (let k = 0; k < count; k++) {
    const dist = k * step;
    while (i < m - 1 && acc + seg[i]! < dist) {
      acc += seg[i]!;
      i++;
    }
    const a = pts[i]!;
    const b = pts[(i + 1) % m]!;
    const f = seg[i]! > 1e-6 ? (dist - acc) / seg[i]! : 0;
    res.push(new Vector3(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f));
  }
  return res;
}

/**
 * Осевая линия с нормализованным стартом.
 *
 * Старт ставится в нижнюю точку трассы (минимальный z, при равенстве — ближе к x=0),
 * а направление круга разворачивается так, чтобы на старте курс шёл в +x.
 * Без этого форма трасс сохранилась бы, но сетка и шашечки уезжали бы куда попало.
 */
export function buildCenterline(verts: readonly (readonly [number, number])[], fillet: number): Vector3[] {
  const V = verts.map(([x, z]) => new Vector3(x, 0, z));
  let path = resampleClosed(roundedPath(V, fillet), N);

  const lowest = (pts: readonly Vector3[]): number => {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const score = pts[i]!.z + Math.abs(pts[i]!.x) * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  let bc = lowest(path);
  if (path[(bc + 1) % N]!.x - path[(bc - 1 + N) % N]!.x < 0) path.reverse();
  bc = lowest(path);
  path = path.slice(bc).concat(path.slice(0, bc));
  return path;
}

export interface TrackFrames {
  /** касательная к осевой линии, единичная */
  tan: Vector3[];
  /** левая нормаль (-t.z, 0, t.x); по ней откладывается ширина дороги */
  nrm: Vector3[];
}

/** Касательные и нормали в каждой точке осевой линии (центральная разность). */
export function computeFrames(path: readonly Vector3[]): TrackFrames {
  const n = path.length;
  const tan: Vector3[] = [];
  const nrm: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[(i - 1 + n) % n]!;
    const b = path[(i + 1) % n]!;
    const t = new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    tan.push(t);
    nrm.push(new Vector3(-t.z, 0, t.x));
  }
  return { tan, nrm };
}

/**
 * Профиль «безопасной» скорости по кривизне — цель для ИИ (M5).
 * Кривизна берётся как угол между касательными через ±3 точки.
 */
export function computeCurveSpeed(tan: readonly Vector3[]): number[] {
  const n = tan.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = tan[(i - 3 + n) % n]!;
    const b = tan[(i + 3) % n]!;
    const turn = Math.acos(MathUtils.clamp(a.dot(b), -1, 1));
    out[i] = MathUtils.clamp(AI_MAXBASE - turn * 46, CURVE_SPEED_MIN, AI_MAXBASE);
  }
  return out;
}
