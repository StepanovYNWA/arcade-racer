import {
  AI_COUNTER_STEER,
  AI_DRIFT_FEATHER,
  AI_FEATHER_TIME,
  AI_LANE_SCALE,
  AI_LOOKAHEAD_BASE,
  AI_LOOKAHEAD_SPEED,
  AI_MAXBASE,
  AI_REVERSE_TIME,
  AI_SLIP_LIFT,
  AI_SPEED_DEADBAND,
  AI_SPEED_WINDOW_BASE,
  AI_SPEED_WINDOW_SPEED,
  AI_STEER_DEADBAND,
  AI_STEER_LEAD,
  AI_STEER_RELEASE,
  AI_STUCK_SPEED,
  AI_STUCK_TIME,
  AI_TAP_RATE,
  CURVE_SPEED_MIN,
  N,
} from "../constants";
import { emptyInput, type PlayerInput } from "../core/Input";
import type { Vehicle } from "../physics/Vehicle";
import type { Track } from "../track/buildTrack";

import type { Progress } from "./progress";

const wrapAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

/**
 * Соперник.
 *
 * Логика следования — из прототипа: целиться в точку осевой линии с упреждением
 * и сбрасывать скорость по профилю кривизны. Отличие в том, ЧЕМ он рулит: в прототипе
 * ИИ двигал координаты сам, здесь он заполняет тот же PlayerInput, что и клавиатура,
 * и дальше всё решает физика. Поэтому соперник обязан уметь то, чего в прототипе
 * не существовало: ловить занос и выбираться из стены.
 */
export class AiDriver {
  private readonly input = emptyInput();

  /** дробная часть накопленных нажатий: газ идёт ритмом, а не каждый тик */
  private tapPhase = 0;
  /** прошлое состояние руля — для гистерезиса против дребезга на прямой */
  private steerLatch = 0;
  /** сколько ещё секунд держать руль отпущенным, сбрасывая счётчик заноса */
  private feather = 0;
  /** сколько секунд машина фактически стоит */
  private stuck = 0;
  /** сколько ещё секунд сдавать назад */
  private reversing = 0;

  constructor(
    /** доля от разноса по стартовой сетке: своя колея у каждого соперника */
    private readonly lane: number,
    /** потолок скорости этого соперника, м/с */
    private readonly topSpeed: number,
    /** множитель ритма нажатий, 0..1: слабый соперник не попадает в пик момента */
    private readonly rhythm: number,
  ) {}

