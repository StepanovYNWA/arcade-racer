import { PHYSICS_HZ } from "../constants";

export interface LoopOptions {
  /** шаг симуляции; вызывается ровно с фиксированным dt */
  fixedUpdate(dt: number): void;
  /** отрисовка; alpha ∈ [0,1) — доля пути от прошлого тика к текущему */
  render(alpha: number): void;
  /** частота тика, Гц */
  hz?: number;
}

/**
 * Классический accumulator loop: физика фиксированным шагом, рендер — с интерполяцией.
 *
 * Прототип считал и физику, и фазовые часы прямо в кадре с переменным dt. Rapier так
 * использовать нельзя — поведение поплывёт между 60 и 144 Гц, поэтому вся геймлогика
 * (включая phaseClock) должна жить в fixedUpdate, а не в render.
 */
export class Loop {
  private readonly step: number;
  private readonly fixedUpdate: (dt: number) => void;
  private readonly renderFrame: (alpha: number) => void;

  private accumulator = 0;
  private lastMs: number | null = null;
  private alpha = 0;

  /** сколько тиков прошло с запуска — пригодится для детерминированных проверок */
  ticks = 0;
  /** сглаженный fps для отладочной панели */
  fps = 0;

  /** предел «догона» за кадр: после фриза/вкладки в фоне лишнее время выбрасываем */
  private static readonly MAX_FRAME = 0.25;

  constructor(opts: LoopOptions) {
    this.step = 1 / (opts.hz ?? PHYSICS_HZ);
    this.fixedUpdate = opts.fixedUpdate;
    this.renderFrame = opts.render;
  }

  /** подставляется в renderer.setAnimationLoop */
  readonly tick = (nowMs: number): void => {
    if (this.lastMs === null) this.lastMs = nowMs;
    let frame = (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;

    if (frame > 0) this.fps += (1 / frame - this.fps) * 0.1;
    if (frame > Loop.MAX_FRAME) frame = Loop.MAX_FRAME;

    this.accumulator += frame;
    while (this.accumulator >= this.step) {
      this.fixedUpdate(this.step);
      this.accumulator -= this.step;
      this.ticks++;
    }

    this.alpha = this.accumulator / this.step;
    this.renderFrame(this.alpha);
  };

  /** сбросить накопитель — после долгой паузы или смены трассы */
  reset(): void {
    this.accumulator = 0;
    this.lastMs = null;
    this.alpha = 0;
  }
}
