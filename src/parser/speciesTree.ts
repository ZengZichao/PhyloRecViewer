/**
 * Standalone species-tree reader.
 *
 * recPhyloXML carries the species tree inside the file, and well-annotated NHX
 * reconstructs one from S= tags - but real-world NHX often annotates only the
 * leaves, and the true species tree is provided as a separate Newick file. This
 * reader turns such a file into the model's SpeciesTree so the NHX reader can
 * use it instead of inventing a topology from leaf annotations.
 */
import type { SpeciesNode, SpeciesTree } from "../model/types";
import { parseNewick, NewickParseError } from "./newick";

export class SpeciesTreeParseError extends Error {}

/** Parse a Newick text into a SpeciesTree (names on leaves AND internal clades). */
export function parseSpeciesTree(text: string, nsSeq = 0): SpeciesTree {
  let forest;
  try {
    forest = parseNewick(text);
  } catch (e) {
    if (e instanceof NewickParseError) {
      throw new SpeciesTreeParseError(`The species tree is not valid Newick: ${e.message}`);
    }
    throw e;
  }
  const roots = forest.filter((r) => r.children.length > 0 || r.name);
  if (roots.length === 0) {
    throw new SpeciesTreeParseError("The species tree file contains no tree.");
  }
  const root = roots[0];
  const byName = new Map<string, SpeciesNode>();
  const nodes: SpeciesNode[] = [];
  let counter = 0;

  const build = (nd: (typeof forest)[number], parent: SpeciesNode | null, depth: number): SpeciesNode => {
    if (depth > 1000) {
      throw new SpeciesTreeParseError("The species tree is nested too deep.");
    }
    const name = nd.name || `␟auto_${counter}`;
    const node: SpeciesNode = {
      id: `sx${nsSeq}_${counter++}`,
      name,
      children: [],
      parent,
      depth,
      branchLength:
        nd.length != null && Number.isFinite(nd.length) ? nd.length : undefined,
    };
    if (!byName.has(name)) byName.set(name, node);
    nodes.push(node);
    for (const c of nd.children) node.children.push(build(c, node, depth + 1));
    return node;
  };
  const rootSpecies = build(root, null, 0);
  return { root: rootSpecies, byName, nodes };
}
