/**
 * Числа, отлаженные в WebGL-прототипе (racer-prototype.html).
 * Переносятся как есть — прототип остаётся эталоном ощущения и правил.
 * Единицы: метры, секунды, радианы. Скорость — м/с (HUD умножает на 3.6).
 */

// ---------- геометрия трассы ----------
/** число точек, на которые ресемплится осевая линия круга */
export const N = 240;
/** полуширина полотна: дорога шириной 21 */
export const ROAD_HW = 10.5;
/** полудлина машины — используется для зажима к полотну и (с M2) коллайдера */
export const CAR_HALF = 1.7;

// ---------- продольная динамика ----------
export const MAXSPEED = 46;
export const AI_MAXBASE = 39;
export const ACCEL = 26;
export const BRAKE = 44;
export const REV_ACCEL = 14;
export const MAX_REV = 12;
export const ENGINE_BRK = 10;
export const DRAG = 0.55;
export const TURN_RATE = 2.7;

// ---------- газ = частота нажатий ----------
/** прирост скорости за одно свежее нажатие (падает с ростом скорости) */
export const TAP_IMPULSE = 3.3;
/** экспоненциальная потеря скорости в tap-режиме */
export const DRAG_TAP = 0.25;
/** постоянная потеря скорости в tap-режиме, м/с^2 */
export const ROLL = 2.2;
/**
 * Равновесие TAP_IMPULSE/DRAG_TAP/ROLL даёт максималку примерно на 9–10 тапах/с:
 *   f * TAP_IMPULSE * (1 - 0.55 * v / MAXSPEED) = DRAG_TAP * v + ROLL
 * С M2 эти три числа станут стартовой точкой для модели «оборотов».
 */
/** окно усреднения частоты нажатий для HUD, с */
export const TAP_RATE_WINDOW = 0.6;
/** частота нажатий, соответствующая полной шкале «газа» на HUD */
export const TAP_RATE_FULL = 11;

// ---------- машина: геометрия ----------
/** масса шасси, кг — база для всех сил ниже */
export const CAR_MASS = 1200;
/** полугабариты коллайдера шасси (кузов 2.2 x 0.8 x 4.2 из прототипа) */
export const CHASSIS_HALF = { x: 1.1, y: 0.4, z: 2.1 } as const;
/** высота центра коллайдера шасси над началом координат машины (оно на земле) */
export const CHASSIS_Y = 0.75;
export const WHEEL_RADIUS = 0.6;

export interface WheelSpec {
  /** смещение вправо от оси машины */
  readonly x: number;
  /** смещение вперёд; перёд машины смотрит в +z, как курс в прототипе */
  readonly z: number;
  /** передние колёса рулят, задние ведущие */
  readonly front: boolean;
}

/**
 * Раскладка колёс — общая для меша и для физики, чтобы визуальные колёса
 * стояли ровно там, где физика пускает лучи подвески.
 */
export const WHEELS: readonly WheelSpec[] = [
  { x: -1.05, z: 1.3, front: true },
  { x: 1.05, z: 1.3, front: true },
  { x: -1.05, z: -1.3, front: false },
  { x: 1.05, z: -1.3, front: false },
];

// ---------- машина: подвеска ----------
/** высота точки крепления подвески в системе координат шасси */
export const SUSPENSION_ANCHOR_Y = 0.75;
/** длина подвески без нагрузки: под весом сжимается примерно до 0.15 */
export const SUSPENSION_REST = 0.25;
export const SUSPENSION_TRAVEL = 0.25;
export const SUSPENSION_STIFFNESS = 32;
export const SUSPENSION_COMPRESSION = 0.82 * 2 * Math.sqrt(SUSPENSION_STIFFNESS);
export const SUSPENSION_RELAXATION = 0.88 * 2 * Math.sqrt(SUSPENSION_STIFFNESS);
export const SUSPENSION_MAX_FORCE = 60000;

// ---------- машина: сцепление ----------
/** продольное сцепление; занос настраивается в M3, здесь держим машину на трассе */
export const FRICTION_SLIP_FRONT = 3.2;
export const FRICTION_SLIP_REAR = 3.0;
export const SIDE_FRICTION_FRONT = 1.0;
export const SIDE_FRICTION_REAR = 1.0;

