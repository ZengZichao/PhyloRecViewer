/**
 * Content-derived, stable node identifiers.
 *
 * Node ids are the key for annotations, collapse state and label overrides that
 * are persisted across sessions (see state/autosave.ts). They MUST therefore be
 * reproducible: re-parsing the same document yields the same ids, and editing an
 * unrelated part of the tree does not renumber the rest.
 *
 * An id is derived from a per-document namespace, the node's own annotation plus
 * the (sorted) signatures of its descendant subtrees. Invariants:
 *
 *  1. Determinism: the same (namespace, tree content) always yields the same
 *     ids - no randomness, no clock.
 *  2. Sibling-order invariance: child signatures are SORTED before they enter
 *     the parent's base string, so an upstream tool re-emitting the same tree
 *     with swapped children keeps every id.
 *  3. Local change confinement: a node's id depends only on its own subtree, so
 *     renaming a leaf renumbers that leaf and its ancestors - nodes in unrelated
 *     subtrees keep their ids.
 *  4. Cross-document uniqueness: ids derived from pure content collide whenever
 *     two different files hold the same gene tree, and that silently overwrites
 *     layout coordinates (Positions is keyed by id) in merged documents and leaks
 *     collapse state between compare panels. The `ns` parameter folds a
 *     per-document namespace (see documentNamespace) into every base string, so
 *     two different source files never share node ids.
 *
 * Exact duplicate subtrees (two identical copies of the same event) are
 * disambiguated by an occurrence counter in a fixed traversal order, which is
 * itself stable across re-parses of the same file.
 */

/** Deterministic FNV-1a 32-bit hash, rendered base36. */
export function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // The "n" prefix keeps ids URL/SVG-safe and stops a leading digit making one
  // look like a numeric node.
  return "n" + (h >>> 0).toString(36);
}

/**
 * Deterministic per-document id namespace. Two files with identical gene-tree
 * content still get disjoint node ids, while re-parsing the same
 * (name, content) pair - on a session restore, for instance - reproduces the same
 * namespace. No Math.random / Date.now: the value is a pure function of the
 * inputs.
 */
export function documentNamespace(name: string, content: string): string {
  return hashStr(`doc\u0000${name}\u0000${content.length}\u0000${content}`);
}

interface GeneLike {
  id: string;
  name: string;
  speciesId: string;
  treeIndex: number;
  endEvent: { type: string; geneName?: string };
  children: GeneLike[];
}

/**
 * Rewrite gene node ids so they are stable across re-parses. Traversal is
 * postorder, so a parent's signature incorporates its children's. The `nodes`
 * array order is left untouched (ids are mutated in place).
 *
 * `ns` folds the document namespace into every base string (see invariant 4
 * above); leave it out only for a throwaway parse that no other document can
 * collide with. A caller that changes `treeIndex` after ids are assigned
 * (parseMerged) MUST re-run this function afterwards, so the ids match the final
 * indices.
 */
export function assignStableGeneIds(roots: GeneLike[], ns = ""): void {
  const counts = new Map<string, number>();
  const issued = new Map<string, string>();
  const visit = (g: GeneLike): string => {
    const childSigs = g.children.map(visit);
    // SORTED: a parent's id never depends on the order of its children (invariant 2).
    childSigs.sort();
    const base =
      `${ns}|g:${g.treeIndex}:${g.endEvent.type}:${g.speciesId}:${g.name}:` +
      `${g.endEvent.geneName ?? ""}:(${childSigs.join(",")})`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const h = hashStr(base);
    let id = seen > 0 ? `${h}_d${seen}` : h;
    // `_d` only separates identical bases. Two DIFFERENT bases can still hash to
    // the same 32-bit value, and Positions / annotations are keyed by id, so a
    // collision silently overwrites another node's geometry - at the 23,685-node
    // scale of the largest benchmark sweep under data/, the birthday bound makes
    // that likely rather than theoretical. Probe until the id is free.
    for (let probe = 1; issued.has(id) && issued.get(id) !== base; probe++) {
      id = `${h}_c${probe}${seen > 0 ? `_d${seen}` : ""}`;
    }
    issued.set(id, base);
    g.id = id;
    return h;
  };
  for (const r of roots) visit(r);
}

interface SpeciesLike {
  id: string;
  name: string;
  children: SpeciesLike[];
}

/**
 * Rewrite species node ids so they are stable across re-parses. `ns` is the same
 * document namespace used for that file's gene ids (see assignStableGeneIds).
 */
export function assignStableSpeciesIds(root: SpeciesLike | null, ns = ""): void {
  if (!root) return;
  const counts = new Map<string, number>();
  const issued = new Map<string, string>();
  const visit = (s: SpeciesLike): string => {
    const childSigs = s.children.map(visit);
    childSigs.sort();
    const base = `${ns}|s:${s.name}(${childSigs.join(",")})`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const h = hashStr(base);
    let id = seen > 0 ? `${h}_d${seen}` : h;
    // The same collision probe as assignStableGeneIds: probe until the id is free.
    for (let probe = 1; issued.has(id) && issued.get(id) !== base; probe++) {
      id = `${h}_c${probe}${seen > 0 ? `_d${seen}` : ""}`;
    }
    issued.set(id, base);
    s.id = id;
    return h;
  };
  visit(root);
}
