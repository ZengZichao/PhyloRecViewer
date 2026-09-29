/**
 * Tests for `model/traverse.lineageIds`, the id set Canvas uses when it
 * highlights a lineage: a node's ancestors plus everything beneath it.
 */
import { describe, it, expect } from "vitest";
import { lineageIds } from "./traverse";
import type { GeneNode, RecEvent } from "./types";

function node(id: string): GeneNode {
  const endEvent: RecEvent = { type: "leaf", speciesLocation: "S" };
  return { id, name: id, children: [], parent: null, events: [endEvent], endEvent, speciesId: "S", treeIndex: 0 };
}
function link(parent: GeneNode, child: GeneNode): GeneNode {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

describe("lineageIds: the lineage of one gene node", () => {
  it("gives an interior node its ancestors plus its whole subtree", () => {
    //        root
    //        /  \
    //       a    b
    //      / \
    //     a1  a2
    const root = node("root");
    const a = link(root, node("a"));
    link(root, node("b"));
    link(a, node("a1"));
    link(a, node("a2"));

    const ids = lineageIds(a);
    expect([...ids].sort()).toEqual(["a", "a1", "a2", "root"]);
  });
  it("gives a leaf nothing but its ancestor chain", () => {
    const root = node("root");
    const a = link(root, node("a"));
    const a1 = link(a, node("a1"));
    expect([...lineageIds(a1)].sort()).toEqual(["a", "a1", "root"]);
  });
  it("spans the entire tree from the root", () => {
    const root = node("root");
    const a = link(root, node("a"));
    link(a, node("a1"));
    expect(lineageIds(root).size).toBe(3);
  });
});
