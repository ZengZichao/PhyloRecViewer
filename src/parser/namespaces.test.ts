import { describe, expect, it } from "vitest";
import { parseRecPhyloXML } from "./recphyloxml";
import { detectFormat } from "./formats";

/**
 * The official schema (recPhyloXML.xsd) is namespace-qualified: it declares
 * targetNamespace="http://www.recg.org" with elementFormDefault="qualified", so
 * a conformant document written by a schema-aware tool carries a default or
 * prefixed namespace. The reader must accept it rather than report a missing
 * root element.
 */
const BODY = `<spTree><phylogeny rooted="true"><clade><name>R</name>
    <clade><name>A</name></clade><clade><name>B</name></clade>
  </clade></phylogeny></spTree>
  <recGeneTree><phylogeny rooted="true"><clade><name>g</name>
    <eventsRec><leaf speciesLocation="A" geneName="g"/></eventsRec>
  </clade></phylogeny></recGeneTree>`;

describe("namespace-qualified recPhyloXML", () => {
  it("parses a document with a default namespace", () => {
    const recon = parseRecPhyloXML(
      `<recPhylo xmlns="http://www.recg.org">${BODY}</recPhylo>`,
    );
    expect(recon.species.nodes.map((n) => n.name)).toEqual(["R", "A", "B"]);
    expect(recon.geneTrees).toHaveLength(1);
    expect(recon.geneTrees[0].nodes[0].speciesId).toBe("A");
  });

  it("parses a document with a prefixed namespace", () => {
    const recon = parseRecPhyloXML(
      `<rec:recPhylo xmlns:rec="http://www.recg.org">${BODY.replace(/<\//g, "</rec:").replace(/<spTree/, "<rec:spTree").replace(/<phylogeny/g, "<rec:phylogeny").replace(/<clade/g, "<rec:clade").replace(/<name/g, "<rec:name").replace(/<recGeneTree/, "<rec:recGeneTree").replace(/<eventsRec/, "<rec:eventsRec").replace(/<leaf/, "<rec:leaf")}</rec:recPhylo>`,
    );
    expect(recon.geneTrees).toHaveLength(1);
    expect(recon.species.root.name).toBe("R");
  });

  it("still detects and parses the plain no-namespace form most tools emit", () => {
    expect(detectFormat(`<recPhylo>${BODY}</recPhylo>`)).toBe("recphyloxml");
    expect(parseRecPhyloXML(`<recPhylo>${BODY}</recPhylo>`).geneTrees).toHaveLength(1);
  });
});
