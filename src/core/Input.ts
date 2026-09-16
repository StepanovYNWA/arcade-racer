/**
 * Ввод игрока в виде, одинаковом для человека и для ИИ.
 *
 * Общий интерфейс усилий (план, п. 6.3 и 7): драйвер выдаёт «сколько раз нажали,
 * куда руль, тормоз, ручник», а кто его наполнил — клавиатура, геймпад или
 * ИИ-водитель с M5 — машине безразлично.
 */
export interface PlayerInput {
  /** свежих нажатий газа с прошлого физического тика */
  tap: number;
  /** руль: +1 влево, -1 вправо (знак как в прототипе) */
  steer: number;
  /** тормоз/задний ход, 0..1 */
  brake: number;
  handbrake: boolean;
}

export function emptyInput(): PlayerInput {
  return { tap: 0, steer: 0, brake: 0, handbrake: false };
}

const TAP_KEYS = ["ArrowUp", "KeyW"];
const BRAKE_KEYS = ["ArrowDown", "KeyS"];
const LEFT_KEYS = ["ArrowLeft", "KeyA"];
const RIGHT_KEYS = ["ArrowRight", "KeyD"];
const HANDBRAKE_KEYS = ["Space"];
const HELD = [...BRAKE_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS, ...HANDBRAKE_KEYS, ...TAP_KEYS];

/**
 * Клавиатура для первого игрока.
 *
 * Газ считается по фронтам нажатия: автоповтор ОС отсекается и e.repeat,
 * и собственным набором зажатых клавиш. Удержание не разгоняет — это вся суть
 * механики, поэтому защита двойная.
 */
export class KeyboardInput {
  private readonly held = new Set<string>();
  private taps = 0;
  private readonly input = emptyInput();

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", this.onKeyDown as EventListener);
    target.addEventListener("keyup", this.onKeyUp as EventListener);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!e.repeat && !this.held.has(e.code) && TAP_KEYS.includes(e.code)) this.taps++;
    this.held.add(e.code);
    if (HELD.includes(e.code)) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private any(codes: readonly string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /** Снимает состояние на текущий тик и обнуляет накопленные нажатия. */
  read(): PlayerInput {
    this.input.tap = this.taps;
    this.taps = 0;
    this.input.steer = (this.any(LEFT_KEYS) ? 1 : 0) - (this.any(RIGHT_KEYS) ? 1 : 0);
    this.input.brake = this.any(BRAKE_KEYS) ? 1 : 0;
    this.input.handbrake = this.any(HANDBRAKE_KEYS);
    return this.input;
  }

  /** Сбросить зажатое — например при смене трассы. */
  clear(): void {
    this.held.clear();
    this.taps = 0;
  }
}
