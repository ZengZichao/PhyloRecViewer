import { useMemo, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { APP_NAME, APP_VERSION } from "../version";
import type { GeneNode } from "../model/types";

/**
 * A dockable node inspector: click a gene glyph or a transfer arc and this
 * card shows the scientific detail a reviewer needs - every event with its
 * species, time slice, confidence, the transfer's donor and recipient, branch
 * length, family, parent/children counts and the user annotation. The hover
 * tooltip stays a lightweight preview; this is the "read one event properly"
 * surface the app lacked.
 */
export function NodeInspector() {
  const t = useT();
  const inspector = useStore((s) => s.inspector);
  const setInspector = useStore((s) => s.setInspector);
  const recon = useStore((s) => s.recon);
  const nested = useStore((s) => s.nested);
  const compare = useStore((s) => s.compare);
  const annotations = useStore((s) => s.annotations);
  const setAnnotating = useStore((s) => s.setAnnotating);
  const locateGene = useStore((s) => s.locateGene);
  const [pinned, setPinned] = useState(false);

  const info = useMemo(() => {
    if (!inspector) return null;
    const pools: { label: string; recon: typeof recon }[] = [
      { label: t.scopePrimary, recon },
      { label: t.paneSymbiontHost, recon: nested },
      { label: "B", recon: compare },
    ];
    for (const pool of pools) {
      if (!pool.recon) continue;
      if (inspector.kind === "gene") {
        for (const tree of pool.recon.geneTrees) {
          const g = tree.nodes.find((n) => n.id === inspector.id);
          if (g) return { pane: pool.label, gene: g, family: tree.name ?? `#${tree.index + 1}`, transfer: null as null | { donor: string; recipient: string } };
        }
      } else {
        // Transfer ids carry the arrival node id; find the owning node.
        const nodeId = inspector.id.replace(/^tr-/, "");
        for (const tree of pool.recon.geneTrees) {
          const g = tree.nodes.find((n) => n.id === nodeId);
          if (g) {
            const arr = g.events.find((e) => e.type === "transferBack");
            if (arr) {
              return {
                pane: pool.label,
                gene: g,
                family: tree.name ?? `#${tree.index + 1}`,
                transfer: {
                  donor: arr.speciesLocation ?? g.parent?.speciesId ?? "?",
                  recipient: arr.destinationSpecies ?? g.speciesId ?? "?",
                },
              };
            }
          }
        }
      }
    }
    return null;
  }, [inspector, recon, nested, compare, t]);

  if (!inspector || !info) return null;
  const g: GeneNode = info.gene;
  const note = annotations[g.id];

  const rows: [string, string][] = [];
  rows.push([t.inspSpecies, g.speciesId || g.endEvent.speciesLocation || g.endEvent.destinationSpecies || t.inspNone]);
  rows.push([t.inspFamily, info.family]);
  if (info.transfer) {
    rows.push([t.inspDonor, info.transfer.donor]);
    rows.push([t.inspRecipient, info.transfer.recipient]);
  }
  if (g.endEvent.timeSlice != null) rows.push([t.inspTimeSlice, String(g.endEvent.timeSlice)]);
  if (g.endEvent.confidence != null) rows.push([t.inspConfidence, String(g.endEvent.confidence)]);
  else if (g.support) rows.push([t.inspSupport, `${g.support.value}${g.support.type ? ` (${g.support.type})` : ""}`]);
  for (const e of g.events) {
    if (e.type === "transferBack") {
      rows.push([
        t.event.transferBack,
        `${e.speciesLocation ?? "?"} → ${e.destinationSpecies ?? "?"}` +
          (e.timeSlice != null ? ` · ${t.inspTimeSlice} ${e.timeSlice}` : "") +
          (e.confidence != null ? ` · ${e.confidence}` : ""),
      ]);
    }
  }
  if (g.branchLength != null) rows.push([t.inspBranch, String(g.branchLength)]);
  rows.push([t.inspParent, g.parent ? `${g.parent.name || g.parent.endEvent.type} (${g.parent.endEvent.type})` : t.inspNone]);
  rows.push([t.inspChildren, String(g.children.length)]);

  const copyDetails = () => {
    const text = [
      `${APP_NAME} ${APP_VERSION} — ${t.inspectorTitle}`,
      `id: ${g.id}`,
      ...rows.map(([k, v]) => `${k}: ${v}`),
      ...(note ? [`${t.inspAnnotation}: ${note.text}`] : []),
    ].join("\n");
    void navigator.clipboard?.writeText(text);
  };

  return (
    <div className="node-inspector" role="complementary" aria-label={t.inspectorTitle}>
      <div className="ni-head">
        <strong>{g.name || g.endEvent.geneName || g.id}</strong>
        <span className="ni-event">{t.event[g.endEvent.type]}</span>
        <span className="ni-pane">{info.pane}</span>
        <span className="ni-spacer" />
        <button
          className={pinned ? "active" : ""}
          aria-pressed={pinned}
          aria-label={t.inspLocate}
          title={pinned ? t.inspLocate : t.inspLocate}
          onClick={() => setPinned((v) => !v)}
        >
          📌
        </button>
        <button aria-label={t.close} onClick={() => setInspector(null)}>
          ✕
        </button>
      </div>
      <dl className="ni-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="ni-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="ni-note">
          <strong>{t.inspAnnotation}:</strong> {note.text}
        </p>
      )}
      <div className="ni-actions">
        <button className="btn ghost" onClick={() => locateGene(g.id)}>
          {t.inspLocate}
        </button>
        <button
          className="btn ghost"
          onClick={() => setAnnotating({ id: g.id, name: g.name || g.endEvent.geneName || g.id })}
        >
          {t.annoTitle}
        </button>
        <button className="btn ghost" onClick={copyDetails}>
          {t.inspCopy}
        </button>
      </div>
    </div>
  );
}
