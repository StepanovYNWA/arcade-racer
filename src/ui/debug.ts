/** Отладочная панель каркаса: какая трасса, какой бэкенд, какой fps. */
export class DebugPanel {
  private readonly trackEl = document.getElementById("dbgTrack")!;
  private readonly backendEl = document.getElementById("dbgBackend")!;
  private readonly fpsEl = document.getElementById("dbgFps")!;
  private fpsNextUpdate = 0;

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
