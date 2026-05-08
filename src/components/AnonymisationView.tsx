import { useState, useMemo, useRef } from "react";
import "./AnonymisationView.css";

export interface MaskSpan {
  id: string;
  start: number;
  end: number;
  placeholder: string;
  original: string;
  category: string;
}

interface Props {
  originalText: string;
  initialSpans: MaskSpan[];
  onConfirm: (anonymizedText: string, substitutionMap: Record<string, string>) => void;
}

type Segment =
  | { type: "text"; content: string; start: number }
  | { type: "mask"; span: MaskSpan };

function buildSegments(text: string, activeSpans: MaskSpan[]): Segment[] {
  const segments: Segment[] = [];
  let pos = 0;
  for (const span of activeSpans) {
    if (pos < span.start) {
      segments.push({ type: "text", content: text.slice(pos, span.start), start: pos });
    }
    segments.push({ type: "mask", span });
    pos = span.end;
  }
  if (pos < text.length) {
    segments.push({ type: "text", content: text.slice(pos), start: pos });
  }
  return segments;
}

export function AnonymisationView({ originalText, initialSpans, onConfirm }: Props) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [extraSpans, setExtraSpans] = useState<MaskSpan[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [addError, setAddError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const extraCounter = useRef(0);

  const allSpans = useMemo<MaskSpan[]>(() => {
    const merged = [...initialSpans, ...extraSpans]
      .filter((s) => !removedIds.has(s.id))
      .sort((a, b) => a.start - b.start);
    const result: MaskSpan[] = [];
    let lastEnd = -1;
    for (const s of merged) {
      if (s.start >= lastEnd) {
        result.push(s);
        lastEnd = s.end;
      }
    }
    return result;
  }, [initialSpans, extraSpans, removedIds]);

  const { segments, anonymizedText, activeSubMap } = useMemo(() => {
    const segs = buildSegments(originalText, allSpans);
    let anon = "";
    const subMap: Record<string, string> = {};
    for (const seg of segs) {
      if (seg.type === "text") anon += seg.content;
      else {
        anon += seg.span.placeholder;
        subMap[seg.span.placeholder] = seg.span.original;
      }
    }
    return { segments: segs, anonymizedText: anon, activeSubMap: subMap };
  }, [originalText, allSpans]);

  function removeMask(id: string) {
    setRemovedIds((prev) => new Set([...prev, id]));
    setConfirmed(false);
  }

  function restoreMask(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setConfirmed(false);
  }

  function handleAddMask() {
    const query = addQuery.trim();
    if (!query) return;
    const lower = query.toLowerCase();
    const newSpans: MaskSpan[] = [];
    let idx = 0;
    while (true) {
      const pos = originalText.toLowerCase().indexOf(lower, idx);
      if (pos === -1) break;
      extraCounter.current += 1;
      newSpans.push({
        id: `extra_${extraCounter.current}`,
        start: pos,
        end: pos + query.length,
        placeholder: `[NOM_${extraCounter.current}]`,
        original: originalText.slice(pos, pos + query.length),
        category: "manuel",
      });
      idx = pos + query.length;
    }
    if (newSpans.length === 0) {
      setAddError(`"${query}" introuvable dans le texte.`);
      return;
    }
    setExtraSpans((prev) => [...prev, ...newSpans]);
    setAddQuery("");
    setAddError("");
    setConfirmed(false);
  }

  const removedSpans = [...initialSpans, ...extraSpans].filter((s) => removedIds.has(s.id));

  return (
    <div className="anon-view">
      <div className="anon-text-container">
        <p className="anon-hint">
          Cliquez sur un masque <span className="mask-example">[NOM_1]</span> pour le retirer si c'est une erreur.
        </p>
        <div className="anon-text">
          {segments.map((seg, i) => {
            if (seg.type === "text") {
              return <span key={i}>{seg.content}</span>;
            }
            return (
              <button
                key={i}
                className={`mask-tag mask-${seg.span.category}`}
                onClick={() => removeMask(seg.span.id)}
                title={`Retirer ce masque (valeur : "${seg.span.original}")`}
              >
                {seg.span.placeholder}
                <span className="mask-x">×</span>
              </button>
            );
          })}
        </div>
      </div>

      {removedSpans.length > 0 && (
        <div className="removed-list">
          <p className="removed-title">Masques retirés :</p>
          {removedSpans.map((s) => (
            <button key={s.id} className="removed-item" onClick={() => restoreMask(s.id)}>
              {s.placeholder} → <em>{s.original}</em> <span className="restore-hint">↩ restaurer</span>
            </button>
          ))}
        </div>
      )}

      <div className="add-mask-row">
        <input
          className="add-mask-input"
          type="text"
          placeholder="Mot à masquer manuellement…"
          value={addQuery}
          onChange={(e) => { setAddQuery(e.target.value); setAddError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleAddMask()}
        />
        <button className="btn-add-mask" onClick={handleAddMask} disabled={!addQuery.trim()}>
          + Masquer
        </button>
      </div>
      {addError && <p className="add-mask-error">{addError}</p>}

      <div className="anon-footer">
        <label className="confirm-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          J'ai relu et vérifié l'anonymisation
        </label>
        <button
          className="btn-continue"
          disabled={!confirmed}
          onClick={() => onConfirm(anonymizedText, activeSubMap)}
        >
          Continuer → Génération
        </button>
      </div>
    </div>
  );
}
