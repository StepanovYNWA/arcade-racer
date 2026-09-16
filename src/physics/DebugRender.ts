import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from "three/webgpu";

import type { PhysicsWorld } from "./World";

/**
 * Каркас коллайдеров поверх сцены (DEV, по `?physics` в адресной строке).
 *
 * Барьеры невидимы в игре — совпадают ли они с нарисованной кромкой, глазом не
 * проверить. Здесь пригодится и дальше: в M4 так же видно коллайдеры препятствий.
 */
export class PhysicsDebugRender {
  private readonly lines: LineSegments;
  private readonly physics: PhysicsWorld;

  constructor(physics: PhysicsWorld, scene: Scene) {
    this.physics = physics;
    const geometry = new BufferGeometry();
    this.lines = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }));
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(): void {
    const { vertices, colors } = this.physics.world.debugRender();
    this.lines.geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    this.lines.geometry.setAttribute("color", new BufferAttribute(colors, 4));
  }
}
