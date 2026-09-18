import { N } from "../constants";
import type { Track } from "../track/buildTrack";

/** Всё, что здесь нужно от точки — плоские координаты. */
interface Point {
  readonly x: number;
  readonly z: number;
}

/**
 * Где машина находится на круге.
 *
 * Трасса замкнута и известна как N точек осевой линии, поэтому «место в круге» — это
 * номер ближайшей точки. Отсюда растёт и цель для ИИ (точка с упреждением), и порядок
 * участников, и счёт кругов в M6.
 */

/**
 * Ближайшая точка осевой линии — порт nearestSeg из прототипа.
 *
 * Поиск не по всем N точкам, а в окне вокруг прошлого положения, и окно намеренно
 * несимметричное (-4..+14): машина едет вперёд, назад она может только отыграть чуть-чуть.
 * Полный поиск здесь был бы не только дороже — он ломался бы на трассах, которые
 * подходят близко сами к себе: на «Серпантине» соседнее полотно ближе, чем своё
 * собственное через сто точек, и машину телепортировало бы на другой виток.
 */
export function nearestSeg(path: readonly Point[], pos: Point, prev: number): number {
  let best = prev;
  let bd = Infinity;
  for (let k = -4; k <= 14; k++) {
    const i = (((prev + k) % N) + N) % N;
    const p = path[i]!;
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Полный поиск ближайшей точки — только для постановки на сетку.
 *
 * Окно из nearestSeg здесь не годится: задний ряд сетки отстоит от линии старта
 * на два десятка метров, это за его пределами, и машина получила бы номер точки
 * с другого конца круга. По ходу гонки полный поиск, наоборот, опасен — трасса
 * может подойти близко сама к себе, — но на старте машина стоит на осевой линии,
 * и ближе своей точки ничего быть не может: соседнее полотно дальше ширины дороги.
 */
function fullNearest(path: readonly Point[], pos: Point): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Положение участника на круге: номер точки, счётчик кругов и сквозной прогресс.
 *
 * Пересечение линии старт/финиш ловится по скачку номера точки через ноль — так же,
 * как в прототипе. Ехать назад через линию тоже считается, иначе круг можно было бы
 * накрутить, качаясь вперёд-назад по стартовой прямой.
 */
export class Progress {
  /** номер ближайшей точки осевой линии */
  seg = 0;
  /** пройденных пересечений линии старта; на сетке машина стоит ДО неё */
  lap = 0;
  /** сквозная координата lap * N + seg — по ней сравниваются участники */
  progress = 0;
  /** пересекала ли машина линию старта хоть раз: до этого круг не засчитывается */
  started = false;

  private prevSeg = 0;

  constructor(track: Track, pos: Point) {
    this.seg = fullNearest(track.path, pos);
    this.prevSeg = this.seg;
    this.progress = this.seg;
  }

  /** Обновить по текущему положению. Вызывается в физическом тике. */
  update(track: Track, pos: Point): void {
    this.seg = nearestSeg(track.path, pos, this.prevSeg);

    if (this.prevSeg > N * 0.75 && this.seg < N * 0.25) {
      this.lap++;
      this.started = true;
    } else if (this.prevSeg < N * 0.25 && this.seg > N * 0.75) {
      this.lap--;
    }

    this.prevSeg = this.seg;
    this.progress = this.lap * N + this.seg;
  }

  reset(track: Track, pos: Point): void {
    this.seg = fullNearest(track.path, pos);
    this.prevSeg = this.seg;
    this.lap = 0;
    this.progress = this.seg;
    this.started = false;
  }
}
