import { MAXSPEED, N, REV_MAX, REV_PEAK } from "../constants";
import type { Racer } from "../game/Racer";

/** насколько близко к пику момента обороты считаются «в такт» */
const PEAK_WINDOW = 0.15;
/** с какого угла занос считается заносом и подсвечивается */
const DRIFT_VISIBLE_DEG = 8;

/**
 * Панель каркаса: трасса, бэкенд, fps — и спидометр со шкалой оборотов.
 *
 * Спидометр здесь временно: без него нечем оценить, как машина едет. Полноценный
 * HUD с плашками участников и фазой приезжает в M6, в ui/Hud.ts.
 */
export class DebugPanel {
  private readonly trackEl = document.getElementById("dbgTrack")!;
  private readonly backendEl = document.getElementById("dbgBackend")!;
  private readonly fpsEl = document.getElementById("dbgFps")!;
  private readonly spdEl = document.getElementById("spd")!;
  private readonly spdFill = document.getElementById("spdfill")! as HTMLElement;
  private readonly powFill = document.getElementById("powfill")! as HTMLElement;
  private readonly slipEl = document.getElementById("slip")! as HTMLElement;
  private readonly orderEl = document.getElementById("dbgOrder")!;
  private fpsNextUpdate = 0;
  /** прошлая разметка порядка: трогать DOM каждый кадр незачем */
  private orderHtml = "";

  /**
   * speed — м/с, revsNorm — обороты в долях пика момента (1.0 = идеальный ритм),
   * slipRad — угол заноса
   */
  setDrive(speed: number, revsNorm: number, slipRad: number): void {
    const slipDeg = Math.round(Math.abs((slipRad * 180) / Math.PI));
    this.slipEl.textContent = `${slipDeg}°`;
    this.slipEl.classList.toggle("on", slipDeg >= DRIFT_VISIBLE_DEG);

    this.spdEl.textContent = String(Math.max(0, Math.round(Math.abs(speed) * 3.6)));
    this.spdFill.style.width = `${Math.min(Math.abs(speed) / MAXSPEED, 1) * 100}%`;

    const revs = revsNorm * REV_PEAK;
    this.powFill.style.width = `${Math.min(revs / REV_MAX, 1) * 100}%`;
    this.powFill.classList.toggle("peak", Math.abs(revsNorm - 1) < PEAK_WINDOW);
  }

  /**
   * Порядок участников по сквозному прогрессу — временный заменитель плашек M6.
   * Без него работу ИИ видно только глазами по экрану, а этого мало.
   *
   * Отставание считается в точках осевой линии и переводится в метры по её шагу:
   * настоящий разрыв по времени появится вместе с правилами.
   */
  setOrder(racers: readonly Racer[], lapLength: number): void {
    if (racers.length === 0) return;
    const sorted = [...racers].sort((a, b) => b.progress.progress - a.progress.progress);
    const lead = sorted[0]!.progress.progress;
    const step = lapLength / N;

    const rows = sorted.map((r, i) => {
      const behind = (lead - r.progress.progress) * step;
      const gap = i === 0 ? "лидер" : `−${behind.toFixed(0)} м`;
      const color = `#${r.color.toString(16).padStart(6, "0")}`;
      return (
        `<div class="row"><span class="dot" style="background:${color}"></span>` +
        `<span class="who">${r.name}</span><span class="gap">${gap}</span></div>`
      );
    });

    const html = rows.join("");
    if (html !== this.orderHtml) {
      this.orderHtml = html;
      this.orderEl.innerHTML = html;
    }
  }

  setBackend(name: string): void {
    this.backendEl.textContent = name;
  }

  setTrack(index: number, total: number, name: string): void {
    this.trackEl.textContent = `Трасса ${index + 1}/${total} · ${name}`;
  }

  /** fps перерисовываем раз в ~0.25 с, иначе цифра дёргается и зря трогает DOM */
  setFps(fps: number, nowMs: number): void {
    if (nowMs < this.fpsNextUpdate) return;
    this.fpsNextUpdate = nowMs + 250;
    this.fpsEl.textContent = String(Math.round(fps));
  }
}

export function showFatal(err: unknown): void {
  const box = document.getElementById("fatal");
  const msg = document.getElementById("fatalMsg");
  if (!box || !msg) return;
  msg.textContent = `Не удалось запустить рендер: ${err instanceof Error ? err.message : String(err)}`;
  box.classList.add("on");
  console.error(err);
}