// ---------- машина: руль, тяга, тормоз ----------
/** максимальный угол поворота передних колёс, рад */
export const STEER_MAX = 0.52;
/** насколько угол урезается на максимальной скорости */
export const STEER_SPEED_FALLOFF = 0.55;
/** скорость доводки руля к цели, рад/с — руль не телепортируется */
export const STEER_RATE = 3.4;
/**
 * Суммарная тормозная сила, Н: BRAKE=44 м/с^2 из прототипа.
 * В Rapier тормоз задаётся импульсом, поэтому Vehicle домножает это на шаг.
 */
export const BRAKE_FORCE = CAR_MASS * BRAKE;
/** ручник: тормоз только по задней оси */
export const HANDBRAKE_FORCE = CAR_MASS * 30;
/** тяга заднего хода: REV_ACCEL=14 м/с^2 из прототипа */
export const REVERSE_FORCE = CAR_MASS * REV_ACCEL;

/**
 * Газ как «обороты» (план, п. 4.3): каждое нажатие подкидывает обороты,
 * без нажатий они падают, тяга берётся с кривой момента.
 *
 * Равновесие оборотов при частоте f: revs = f * REV_KICK / REV_DECAY = 0.08 * f.
 * Пик момента стоит на revs = 0.8, то есть ровно на ~10 нажатиях в секунду —
 * той частоте, которая в прототипе держала максималку. Долбить чаще можно,
 * но за пиком тяга мягко падает: появляется оптимальный ритм вместо «чем чаще, тем лучше».
 */
export const REV_KICK = 0.12;
export const REV_DECAY = 1.5;
export const REV_MAX = 1.6;
export const REV_PEAK = 0.8;
/** насколько падает момент за пиком, на единицу перекрута */
export const TORQUE_FALLOFF = 0.35;
/** ниже этой доли момент не падает, даже если долбить втрое чаще нужного */
export const TORQUE_FLOOR = 0.7;
/**
 * Тяга на пике момента и нулевой скорости.
 *
 * TAP_IMPULSE * 10 нажатий/с даёт в прототипе 33 м/с^2 на старте, отсюда и масштаб.
 * Дальше тяга режется множителем (1 - 0.55 * v / MAXSPEED) — тем же, что в прототипе
 * гасил прирост от нажатия с ростом скорости.
 */
export const ENGINE_FORCE_MAX = CAR_MASS * 33;
export const ENGINE_SPEED_FALLOFF = 0.55;

// ---------- машина: сопротивление ----------
/** экспоненциальное затухание скорости, соответствует DRAG_TAP */
export const LINEAR_DAMPING = DRAG_TAP;
export const ANGULAR_DAMPING = 1.2;
/** постоянное сопротивление качению: ROLL=2.2 м/с^2 из прототипа */
export const ROLL_RESIST_FORCE = CAR_MASS * ROLL;

// ---------- барьеры по кромкам дороги ----------
export const BARRIER_HEIGHT = 1.6;
export const BARRIER_THICKNESS = 0.6;

// ---------- физика мира ----------
/**
 * Утяжелённая гравитация — обычный приём аркадных гонок: машина плотнее прижата
 * к полотну, меньше козлит на кромках и не парит после трамплина.
 */
export const GRAVITY = -9.81 * 2.2;

// ---------- препятствия ----------
export const OBS_FRIC = 2.4;

// ---------- правила уик-энда ----------
export const TOTAL_LAPS = 3;
/** длительность квалификации, с */
export const QUAL_DURATION = 60;
/** предстартовый отсчёт, с (3-2-1 + «ГАЗ!») */
export const CD_TIME = 3.4;
/** сколько ждём отстающих после финиша первого, с */
export const FINISH_WINDOW = 32;
/** очки за места 1-2-3-4 */
export const PTS: readonly number[] = [6, 4, 3, 0];
/** бонус за быстрый круг гонки */
export const FAST_LAP_BONUS = 1;

// ---------- участники ----------
export const COLORS: readonly number[] = [0xffc21a, 0xe8402f, 0x2f7de8, 0x27c46b];
export const NAMES: readonly string[] = ["Ты", "ИИ 1", "ИИ 2", "ИИ 3"];

// ---------- камера ----------
/** удаление ортокамеры вдоль изометрической оси (1,1,1) */
export const CAM_DISTANCE = 700;
/** запас вокруг габаритов трассы при подгонке кадра */
export const CAM_PADDING = 6;
/** насколько кадр захватывает обочину за кромкой дороги */
export const CAM_MARGIN = 16;
/** верхняя граница высоты, которую камера обязана удержать в кадре */
export const CAM_HEIGHT = 6;

// ---------- цикл ----------
/** частота физического тика, Гц */
export const PHYSICS_HZ = 60;
