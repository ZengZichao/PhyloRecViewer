import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { useStore } from "../state/store";
import { defaultLayoutOptions } from "../layout";
import { defaultRenderOptions } from "../render/options";
import { loadPrefs, savePrefs, setOnboarded } from "../state/prefs";
import type { ThemePref } from "../render/theme";
import { useFocusTrap } from "./hooks";

/**
 * Preferences dialog: theme, language, PNG scale, the "default view" applied to
 * every new document, and a reset — one discoverable surface holding them all,
 * persisted so theme/language/PNG carry over between sessions.
 */
export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, dialogRef);
  const themeId = useStore((s) => s.themeId);
  const setTheme = useStore((s) => s.setTheme);
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);
  const pngDpi = useStore((s) => s.pngDpi);
  const setPngDpi = useStore((s) => s.setPngDpi);
  const layoutOptions = useStore((s) => s.layoutOptions);
  const renderOptions = useStore((s) => s.renderOptions);
  const applyViewState = useStore((s) => s.applyViewState);
  const [hasDefault, setHasDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHasDefault(!!loadPrefs().defaultView);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const saveAsDefault = () => {
    const prefs = loadPrefs();
    savePrefs({
      ...prefs,
      defaultView: { layoutOptions, renderOptions },
    });
    setHasDefault(true);
  };

  const clearDefault = () => {
    const prefs = loadPrefs();
    savePrefs({ ...prefs, defaultView: null });
    setHasDefault(false);
  };

  const resetPrefs = () => {
    // Capture the current UI language first: the individual setters below each
    // do a load->modify->save on the fresh (post-removal) prefs, so without
    // this the locale (and any later field) would be silently dropped and the
    // reset would not keep the current UI language.
    const { locale } = loadPrefs();
    localStorage.removeItem("rpv.prefs");
    setTheme("system");
    setPngDpi(600);
    savePrefs({ ...loadPrefs(), locale });
    applyViewState({ layoutOptions: { ...defaultLayoutOptions }, renderOptions: { ...defaultRenderOptions }, resetHistory: false });
    setHasDefault(false);
  };

  const replayTour = () => {
    setOnboarded(false);
    onClose();
    // Re-open the onboarding via a microtask after the dialog closes.
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("rpv:replay-tour"));
    }, 0);
  };

  const themeOptions: { id: ThemePref; label: string }[] = [
    { id: "light", label: `${t.lightTheme} ☀` },
    { id: "dark", label: `${t.darkTheme} 🌙` },
    { id: "system", label: `${t.systemTheme} 🖥` },
  ];

  return (
    <div className="help-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t.prefsTitle}>
      <div className="help-card settings-card" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span className="sidebar-title">{t.prefsTitle}</span>
          <button className="panel-collapse" onClick={onClose} data-tooltip={t.collapse} aria-label={t.collapse}>
            ✕
          </button>
        </div>

        <h4>{t.theme}</h4>
        <div className="settings-row">
          {themeOptions.map((o) => (
            <button
              key={o.id}
              className={`btn ghost${themeId === o.id ? " active" : ""}`}
              onClick={() => setTheme(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <h4>{t.menuLanguage}</h4>
        <div className="settings-row">
          <button
            className={`btn ghost${locale === "zh" ? " active" : ""}`}
            onClick={() => setLocale("zh")}
          >
            中文
          </button>
          <button
            className={`btn ghost${locale === "en" ? " active" : ""}`}
            onClick={() => setLocale("en")}
          >
            English
          </button>
        </div>

        <h4>{t.pngResolution}</h4>
        <div className="settings-row">
          {[600, 1200, 2400, 4800].map((sc) => (
            <button
              key={sc}
              className={`btn ghost${pngDpi === sc ? " active" : ""}`}
              onClick={() => setPngDpi(sc)}
            >
              {sc}
            </button>
          ))}
        </div>

        <h4>{t.viewTour}</h4>
        <p className="settings-note">{t.helpTitle}</p>
        <div className="settings-row">
          <button className="btn" onClick={replayTour}>
            {t.viewTour}
          </button>
        </div>

        <h4>{t.defaultView}</h4>
        <p className="settings-note">
          {hasDefault
            ? t.saveDefaultViewTitle
            : `${t.saveDefaultViewTitle}（${t.defaultView}）`}
        </p>
        <div className="settings-row">
          <button className="btn" onClick={saveAsDefault}>
            {t.saveDefaultView}
          </button>
          {hasDefault && (
            <button className="btn ghost" onClick={clearDefault}>
              {t.clearDefaultView}
            </button>
          )}
        </div>

        <div className="settings-divider" />
        <div className="settings-row">
          <button className="btn ghost" onClick={resetPrefs}>
            {t.restorePrefs}
          </button>
        </div>
      </div>
    </div>
  );
}
