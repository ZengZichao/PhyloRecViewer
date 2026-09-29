/**
 * Semantic regressions over cross-module behaviour: how the event filter maps
 * each terminal event type to a category, NHX round-trip fidelity for events
 * and species topology, node ids that stay identical across re-parses, and the
 * escaping of NHX values.
 */
import { describe, it, expect } from "vitest";
import { focusMatches, ALL_EVENTS, type EventFilter } from "./focus";
import type { GeneNode, Reconciliation, RecEvent } from "../model/types";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { parseNhxReconciliation } from "../parser/nhx";
import { reconToNhx } from "../export/newickExport";
import { encodeNhxValue, decodeNhxValue } from "../parser/newick";

function gene(id: string, type: RecEvent["type"], extra: RecEvent[] = []): GeneNode {
  const endEvent: RecEvent = { type, speciesLocation: "S" };
  const events = [...extra, endEvent];
  const g: GeneNode = {
    id,
    name: id,
    children: [],
    parent: null,
    events,
    endEvent,
    speciesId: "S",
    treeIndex: 0,
  };
  return g;
}

function fakeRecon(nodes: GeneNode[]): Reconciliation {
  const root = nodes[0];
  return {
    species: { root: { id: "s", name: "S", children: [], parent: null, depth: 0 }, byName: new Map(), nodes: [] },
    geneTrees: [{ index: 0, root, nodes }],
    warnings: [],
  };
}

describe("event filter covers every terminal event type", () => {
  const nodes = [
    gene("n_spec", "speciation"),
    gene("n_dup", "duplication"),
    gene("n_loss", "loss"),
    gene("n_leaf", "leaf"),
    gene("n_bo", "branchingOut"),
    gene("n_bc", "bifurcationOut"),
    gene("n_tb", "speciation", [{ type: "transferBack", destinationSpecies: "D" }]),
  ];
  const recon = fakeRecon(nodes);
  const ids = (f: Partial<EventFilter>) =>
    (focusMatches(recon, { query: "", regex: false, events: { ...ALL_EVENTS, ...f }, families: null }) ?? [])
      .map((g) => g.id);

  it("keeps leaf and bifurcationOut when only loss is filtered out", () => {
    const kept = ids({ loss: false });
    expect(kept).toContain("n_leaf");
    expect(kept).toContain("n_bc");
    expect(kept).not.toContain("n_loss");
  });
  it("treats branchingOut and bifurcationOut donors as the transfer category", () => {
    const onlyNoTransfer = ids({ transfer: false });
    // Pure transfer donors have no other category, so they are removed.
    expect(onlyNoTransfer).not.toContain("n_bo");
    expect(onlyNoTransfer).not.toContain("n_bc");
    // A node whose terminal event is a speciation stays visible via the
    // speciation category even though it also carries a transferBack arrival.
    expect(onlyNoTransfer).toContain("n_tb");
  });
  it("filters leaf tips independently", () => {
    expect(ids({ leaf: false })).not.toContain("n_leaf");
  });
});

const TRANSFER_XML = `<recPhylo>
  <spTree><phylogeny>
    <clade><name>LUCA</name><clade><name>Bac</name></clade><clade><name>Arc</name></clade></clade>
  </phylogeny></spTree>
  <recGeneTree><phylogeny>
    <clade><name>r</name><eventsRec><speciation speciesLocation="LUCA"/></eventsRec>
      <clade><name>d</name><eventsRec><branchingOut speciesLocation="Bac"/></eventsRec>
        <clade><name>keep</name><eventsRec><leaf speciesLocation="Bac" geneName="keep"/></eventsRec></clade>
        <clade><name>arr</name><eventsRec><transferBack destinationSpecies="Arc"/><leaf speciesLocation="Arc" geneName="arr"/></eventsRec></clade>
      </clade>
      <clade><name>lost</name><eventsRec><loss speciesLocation="Arc"/></eventsRec></clade>
    </clade>
  </phylogeny></recGeneTree>
</recPhylo>`;

function countEnds(recon: Reconciliation): Record<string, number> {
  const c: Record<string, number> = {};
  let transfer = 0;
  for (const t of recon.geneTrees)
    for (const g of t.nodes) {
      c[g.endEvent.type] = (c[g.endEvent.type] ?? 0) + 1;
      if (g.events.some((e) => e.type === "transferBack")) transfer++;
    }
  c.transfer = transfer;
  return c;
}

describe("NHX round-trip preserves events and species topology", () => {
  it("loss / transfer / donor survive export → import", () => {
    const original = parseRecPhyloXML(TRANSFER_XML);
    const back = parseNhxReconciliation(reconToNhx(original));
    const before = countEnds(original);
    const after = countEnds(back);
    expect(after.loss).toBe(before.loss);
    expect(after.branchingOut).toBe(before.branchingOut);
    expect(after.transfer).toBe(before.transfer);
    expect(after.leaf).toBe(before.leaf);
    // The reconstructed species tree must NOT hang Arc under Bac.
    const arc = back.species.byName.get("Arc");
    expect(arc?.parent?.name).toBe("LUCA");
  });
});

describe("node ids are stable across re-parses", () => {
  it("the same document parsed twice yields identical gene + species ids", () => {
    const a = parseRecPhyloXML(TRANSFER_XML);
    const b = parseRecPhyloXML(TRANSFER_XML);
    expect(a.geneTrees[0].nodes.map((n) => n.id)).toEqual(b.geneTrees[0].nodes.map((n) => n.id));
    expect(a.species.nodes.map((n) => n.id)).toEqual(b.species.nodes.map((n) => n.id));
  });
});

describe("NHX value escaping preserves delimiter-bearing names", () => {
  // Species / strain names with ':' '[' ']' are common (e.g. "Candida sp. JH-1:2").
  // The parser splits NHX values on ':', so writing such a name raw into S=...
  // would truncate it on an exported-then-reimported tree; values are escaped.
  const TRICKY = ["genus: sp. nov", "Candida sp. JH-1:2", "a[b]c", "100%pure", "x:[y]:z"];
  it("encode → decode is lossless for delimiter-bearing names", () => {
    for (const name of TRICKY) {
      expect(decodeNhxValue(encodeNhxValue(name))).toBe(name);
    }
  });
  it("encoded values contain no raw ':' '[' ']' that would break parsing", () => {
    for (const name of TRICKY) {
      const enc = encodeNhxValue(name);
      expect(enc).not.toMatch(/[:[\]]/);
    }
  });
});

