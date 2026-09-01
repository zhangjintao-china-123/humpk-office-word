import { describe, expect, it } from "vitest";
import { LinkedList } from "../../src/model/list/LinkedList";

describe("LinkedList", () => {
  it("append 维护 head/tail 与前后指针", () => {
    const list = new LinkedList<string>();
    const a = list.append("a");
    const b = list.append("b");
    const c = list.append("c");

    expect(list.length).toBe(3);
    expect(list.head).toBe(a);
    expect(list.tail).toBe(c);
    expect(a.next).toBe(b);
    expect(b.pre).toBe(a);
    expect(b.next).toBe(c);
    expect(c.pre).toBe(b);
    expect(a.pre).toBeNull();
    expect(c.next).toBeNull();
  });

  it("insertBefore 插入头节点时不把 pre 指回自己", () => {
    const list = new LinkedList<string>();
    const b = list.append("b");
    const a = list.insertBefore(b, "a");

    expect(list.head).toBe(a);
    expect(a.pre).toBeNull();
    expect(a.next).toBe(b);
    expect(b.pre).toBe(a);
  });

  it("removeNode 更新头尾", () => {
    const list = new LinkedList<string>();
    const a = list.append("a");
    const b = list.append("b");
    list.append("c");
    list.removeNode(b);

    expect(list.toArray()).toEqual(["a", "c"]);
    expect(a.next?.data).toBe("c");
    expect(list.length).toBe(2);
  });
});
