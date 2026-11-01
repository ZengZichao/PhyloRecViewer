/**
 * Round-trip tests for the recPhyloXML writer: parse -> serialize -> parse
 * must reproduce the same model - species tree (names, structure, branch
 * lengths), gene tree names, every event (type, species, destination, gene
 * name, timeSlice, confidence), multiple transfer arrivals per node, and
 * branch lengths.
 */
import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "../parser/recphyloxml";
import { reconToRecPhyloXml, nhxExportLosses } from "./recPhyloXmlExport";

const RICH = `<?xml version="1.0" encoding="UTF-8"?>
<recPhyloXML xmlns="http://www.recg.org">
  <spTree>
    <phylogeny rooted="true">
      <clade branch_length="1">
        <name>R</name>
        <clade><name>A</name></clade>
        <clade branch_length="0.5"><name>B</name></clade>
      </clade>
    </phylogeny>
  </spTree>
  <recGeneTree>
    <phylogeny rooted="true">
      <name>OG0001</name>
      <clade branch_length="0.2">
        <name>g_root</name>
        <eventsRec>
          <branchingOut speciesLocation="R" timeSlice="2"/>
        </eventsRec>
        <clade branch_length="0.1">
          <name>g_arr</name>
          <eventsRec>
            <transferBack destinationSpecies="B" speciesLocation="A" timeSlice="3" confidence="0.87"/>
            <transferBack destinationSpecies="A" speciesLocation="A" timeSlice="4"/>
            <leaf speciesLocation="B" geneName="x_1" confidence="0.95"/>
          </eventsRec>
        </clade>
        <clade>
          <name>g_dup</name>
          <eventsRec><duplication speciesLocation="A"/></eventsRec>
          <clade><eventsRec><loss speciesLocation="A" timeSlice="6"/></eventsRec></clade>
          <clade><eventsRec><leaf speciesLocation="A" geneName="x_2"/></eventsRec></clade>
        </clade>
      </clade>
    </phylogeny>
  </recGeneTree>
</recPhyloXML>`;

describe("recPhyloXML export", () => {
  it("round-trips a rich document to an equivalent model", () => {
    const first = parseRecPhyloXML(RICH);
    const xml = reconToRecPhyloXml(first);
    const second = parseRecPhyloXML(xml);

    // Species tree: names, shape, branch lengths.
    const spNames = (r: typeof first) => r.species.nodes.map((n) => `${n.name}:${n.depth}:${n.branchLength ?? "-"}`);
    expect(spNames(second)).toEqual(spNames(first));
    expect(second.species.byName.get("B")?.branchLength).toBe(0.5);

    // Gene trees: name, nodes, events in order with all attributes.
    expect(second.geneTrees).toHaveLength(first.geneTrees.length);
    expect(second.geneTrees[0].name).toBe("OG0001");
    const ev = (r: typeof first) =>
      r.geneTrees[0].nodes.map((n) =>
        JSON.stringify({
          name: n.name,
          bl: n.branchLength ?? null,
          events: n.events.map((e) => ({
            t: e.type,
            sp: e.speciesLocation ?? null,
            dest: e.destinationSpecies ?? null,
            gn: e.geneName ?? null,
            ts: e.timeSlice ?? null,
            cf: e.confidence ?? null,
          })),
        }),
      );
    expect(ev(second)).toEqual(ev(first));
  });

  it("keeps multiple transferBack arrivals on one node", () => {
    const first = parseRecPhyloXML(RICH);
    const second = parseRecPhyloXmlFromExport(first);
    const arrNode = second.geneTrees[0].nodes.find((n) => n.name === "g_arr");
    expect(arrNode).toBeDefined();
    const arrivals = arrNode!.events.filter((e) => e.type === "transferBack");
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0].destinationSpecies).toBe("B");
    expect(arrivals[1].destinationSpecies).toBe("A");
  });

  it("escapes XML-special characters in names", () => {
    const xml = reconToRecPhyloXml(
      parseRecPhyloXML(`<recPhylo>
        <spTree><phylogeny rooted="true"><clade><name>A&amp;B&lt;C&gt;</name></clade></phylogeny></spTree>
        <recGeneTree><phylogeny rooted="true"><clade>
          <eventsRec><leaf speciesLocation="A&amp;B&lt;C&gt;" geneName='g"1'/></eventsRec>
        </clade></phylogeny></recGeneTree>
      </recPhylo>`),
    );
    const back = parseRecPhyloXML(xml);
    expect(back.species.byName.has('A&B<C>')).toBe(true);
    expect(back.geneTrees[0].nodes[0].endEvent.geneName).toBe('g"1');
    // The serialized form must be properly escaped, not raw.
    expect(xml).toContain("<name>A&amp;B&lt;C&gt;</name>");
  });

  it("lists the losses an NHX export would incur", () => {
    const recon = parseRecPhyloXML(RICH);
    const losses = nhxExportLosses(recon).join("\n");
    expect(losses).toMatch(/multiple transfer arrivals/);
    expect(losses).toMatch(/timeSlice/);
    expect(losses).toMatch(/confidence/);
    expect(losses).toMatch(/species branch length/);
    expect(losses).toMatch(/gene tree name/);
  });

  it("reports unsampled species-tree taxa as an NHX loss", () => {
    const recon = parseRecPhyloXML(`<recPhylo>
      <spTree><phylogeny rooted="true"><clade><name>R</name>
        <clade><name>A</name></clade>
        <clade><name>NeverSampled</name></clade>
      </clade></phylogeny></spTree>
      <recGeneTree><phylogeny rooted="true"><clade>
        <eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec>
      </clade></phylogeny></recGeneTree>
    </recPhylo>`);
    // Both R (root) and NeverSampled carry no gene node here.
    expect(nhxExportLosses(recon).join("\n")).toMatch(/2 species tree taxa/);
  });
});

/** Helper: export then re-parse (keeps the test bodies readable). */
function parseRecPhyloXmlFromExport(recon: ReturnType<typeof parseRecPhyloXML>) {
  return parseRecPhyloXML(reconToRecPhyloXml(recon));
}
