export class LinkedNode<T> {
  pre: LinkedNode<T> | null = null;
  next: LinkedNode<T> | null = null;

  constructor(public data: T) {}
}

export class LinkedList<T> {
  head: LinkedNode<T> | null = null;
  tail: LinkedNode<T> | null = null;
  length = 0;

  append(data: T): LinkedNode<T> {
    return this.appendNode(new LinkedNode(data));
  }

  appendNode(node: LinkedNode<T>): LinkedNode<T> {
    node.pre = this.tail;
    node.next = null;
    if (!this.head || !this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      this.tail = node;
    }
    this.length += 1;
    return node;
  }

  insertAfter(node: LinkedNode<T>, data: T): LinkedNode<T> {
    const created = new LinkedNode(data);
    const next = node.next;
    node.next = created;
    created.pre = node;
    if (next) {
      created.next = next;
      next.pre = created;
    } else {
      this.tail = created;
    }
    this.length += 1;
    return created;
  }

  insertBefore(node: LinkedNode<T>, data: T): LinkedNode<T> {
    const created = new LinkedNode(data);
    const pre = node.pre;
    node.pre = created;
    created.next = node;
    if (pre) {
      created.pre = pre;
      pre.next = created;
    } else {
      this.head = created;
    }
    this.length += 1;
    return created;
  }

  insertNodeAfter(anchor: LinkedNode<T>, node: LinkedNode<T>): LinkedNode<T> {
    const next = anchor.next;
    anchor.next = node;
    node.pre = anchor;
    node.next = next;
    if (next) {
      next.pre = node;
    } else {
      this.tail = node;
    }
    this.length += 1;
    return node;
  }

  insertNodeBefore(anchor: LinkedNode<T>, node: LinkedNode<T>): LinkedNode<T> {
    const pre = anchor.pre;
    anchor.pre = node;
    node.next = anchor;
    node.pre = pre;
    if (pre) {
      pre.next = node;
    } else {
      this.head = node;
    }
    this.length += 1;
    return node;
  }

  removeNode(node: LinkedNode<T>): { nodePre: LinkedNode<T> | null; nodeNext: LinkedNode<T> | null } {
    const nodePre = node.pre;
    const nodeNext = node.next;
    if (nodePre) {
      nodePre.next = nodeNext;
    } else {
      this.head = nodeNext;
    }
    if (nodeNext) {
      nodeNext.pre = nodePre;
    } else {
      this.tail = nodePre;
    }
    node.pre = null;
    node.next = null;
    this.length -= 1;
    return { nodePre, nodeNext };
  }

  each(callback: (node: LinkedNode<T>, index: number) => unknown): unknown {
    let current = this.head;
    let index = 0;
    while (current) {
      const result = callback(current, index);
      if (result) {
        return result;
      }
      current = current.next;
      index += 1;
    }
    return undefined;
  }

  toArray(): T[] {
    const items: T[] = [];
    this.each((node) => {
      items.push(node.data);
    });
    return items;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }
}
