import RAPIER from "@dimforge/rapier3d-compat";
import { MathUtils, Quaternion, Vector3 } from "three/webgpu";

import {
  ANGULAR_DAMPING,
  BRAKE_FORCE,
  CAR_MASS,
  CHASSIS_HALF,
  CHASSIS_Y,
  DRIFT_IDLE_ANGLE,
  DRIFT_MAX_ANGLE,
  DRIFT_MIN_SPEED,
  DRIFT_RECOVERY,
  DRIFT_RECOVERY_RAMP,
  DRIFT_YAW_DAMPING,
  ENGINE_FORCE_MAX,
  ENGINE_SPEED_FALLOFF,
  FRICTION_SLIP_FRONT,
  FRICTION_SLIP_FRONT_BRAKING,
  FRICTION_SLIP_REAR,
  FRICTION_SLIP_REAR_BRAKING,
  LINEAR_DAMPING,
  MAXSPEED,
  MAX_REV,
  REVERSE_FORCE,
  REV_DECAY,
  REV_KICK,
  REV_MAX,
  REV_PEAK,
  ROLL_RESIST_FORCE,
  SIDE_FRICTION_FRONT,
  SIDE_FRICTION_FRONT_TURN,
  SIDE_FRICTION_REAR,
  SIDE_FRICTION_REAR_TURN,
  STEER_GRIP_DEADZONE,
  STEER_GRIP_FULL,
  STEER_SMOOTH_DECAY,
  STEER_MAX,
  STEER_RATE,
  STEER_SPEED_FALLOFF,
  SUSPENSION_ANCHOR_Y,
  SUSPENSION_COMPRESSION,
  SUSPENSION_MAX_FORCE,
  SUSPENSION_RELAXATION,
  SUSPENSION_REST,
  SUSPENSION_STIFFNESS,
  SUSPENSION_TRAVEL,
  TORQUE_FALLOFF,
  TORQUE_FLOOR,
  WHEELBASE,
  WHEELS,
  WHEEL_RADIUS,
  YAW_FOLLOW,
  YAW_RATE_MAX,
} from "../constants";
import type { PlayerInput } from "../core/Input";

import type { PhysicsWorld } from "./World";

export interface Spawn {
  position: Vector3;
  /** курс в тех же единицах, что и mesh.rotation.y */
  heading: number;
}

/** Режим сцепления: под тормозом оси цепляются, в остальное время зад скользит. */
type GripMode = "drive" | "brake";

/** Ниже этой скорости «тормоз» означает «сдать назад», как в прототипе. */
const REVERSE_THRESHOLD = 0.5;

/**
 * Кривая момента от оборотов.
 *
 * До пика момент растёт линейно — так же, как в прототипе тяга росла линейно по
 * частоте нажатий. Обязательно torque(0) = 0: иначе машина газует сама, без нажатий,
 * и вся механика «жми часто» теряет смысл.
 *
 * За пиком момент мягко падает и упирается в полку TORQUE_FLOOR. Смысл полки:
 * попадать в такт выгодно, но бестолковый долбёж не превращает машину в неуправляемую —
 * предсказуемость важнее реализма.
 *
 * Масштаб сходится с прототипом: одно нажатие с места поднимает обороты на REV_KICK,
 * они гаснут с постоянной REV_DECAY, и полный импульс выходит
 * ENGINE_FORCE_MAX / REV_PEAK * REV_KICK / REV_DECAY = 3960 Н·с, то есть ровно
 * TAP_IMPULSE = 3.3 м/с прибавки для машины массой CAR_MASS.
 */
function torqueCurve(revs: number): number {
  const r = revs / REV_PEAK;
  if (r <= 1) return r;
  return Math.max(TORQUE_FLOOR, 1 - TORQUE_FALLOFF * (r - 1));
}

/**
 * Машина на raycast-подвеске Rapier.
 *
 * Шасси — динамическое тело, четыре колеса — лучи с подвеской. Занос такая модель
 * даёт «бесплатно» через трение колёс, но настраивается он в M3; здесь задача проще —
 * чтобы машина ехала, слушалась руля и держалась на трассе.
 */
export class Vehicle {
  readonly body: RAPIER.RigidBody;
  private readonly controller: RAPIER.DynamicRayCastVehicleController;
  private readonly world: RAPIER.World;

