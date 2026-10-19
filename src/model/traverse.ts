import type { GeneNode } from "./types";

/** All node ids on the lineage of `node`: its ancestors plus its whole subtree. */
export function lineageIds(node: GeneNode): Set<string> {
  const ids = new Set<string>();
  let a: GeneNode | null = node;
  while (a) {
    ids.add(a.id);
    a = a.parent;
  }
  const stack: GeneNode[] = [node];
  while (stack.length) {
    const n = stack.pop() as GeneNode;
    ids.add(n.id);
    for (const c of n.children) stack.push(c);
  }
  return ids;
}
