import { MAXSPEED, REV_MAX, REV_PEAK } from "../constants";

/** насколько близко к пику момента обороты считаются «в такт» */
const PEAK_WINDOW = 0.15;

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
  private fpsNextUpdate = 0;

  /** speed — м/с, revsNorm — обороты в долях пика момента (1.0 = идеальный ритм) */
  setDrive(speed: number, revsNorm: number): void {
    this.spdEl.textContent = String(Math.max(0, Math.round(Math.abs(speed) * 3.6)));
    this.spdFill.style.width = `${Math.min(Math.abs(speed) / MAXSPEED, 1) * 100}%`;

    const revs = revsNorm * REV_PEAK;
    this.powFill.style.width = `${Math.min(revs / REV_MAX, 1) * 100}%`;
    this.powFill.classList.toggle("peak", Math.abs(revsNorm - 1) < PEAK_WINDOW);
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
