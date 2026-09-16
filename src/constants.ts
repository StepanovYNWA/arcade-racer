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