  private revs = 0;
  private steerAngle = 0;
  private lastEngine = 0;
  private lastBrake = 0;
  /**
   * Два разных «насколько вывернут руль», и путать их нельзя.
   *
   * Доля считается от ТЕКУЩЕГО (урезанного скоростью) максимума: «до упора» должно
   * означать «до упора» на любой скорости.
   *
   * turnIntensity — та же доля, но с задержкой на спад. По ней падает сцепление
   * и поднимается потолок заноса: без задержки пауза между нажатиями стрелки
   * мгновенно возвращала сцепление и обрывала скольжение.
   */
  /** сглаженный угол колёс: доворот мгновенный, возврат с задержкой */
  private steerSmooth = 0;
  /** доля выворота по сглаженному углу, 0..1 */
  private turnIntensity = 0;
  /** момент инерции шасси вокруг вертикали — нужен, чтобы гасить рыскание в физичных единицах */
  private readonly inertiaY: number;

  // состояние для интерполяции рендера между физическими тиками
  private readonly prevPos = new Vector3();
  private readonly currPos = new Vector3();
  private readonly prevRot = new Quaternion();
  private readonly currRot = new Quaternion();

  constructor(physics: PhysicsWorld, spawn: Spawn) {
    this.world = physics.world;

    const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spawn.heading);
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position.x, spawn.position.y, spawn.position.z)
      .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      .setLinearDamping(LINEAR_DAMPING)
      .setAngularDamping(ANGULAR_DAMPING)
      // на 46 м/с за тик машина проходит 0.77 м — без CCD она прошивает барьер
      .setCcdEnabled(true)
      .setCanSleep(false);

    this.body = this.world.createRigidBody(desc);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(CHASSIS_HALF.x, CHASSIS_HALF.y, CHASSIS_HALF.z)
        .setTranslation(0, CHASSIS_Y, 0)
        .setMass(CAR_MASS)
        .setFriction(0.4),
      this.body,
    );

    this.controller = this.world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    // да, сеттер в биндингах Rapier называется именно так (геттер — indexForwardAxis)
    this.controller.setIndexForwardAxis = 2;

    for (const w of WHEELS) {
      this.controller.addWheel(
        { x: w.x, y: SUSPENSION_ANCHOR_Y, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        SUSPENSION_REST,
        WHEEL_RADIUS,
      );
    }

    WHEELS.forEach((_, i) => {
      this.controller.setWheelSuspensionStiffness(i, SUSPENSION_STIFFNESS);
      this.controller.setWheelSuspensionCompression(i, SUSPENSION_COMPRESSION);
      this.controller.setWheelSuspensionRelaxation(i, SUSPENSION_RELAXATION);
      this.controller.setWheelMaxSuspensionTravel(i, SUSPENSION_TRAVEL);
      this.controller.setWheelMaxSuspensionForce(i, SUSPENSION_MAX_FORCE);
    });
    this.applyGrip("drive");

    this.inertiaY = this.body.principalInertia().y;

    this.readTransform(this.currPos, this.currRot);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }

  /** Продольная скорость вдоль курса, м/с (со знаком). */
  get speed(): number {
    return this.controller.currentVehicleSpeed();
  }

  /** Обороты, нормированные к пику момента: 1.0 — идеальный ритм нажатий. */
  get revsNorm(): number {
    return this.revs / REV_PEAK;
  }

  /**
   * Угол заноса: между тем, куда смотрит машина, и тем, куда она едет, рад.
   * Ноль — едет ровно, растёт при скольжении. Нужен и для HUD, и для антизаноса ИИ в M5.
   */
  get slipAngle(): number {
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    if (speed < 1) return 0;
    const q = this.body.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    let a = Math.atan2(lv.x, lv.z) - yaw;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /**
   * Сцепление колёс. Ручник роняет заднюю ось: и круг трения, и боковую жёсткость.
   * Отпустил — сцепление возвращается тем же тиком, машина цепляется и выходит из заноса.
   */
  private applyGrip(mode: GripMode): void {
    const braking = mode === "brake";
    // обе оси тем скользче, чем круче вывернут руль: в резкий поворот машина
    // входит в скольжении целиком, а не срывает один только зад
    // Доля выворота от текущего максимума, за вычетом мёртвой зоны: подруливание
    // на прямой сцепление не трогает, а заметный поворот срывает обе оси.
    const k = MathUtils.clamp(
      (this.turnIntensity - STEER_GRIP_DEADZONE) / (STEER_GRIP_FULL - STEER_GRIP_DEADZONE),
      0,
      1,
    );
    const frontSide = SIDE_FRICTION_FRONT + (SIDE_FRICTION_FRONT_TURN - SIDE_FRICTION_FRONT) * k;
    const rearSide = SIDE_FRICTION_REAR + (SIDE_FRICTION_REAR_TURN - SIDE_FRICTION_REAR) * k;

    WHEELS.forEach((w, i) => {
      const slip = w.front
        ? braking
          ? FRICTION_SLIP_FRONT_BRAKING
          : FRICTION_SLIP_FRONT
        : braking
          ? FRICTION_SLIP_REAR_BRAKING
          : FRICTION_SLIP_REAR;

      this.controller.setWheelFrictionSlip(i, slip);
      this.controller.setWheelSideFrictionStiffness(i, w.front ? frontSide : rearSide);
    });
  }

  /** Сколько колёс сейчас касается земли — нужно и для HUD, и для антизаноса в M5. */
  get wheelsOnGround(): number {
    let n = 0;
    for (let i = 0; i < WHEELS.length; i++) if (this.controller.wheelIsInContact(i)) n++;
    return n;
  }

  /**
   * Тик управления. Вызывается в fixedUpdate ДО world.step():
   * updateVehicle пересчитывает силы колёс и правит скорость шасси,
   * а солвер уже разбирается со столкновениями.
   */
  update(input: PlayerInput, dt: number): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);

    const speed = this.speed;
    const speedFrac = MathUtils.clamp(Math.abs(speed) / MAXSPEED, 0, 1);

    // --- газ: нажатия подкидывают обороты, без нажатий обороты падают ---
    this.revs = Math.min(REV_MAX, this.revs + input.tap * REV_KICK);
    this.revs = Math.max(0, this.revs - this.revs * REV_DECAY * dt);

    const reversing = input.brake > 0 && speed < REVERSE_THRESHOLD;
    const braking = input.brake > 0 && !reversing;

    let engine = 0;
    if (reversing) {
      engine = speed > -MAX_REV ? -REVERSE_FORCE * input.brake : 0;
    } else if (!braking && speed < MAXSPEED) {
      engine = ENGINE_FORCE_MAX * torqueCurve(this.revs) * (1 - ENGINE_SPEED_FALLOFF * speedFrac);
    }
    // Тяга на тормозе обнуляется не для красоты: Rapier игнорирует тормоз на колесе,
    // у которого ненулевая тяга, поэтому иначе задняя ось на тормозе просто не тормозит.
    // Обороты при этом сохраняются — отпустил тормоз, и тяга вернулась без новых нажатий.

    // --- тормоз и сопротивление качению ---
    //
    // Осторожно с единицами: setWheelEngineForce принимает силу и умножает её на шаг
    // внутри, а setWheelBrake принимает уже готовый импульс. Если передать туда
    // ньютоны, тормоз окажется сильнее двигателя в 1/dt раз и машина не тронется.
    // Поэтому все *_FORCE здесь хранятся в ньютонах и переводятся в импульс явно.
    const wheelCount = WHEELS.length;
    const brakeForce = ROLL_RESIST_FORCE + (braking ? BRAKE_FORCE : 0);
    const baseBrake = (brakeForce * dt) / wheelCount;

    // --- руль: угол доводится с конечной скоростью и урезается на скорости ---
    const steerRange = STEER_MAX * (1 - STEER_SPEED_FALLOFF * speedFrac);
    const steerTarget = input.steer * steerRange;
    const maxStep = STEER_RATE * dt;
    this.steerAngle += MathUtils.clamp(steerTarget - this.steerAngle, -maxStep, maxStep);
    // доля от текущего максимума, а не от полного STEER_MAX: угол колёс сам урезается
    // с ростом скорости, и «до упора» должно означать «до упора» на любой скорости
    // Сглаженный руль: доворот повторяем мгновенно, возврат тянем с задержкой.
    // От него зависит всё скольжение сразу, поэтому пауза между нажатиями стрелки
    // больше не обрывает занос — ни по сцеплению, ни по удержанию курса.
    // Осторожно со знаком: при отпущенной стрелке угол ровно ноль, и проверка
    // «знак сменился» сработала бы на sign(0) = 0, обнуляя сглаживание ровно там,
    // где оно и нужно. Переворот засчитываем только при двух ненулевых знаках.
    const flipped =
      this.steerAngle !== 0 &&
      this.steerSmooth !== 0 &&
      Math.sign(this.steerAngle) !== Math.sign(this.steerSmooth);
    if (Math.abs(this.steerAngle) >= Math.abs(this.steerSmooth) || flipped) {
      this.steerSmooth = this.steerAngle;
    } else {
      const decay = STEER_SMOOTH_DECAY * dt;
      this.steerSmooth -= Math.sign(this.steerSmooth) * Math.min(decay, Math.abs(this.steerSmooth));
    }
    this.turnIntensity = Math.min(1, Math.abs(this.steerSmooth) / Math.max(steerRange, 1e-4));

    this.lastEngine = engine;
    this.lastBrake = baseBrake;

    this.applyGrip(braking || reversing ? "brake" : "drive");

    const driven = WHEELS.filter((w) => !w.front).length;
    WHEELS.forEach((w, i) => {
      // задний привод: тяга только на заднюю ось — с неё же в M3 начнётся занос
      this.controller.setWheelEngineForce(i, w.front ? 0 : engine / driven);
      this.controller.setWheelSteering(i, w.front ? this.steerAngle : 0);
      this.controller.setWheelBrake(i, baseBrake);
    });

    this.controller.updateVehicle(dt);
    this.holdHeading(dt);
    this.stabilizeDrift(dt, reversing);
  }

  /**
   * Удержание курса.
   *
   * Машина доворачивается ровно настолько, насколько велит геометрия руля, а лишнее
   * вращение гасится. Это и превращает скольжение в боковой дрифт: без удержания
   * низкое боковое сцепление означает «машину крутит вокруг себя», с ним — «машина
   * едет боком, оставаясь носом туда, куда рулишь».
   *
   * Боковую скорость здесь не трогаем совсем — гасится только вращение, поэтому
   * скольжение вбок остаётся полностью во власти шин.
   */
  private holdHeading(dt: number): void {
    const lv = this.body.linvel();
    if (Math.hypot(lv.x, lv.z) < DRIFT_MIN_SPEED) return;

    // Велосипедная модель даёт темп доворота по геометрии руля, но на полном вывороте
    // это почти 180°/с — разворот на месте. Потолок и превращает поворот в скольжение:
    // корпус доворачивается медленно, а машину несёт по дуге шире геометрической.
    const kinematic = (this.speed * Math.tan(this.steerSmooth)) / WHEELBASE;
    const expected = MathUtils.clamp(kinematic, -YAW_RATE_MAX, YAW_RATE_MAX);
    const excess = this.body.angvel().y - expected;
    this.body.applyTorqueImpulse({ x: 0, y: -excess * YAW_FOLLOW * this.inertiaY * dt, z: 0 }, true);
  }

  /**
   * Потолок на занос.
   *
   * Пока машина скользит в пределах разрешённого угла, здесь не происходит ничего —
   * занос живёт на трении шин. За потолком вектор скорости подтягивается к курсу, а
   * рыскание гасится, так что развернуть машину полностью нельзя.
   *
   * Работать это должно после updateVehicle: тот уже выставил скорости шасси по колёсам,
   * и мы правим результат до того, как солвер сделает шаг.
   */
  private stabilizeDrift(dt: number, reversing: boolean): void {
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    if (speed < DRIFT_MIN_SPEED) return;

    // На заднем ходу скорость направлена против курса, и «занос 180°» стабилизатор
    // принял бы за срыв и погасил бы движение назад. Поэтому там угол складывается
    // к задней полуоси.
    //
    // Но только там. Складывать по одному лишь порогу в 90° нельзя: на льду занос
    // доходит до 80°, и стоило бы ему перевалить за 90°, как стабилизатор начал бы
    // «дотягивать» машину к задней полуоси, то есть сам доворачивал бы её в разворот.
    // Пока игрок не сдаёт назад, цель всегда одна — ехать носом вперёд.
    let slip = this.slipAngle;
    if (reversing) {
      if (slip > Math.PI / 2) slip -= Math.PI;
      else if (slip < -Math.PI / 2) slip += Math.PI;
    }

    // Потолок раскрывается по фактическому углу колёс: он доводится плавно,
    // поэтому потолок разжимается и сжимается без рывка.
    const limit = DRIFT_IDLE_ANGLE + (DRIFT_MAX_ANGLE - DRIFT_IDLE_ANGLE) * this.turnIntensity;
    const excess = Math.abs(slip) - limit;
    if (excess <= 0) return;

    // Поворот вектора скорости к курсу; модуль скорости сохраняется, энергия не
    // добавляется. Скорость возврата растёт с глубиной срыва: у потолка стабилизатор
    // почти незаметен, а дальше упирается стеной.
    // Жёсткость нарастает только за настоящей стеной (DRIFT_MAX_ANGLE). Внутри неё
    // возврат всегда мягкий, иначе сжатие потолка выщёлкивало бы машину из заноса.
    const beyondWall = Math.max(0, Math.abs(slip) - DRIFT_MAX_ANGLE);
    const rate = DRIFT_RECOVERY + DRIFT_RECOVERY_RAMP * beyondWall;
    const theta = -Math.sign(slip) * Math.min(excess, rate * dt);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.body.setLinvel({ x: lv.x * c + lv.z * s, y: lv.y, z: lv.z * c - lv.x * s }, true);

    const av = this.body.angvel();
    this.body.applyTorqueImpulse({ x: 0, y: -av.y * DRIFT_YAW_DAMPING * this.inertiaY * dt, z: 0 }, true);
  }

  /** Снять трансформ после world.step(). */
  sync(): void {
    this.readTransform(this.currPos, this.currRot);
  }

  private readTransform(pos: Vector3, rot: Quaternion): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    pos.set(t.x, t.y, t.z);
    rot.set(r.x, r.y, r.z, r.w);
  }

  /** Положение и поворот для кадра между тиками. */
  interpolate(alpha: number, outPos: Vector3, outRot: Quaternion): void {
    outPos.lerpVectors(this.prevPos, this.currPos, alpha);
    outRot.copy(this.prevRot).slerp(this.currRot, alpha);
  }

  /** Ход подвески i-го колеса — на сколько колесо опущено от точки крепления. */
  suspensionLength(i: number): number {
    return this.controller.wheelSuspensionLength(i) ?? SUSPENSION_REST;
  }

  /** Накопленный угол качения i-го колеса. */
  wheelRotation(i: number): number {
    return this.controller.wheelRotation(i) ?? 0;
  }

  /** Текущий угол поворота передних колёс. */
  get steering(): number {
    return this.steerAngle;
  }

  /**
   * Срез сил на колёсах — для настройки баланса (DEV).
   * Продольный и боковой импульсы плюс сила подвески показывают, упирается ли
   * тяга в сцепление или во что-то ещё.
   */
  telemetry(): {
    speed: number;
    revs: number;
    engine: number;
    brake: number;
    forward: number[];
    side: number[];
    suspension: number[];
    contact: boolean[];
    frictionSlip: number[];
    sideFriction: number[];
    skid: number[];
  } {
    const idx = WHEELS.map((_, i) => i);
    return {
      speed: this.speed,
      revs: this.revs,
      engine: this.lastEngine,
      brake: this.lastBrake,
      forward: idx.map((i) => this.controller.wheelForwardImpulse(i) ?? 0),
      side: idx.map((i) => this.controller.wheelSideImpulse(i) ?? 0),
      suspension: idx.map((i) => this.controller.wheelSuspensionForce(i) ?? 0),
      contact: idx.map((i) => this.controller.wheelIsInContact(i)),
      frictionSlip: idx.map((i) => this.controller.wheelFrictionSlip(i) ?? 0),
      sideFriction: idx.map((i) => this.controller.wheelSideFrictionStiffness(i) ?? 0),
      skid: idx.map((i) => this.controller.wheelSideImpulse(i) ?? 0),
    };
  }

  /** Поставить машину на сетку и обнулить движение. */
  reset(spawn: Spawn): void {
    const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spawn.heading);
    this.body.setTranslation({ x: spawn.position.x, y: spawn.position.y, z: spawn.position.z }, true);
    this.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.revs = 0;
    this.steerAngle = 0;

    this.readTransform(this.currPos, this.currRot);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
  }
}
