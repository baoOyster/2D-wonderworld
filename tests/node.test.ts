import { describe, expect, it } from 'vitest';
import { mat3Apply, mat3Multiply, mat3Rotate, mat3Scale, mat3Translate } from '../src/core/mat3.ts';
import { Node } from '../src/core/node.ts';
import { vec2 } from '../src/core/vec2.ts';

describe('Node', () => {
  it('mặc định: không dịch, không xoay, scale 1', () => {
    const n = new Node();
    expect(n.transform).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(n.children).toHaveLength(0);
    expect(n.parent).toBeNull();
  });

  it('add trả về this và set parent', () => {
    const parent = new Node();
    const child = new Node();
    expect(parent.add(child)).toBe(parent);
    expect(child.parent).toBe(parent);
    expect(parent.children).toContain(child);
  });

  it('localMatrix = T * R * S', () => {
    const n = new Node();
    n.transform = { x: 10, y: 20, rotation: Math.PI / 2, scaleX: 2, scaleY: 3 };
    const expected = mat3Multiply(
      mat3Multiply(mat3Translate(10, 20), mat3Rotate(Math.PI / 2)),
      mat3Scale(2, 3),
    );
    for (let i = 0; i < 9; i++) expect(n.localMatrix()[i]).toBeCloseTo(expected[i], 12);
  });

  it('cây 2 tầng: toạ độ world = cha × con (tính tay)', () => {
    // Cha dịch (100, 50); con dịch (10, 0) local.
    const root = new Node();
    root.transform = { x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 };
    const child = new Node();
    child.transform = { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    root.add(child);

    const world = mat3Apply(child.worldMatrix(), vec2(0, 0));
    expect(world.x).toBeCloseTo(110, 9);
    expect(world.y).toBeCloseTo(50, 9);
  });

  it('cây 3 tầng: xoay của cha ảnh hưởng tới cháu', () => {
    // gốc (không đổi) → trung gian xoay 90° tại (0,0) → cháu dịch (10,0) local
    const root = new Node();
    const mid = new Node();
    mid.transform = { x: 0, y: 0, rotation: Math.PI / 2, scaleX: 1, scaleY: 1 };
    const leaf = new Node();
    leaf.transform = { x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
    root.add(mid);
    mid.add(leaf);

    const world = mat3Apply(leaf.worldMatrix(), vec2(0, 0));
    expect(world.x).toBeCloseTo(0, 9);
    expect(world.y).toBeCloseTo(10, 9);
  });

  it('worldMatrix khớp với phép nhân thủ công', () => {
    const parent = new Node();
    parent.transform = { x: 5, y: -3, rotation: 0.3, scaleX: 2, scaleY: 2 };
    const child = new Node();
    child.transform = { x: 1, y: 2, rotation: -0.5, scaleX: 1.5, scaleY: 0.5 };
    parent.add(child);

    const manual = mat3Multiply(parent.worldMatrix(), child.localMatrix());
    for (let i = 0; i < 9; i++) {
      expect(child.worldMatrix()[i]).toBeCloseTo(manual[i], 12);
    }
  });

  it('add lại node đang có cha khác thì chuyển cây', () => {
    const a = new Node();
    const b = new Node();
    const child = new Node();
    a.add(child);
    b.add(child);
    expect(a.children).not.toContain(child);
    expect(b.children).toContain(child);
    expect(child.parent).toBe(b);
  });

  it('chống vòng lặp: không thêm ông/bố vào con', () => {
    const parent = new Node();
    const child = new Node();
    parent.add(child);
    expect(() => child.add(parent)).toThrow();
    expect(() => parent.add(parent)).toThrow();
  });

  it('remove gỡ con và clear parent', () => {
    const parent = new Node();
    const child = new Node();
    parent.add(child);
    parent.remove(child);
    expect(parent.children).toHaveLength(0);
    expect(child.parent).toBeNull();
  });
});
