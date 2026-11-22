import {
  mat3Identity,
  mat3Multiply,
  mat3Rotate,
  mat3Scale,
  mat3Translate,
  type Mat3,
} from './mat3.ts';

/** Biến đổi cục bộ của một `Node`: tịnh tiến → xoay → tỉ lệ (`T * R * S`). */
export interface Transform2D {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

function defaultTransform(): Transform2D {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

/**
 * Nút trong cây biến đổi gộp: mỗi bộ phận (thân, mũ, cửa…) là một `Node`
 * con, toạ độ local rồi ghép thành vật thể hoàn chỉnh.
 *
 * Thứ tự local = `T * R * S` (dịch xoay quay tâm, rồi tỉ lệ quay tâm).
 * `worldMatrix` = ma trận cha × local (cha ở gần gốc hơn).
 */
export class Node {
  transform: Transform2D = defaultTransform();
  readonly children: Node[] = [];
  parent: Node | null = null;

  /** Thêm `child` vào nút này; trả về `this` để nối chuỗi. */
  add(child: Node): this {
    if (child === this) throw new Error('Node.add: không thể thêm chính nó');
    // Tránh vòng lặp: nếu `this` nằm trong cây của `child` thì gỡ trước.
    let ancestor: Node | null = this;
    while (ancestor) {
      if (ancestor === child) {
        throw new Error('Node.add: sẽ tạo vòng lặp cây');
      }
      ancestor = ancestor.parent;
    }
    if (child.parent) {
      const i = child.parent.children.indexOf(child);
      if (i >= 0) child.parent.children.splice(i, 1);
    }
    child.parent = this;
    this.children.push(child);
    return this;
  }

  /** Gỡ `child` khỏi nút này. */
  remove(child: Node): this {
    const i = this.children.indexOf(child);
    if (i >= 0) {
      this.children.splice(i, 1);
      child.parent = null;
    }
    return this;
  }

  /** Ma trận cục bộ `T * R * S`. */
  localMatrix(): Mat3 {
    const t = this.transform;
    return mat3Multiply(
      mat3Multiply(mat3Translate(t.x, t.y), mat3Rotate(t.rotation)),
      mat3Scale(t.scaleX, t.scaleY),
    );
  }

  /** Ma trận world = `parent.worldMatrix() * localMatrix()`. */
  worldMatrix(): Mat3 {
    const local = this.localMatrix();
    return this.parent ? mat3Multiply(this.parent.worldMatrix(), local) : local;
  }

  /** Ma trận đơn vị — tiện ích cho nút gốc không biến đổi. */
  static identity(): Mat3 {
    return mat3Identity;
  }
}