  /** Управляющие усилия на текущий тик — тот же интерфейс, что у клавиатуры. */
  update(track: Track, vehicle: Vehicle, progress: Progress, dt: number): PlayerInput {
    const out = this.input;
    out.tap = 0;
    out.steer = 0;
    out.brake = 0;

    const speed = vehicle.speed;
    const pos = vehicle.position;

    // --- куда целимся: точка осевой линии с упреждением, со своей колеёй ---
    const look = AI_LOOKAHEAD_BASE + Math.floor(Math.abs(speed) * AI_LOOKAHEAD_SPEED);
    const ti = (progress.seg + look) % N;
    const p = track.path[ti]!;
    const n = track.nrm[ti]!;
    // Колея держится только там, где трасса это позволяет: на прямой она полная,
    // в самом крутом повороте сходит в ноль и все целятся в осевую линию.
    const straight =
      (track.curveSpeed[ti]! - CURVE_SPEED_MIN) / (AI_MAXBASE - CURVE_SPEED_MIN);
    const off = this.lane * AI_LANE_SCALE * Math.max(0, straight);
    const tx = p.x + n.x * off;
    const tz = p.z + n.z * off;

    const desired = Math.atan2(tx - pos.x, tz - pos.z);
    /** куда довернуть нос, чтобы смотреть на цель */
    const noseErr = wrapAngle(desired - vehicle.heading);
    // Рулевая ошибка считается для вектора скорости, а не для носа: в заносе машина
    // едет не туда, куда смотрит, и вычитание угла скольжения само разворачивает руль
    // в противоположную сторону — то есть даёт контр-руль без отдельной ветки кода.
    const err = noseErr - vehicle.slipAngle * AI_COUNTER_STEER;

    // --- выбраться, если упёрся ---
    //
    // В прототипе этого не было и быть не могло: там машина не сталкивалась ни с чем,
    // кроме мягкого прижима к кромке. Здесь стены настоящие, и без заднего хода
    // соперник, ткнувшийся в барьер, остался бы там до конца гонки.
    if (this.reversing > 0) {
      // счётчик застревания на время манёвра не идёт: назад машина едет медленно,
      // и иначе он к концу манёвра уже переполнен и тут же требует нового
      this.reversing -= dt;
      if (this.reversing <= 0) this.stuck = 0;
      out.brake = 1;
      // Руль на заднем ходу ЗЕРКАЛЬНЫЙ: скорость отрицательная, и тот же угол
      // поворачивает нос в другую сторону (рыскание ~ v * tan(руль) / база).
      // Тем же рулём, что вперёд, машина отползала бы от трассы, а не к ней.
      // Угол скольжения здесь не вычитается: задним ходом он около 180° и осмысленной
      // рулевой ошибки из него не выходит — целимся носом.
      out.steer = -Math.sign(noseErr);
      return out;
    }
    this.stuck = Math.abs(speed) < AI_STUCK_SPEED ? this.stuck + dt : 0;
    if (this.stuck > AI_STUCK_TIME) {
      this.stuck = 0;
      this.reversing = AI_REVERSE_TIME;
      out.brake = 1;
      return out;
    }

    // --- руль: дискретный, как клавиатура ---
    //
    // Решение принимается не по текущей ошибке, а по ошибке за вычетом уже набранного
    // доворота: машина, которая вовсю поворачивает к цели, дорулит и без стрелки.
    const lead = err - AI_STEER_LEAD * vehicle.yawRate;
    const threshold = this.steerLatch === 0 ? AI_STEER_DEADBAND : AI_STEER_RELEASE;
    this.steerLatch = Math.abs(lead) > threshold ? Math.sign(lead) : 0;

    // Глубокий срыв — отпустить руль на мгновение. Счётчик удержания обнуляется,
    // и занос перестаёт нарастать; держать дальше значило бы его только углублять.
    if (this.feather > 0) this.feather -= dt;
    else if (vehicle.drift > AI_DRIFT_FEATHER) this.feather = AI_FEATHER_TIME;
    out.steer = this.feather > 0 ? 0 : this.steerLatch;

    // --- скорость: минимум профиля кривизны по окну впереди ---
    const win = AI_SPEED_WINDOW_BASE + Math.floor(Math.abs(speed) * AI_SPEED_WINDOW_SPEED);
    let target = this.topSpeed;
    for (let k = 0; k < win; k++) {
      target = Math.min(target, track.curveSpeed[(progress.seg + k) % N]!);
    }

    // --- газ ритмом нажатий ---
    //
    // Соперник не «даёт газ», он жмёт кнопку — иначе он играл бы в другую игру.
    // Ритм у каждого свой: слабый не попадает в пик момента и проигрывает на разгоне.
    const sliding = Math.abs(vehicle.slipAngle) > AI_SLIP_LIFT;
    if (speed < target - AI_SPEED_DEADBAND && !sliding) {
      this.tapPhase += AI_TAP_RATE * this.rhythm * dt;
      while (this.tapPhase >= 1) {
        this.tapPhase -= 1;
        out.tap++;
      }
    } else {
      this.tapPhase = 0;
      // Тормоз только на ходу: на околонулевой скорости он означает задний ход,
      // и соперник, доехавший до медленной шпильки, начал бы пятиться.
      if (speed > target + AI_SPEED_DEADBAND && speed > AI_STUCK_SPEED) out.brake = 1;
    }

    return out;
  }

  reset(): void {
    this.tapPhase = 0;
    this.steerLatch = 0;
    this.feather = 0;
    this.stuck = 0;
    this.reversing = 0;
  }
}
