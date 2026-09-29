import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { setOnboarded } from "../state/prefs";
import { useFocusTrap } from "./hooks";

/**
 * First-run spotlight tour. Walks a brand-new user through the five core
 * surfaces (controls / analysis / canvas / nested-compare / export) with a
 * highlight frame around the target element and a progress card. Shown once;
 * skipping or completing writes the "rpv.onboarded" flag. Replayable from
 * Preferences.
 */
export interface TourStep {
  /** CSS selector of the element to spotlight. */
  selector: string;
  title: string;
  body: string;
}

const DEFAULT_SELECTORS = [
  ".sidebar",
  ".right-panel",
  ".canvas",
  "#menu-file",
  "#menu-export",
];

export function Onboarding({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const raf = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(visible, dialogRef);

  const steps = useCallback((): TourStep[] => {
    const titles = [
      t.tourStep1Title, t.tourStep2Title, t.tourStep3Title, t.tourStep4Title, t.tourStep5Title,
    ];
    const bodies = [
      t.tourStep1Body, t.tourStep2Body, t.tourStep3Body, t.tourStep4Body, t.tourStep5Body,
    ];
    return DEFAULT_SELECTORS.map((sel, i) => ({
      selector: sel,
      title: titles[i],
      body: bodies[i],
    }));
  }, [t]);

  const stepsList = steps();
  const finish = useCallback(() => {
    setOnboarded(true);
    onClose();
  }, [onClose]);
  const next = useCallback(() => {
    // finish() updates the parent, so calling it from inside the setStep
    // updater scheduled a state change during render. Decide from the
    // current step instead.
    if (step >= stepsList.length - 1) {
      finish();
      return;
    }
    setStep(step + 1);
  }, [step, stepsList.length, finish]);

  // Measure the spotlight target (re-measured on resize / step change).
  const measure = useCallback(() => {
    const el = document.querySelector(stepsList[step]?.selector ?? "");
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
  }, [stepsList, step]);

  useEffect(() => {
    if (!visible) return;
    measure();
    const onResize = () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [visible, measure]);

  // Keyboard: Esc = skip, arrows = navigate. Bound with capture so the canvas
  // shortcuts do not steal them.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [visible, finish, next]);

  if (!visible) return null;
  const isLast = step >= stepsList.length - 1;

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-label={t.helpTitle}>
      {box && (
        <div
          className="onboard-spotlight"
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
      <div className="onboard-card" ref={dialogRef}>
        <div className="onboard-step">
          {step + 1} / {stepsList.length}
        </div>
        <h3>{stepsList[step].title}</h3>
        <p>{stepsList[step].body}</p>
        <div className="onboard-dots" aria-hidden="true">
          {stepsList.map((_st, i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <div className="onboard-actions">
          <button className="btn ghost" onClick={finish}>
            {t.onboardSkip}
          </button>
          <span className="onboard-spacer" />
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              {t.onboardPrev}
            </button>
          )}
          <button className="btn primary" onClick={next}>
            {isLast ? t.onboardDone : t.onboardNext}
          </button>
        </div>
      </div>
    </div>
  );
}
