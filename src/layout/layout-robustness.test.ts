/**
 * Depth ceilings of the Newick and recPhyloXML parsers, and the branch-length
 * layout mode: pathological nesting fails as a parse error rather than
 * exhausting the call stack, and lengths never lift a child above its parent.
 */
import { describe, it, expect } from "vitest";
import { parseNewick, NewickParseError } from "../parser/newick";
import { parseRecPhyloXML, RecPhyloParseError } from "../parser/recphyloxml";
import { layout, defaultLayoutOptions } from "./index";
import { parseRecPhyloXML as parse } from "../parser/recphyloxml";

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

describe("parser depth ceilings", () => {
  it("newick deeper than the ceiling throws a friendly error, not RangeError", () => {
    const deep = "(".repeat(1500) + "leaf" + ")".repeat(1500) + ";";
    const e = thrown(() => parseNewick(deep));
    expect(e).toBeInstanceOf(NewickParseError);
    expect((e as Error).message).toMatch(/too deep/i);
  });

  it("deeply nested recPhyloXML throws a friendly depth error, not RangeError", () => {
    const d = 1500;
    const open = "<clade><name>n</name>".repeat(d);
    const close = "</clade>".repeat(d);
    const xml = `<recPhylo><spTree><phylogeny rooted="true">${open}${close}</phylogeny></spTree></recPhylo>`;
    const e = thrown(() => parseRecPhyloXML(xml));
    expect(e).toBeInstanceOf(RecPhyloParseError);
    expect((e as Error).message).toMatch(/deep|nest/i);
  });
});

describe("branch-length layout mode", () => {
  const xml = `<recPhylo>
    <spTree><phylogeny rooted="true">
      <clade><name>R</name>
        <clade branch_length="100"><name>A</name></clade>
        <clade branch_length="-50"><name>B</name></clade>
        <clade><name>C</name></clade>
      </clade>
    </phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true">
      <clade><name>g</name><eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec></clade>
    </phylogeny></recGeneTree>
  </recPhylo>`;
  const recon = parse(xml);
  const yOf = (res: ReturnType<typeof layout>, name: string): number => {
    const s = recon.species.byName.get(name);
    return res.positions.species.get(s!.id)!.y;
  };

  it("missing and negative branch lengths never place a child above its parent", () => {
    const res = layout(recon, { useBranchLengths: true, alignTips: false });
    const root = yOf(res, "R");
    expect(yOf(res, "A")).toBeGreaterThanOrEqual(root); // positive length below
    expect(yOf(res, "B")).toBeGreaterThanOrEqual(root); // negative floored at 0, not inverted
    expect(yOf(res, "C")).toBeGreaterThanOrEqual(root); // missing length -> 0, not a fabricated 1
  });

  it("alignTips snaps all tips to one baseline in branch-length mode", () => {
    const res = layout(recon, { useBranchLengths: true, alignTips: true });
    expect(yOf(res, "A")).toBe(yOf(res, "B"));
    expect(yOf(res, "B")).toBe(yOf(res, "C"));
  });
});

describe("label reservation scales with the label font size", () => {
  const xml = `<recPhylo>
    <spTree><phylogeny rooted="true"><clade><name>Ancestor</name>
      <clade><name>Antirrhinum_mexicanum_with_a_very_long_species_name</name></clade>
      <clade><name>Campanulales_spp</name></clade>
    </clade></phylogeny></spTree>
    <recGeneTree><phylogeny rooted="true"><clade><name>g0</name>
      <eventsRec><speciation speciesLocation="Ancestor"/></eventsRec>
      <clade><name>g1</name><eventsRec><leaf speciesLocation="Antirrhinum_mexicanum_with_a_very_long_species_name" geneName="a"/></eventsRec></clade>
      <clade><name>g2</name><eventsRec><leaf speciesLocation="Campanulales_spp" geneName="b"/></eventsRec></clade>
    </clade></phylogeny></recGeneTree></recPhylo>`;

  it("reserves proportionally more canvas when labels are drawn larger", () => {
    const recon = parseRecPhyloXML(xml, "labels");
    const small = layout(recon, { ...defaultLayoutOptions });
    const large = layout(recon, { ...defaultLayoutOptions, labelFontPx: 56 });
    const reserved = (r: typeof small) =>
      r.height - Math.max(...r.reconciliation.species.nodes.map((s) => r.positions.species.get(s.id)!.y));
    const s0 = reserved(small);
    const s1 = reserved(large);
    expect(s1).toBeGreaterThan(s0);
    // 56 px labels are 4.67x the default 12 px, so the reservation must grow
    // by the same factor rather than staying pinned at the old ceiling
    expect(s1 / s0).toBeGreaterThan(2);
  });
});
