import { useEffect, useRef, useState } from "react";
import { intlTag, useT } from "../i18n";
import { PNG_DPI_CHOICES } from "../export/exporters";
import { useStore } from "../state/store";
import { defaultLayoutOptions } from "../layout";
import { defaultRenderOptions } from "../render/options";
import { loadPrefs, savePrefs, setOnboarded } from "../state/prefs";
import { hasUnrecoveredSnapshot, unrecoveredSnapshotText, clearAutosaveSnapshot } from "../state/autosave";
import type { ThemePref } from "../render/theme";
import { useFocusTrap, usePresence } from "./hooks";
import { Icon } from "./Icon";

/**
 * Preferences.
 *
 * Layout contract: one setting per row, name on the left, control on the
 * right, every row in the same two-column grid so the eye scans two clean
 * edges. Rows are grouped under short headings; the gap between groups is
 * larger than the gap inside one, so the page reads as sections rather than
 * as an undifferentiated list. There is no outer card frame: the dialog is a
 * borderless surface lifted by a soft shadow, and the page's own whitespace
 * does the grouping.
 *
 * Reset lives alone at the bottom: destructive actions do not sit next to the
 * settings a user opens the dialog to change.
 *
 * Controls follow what each choice is: a segmented control for a closed set of
 * two or three options (theme, language, PNG scale), and one button for a
 * one-shot action (save defaults, clear data, replay the tour) — no row asks
 * the user to invent a value.
 */
export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const presence = usePresence(open);
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
  const autosaveAt = useStore((s) => s.autosaveAt);
  const autosaveFailed = useStore((s) => s.autosaveFailed);
  const showToast = useStore((s) => s.showToast);
  const [hasDefault, setHasDefault] = useState(false);
  const [quarantined, setQuarantined] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHasDefault(!!loadPrefs().defaultView);
    setQuarantined(hasUnrecoveredSnapshot());
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

  if (!presence.mounted) return null;

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
    setPngDpi(300);
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
    { id: "light", label: t.lightTheme },
    { id: "dark", label: t.darkTheme },
    { id: "system", label: t.systemTheme },
  ];

  const autosaveLabel = autosaveFailed
    ? t.autosaveFailedLabel
    : autosaveAt
      ? t.autosaveOn.replace(
          "{time}",
          new Date(autosaveAt).toLocaleString(intlTag[locale], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        )
      : t.autosaveNone;

  return (
    <div
      className="help-overlay"
      data-state={presence.phase}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.prefsTitle}
    >
      <div
        className="help-card settings-card"
        data-state={presence.phase}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h2 className="settings-title">{t.prefsTitle}</h2>
          <button className="panel-collapse" onClick={onClose} data-tooltip={t.close} aria-label={t.close}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="settings-groups stagger-children">
          <section className="settings-group">
            <h3 className="settings-group-title">{t.prefsGroupAppearance}</h3>
            <div className="settings-field">
              <span className="settings-label">{t.theme}</span>
              <Segmented groupLabel={t.theme} value={themeId} onChange={setTheme} options={themeOptions} />
            </div>
            <div className="settings-field">
              <span className="settings-label">{t.menuLanguage}</span>
              <Segmented
                groupLabel={t.menuLanguage}
                value={locale}
                onChange={setLocale}
                options={[
                  { id: "zh", label: t.langNameZh },
                  { id: "en", label: t.langNameEn },
                ]}
              />
            </div>
          </section>

          <section className="settings-group">
            <h3 className="settings-group-title">{t.prefsGroupExport}</h3>
            <div className="settings-field">
              <span className="settings-label">{t.pngResolution}</span>
              <Segmented
                groupLabel={t.pngResolution}
                className="segmented-grid"
                value={String(pngDpi)}
                onChange={(v) => setPngDpi(Number(v))}
                options={PNG_DPI_CHOICES.map((sc) => ({
                  id: String(sc),
                  // The row label already carries the unit: six cells of "300 DPI"
                  // wrapped to two lines each and made the picker the tallest thing
                  // in the dialog.
                  label: String(sc),
                  title: sc === 192 ? t.pngScreen : `${sc} DPI`,
                }))}
              />
            </div>
          </section>

          <section className="settings-group">
            <h3 className="settings-group-title">{t.prefsGroupWorkspace}</h3>
            <div className="settings-field">
              <span className="settings-label">{t.defaultView}</span>
              <div className="settings-actions">
                {hasDefault && (
                  <button className="btn ghost" onClick={clearDefault}>
                    {t.clearDefaultView}
                  </button>
                )}
                <button className="btn ghost" onClick={saveAsDefault}>
                  {t.saveDefaultView}
                </button>
              </div>
            </div>
            <div className="settings-field">
              <span className="settings-label">{t.autosaveSection}</span>
              <div className="settings-actions">
                <span className="settings-value">{autosaveLabel}</span>
              </div>
            </div>
            {quarantined && (
              <div className="settings-field">
                <span className="settings-label">{t.recoverySection}</span>
                <div className="settings-actions">
                  <span className="settings-value">{t.recoveryFound}</span>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      const text = unrecoveredSnapshotText();
                      if (!text) return;
                      const blob = new Blob([text], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "recovered.rpvsession.json";
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    {t.recoveryExport}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="settings-group">
            <h3 className="settings-group-title">{t.prefsGroupHelp}</h3>
            <div className="settings-field">
              <span className="settings-label">{t.viewTour}</span>
              <div className="settings-actions">
                <button className="btn ghost" onClick={replayTour}>
                  {t.replayTour}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Destructive actions live alone at the bottom of the page. */}
        <section className="settings-group settings-group-danger">
          <div className="settings-field">
            <h3 className="settings-group-title">{t.prefsGroupReset}</h3>
            <div className="settings-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  if (!window.confirm(t.clearAutosaveConfirm)) return;
                  clearAutosaveSnapshot();
                  // The status line reads the store's snapshot timestamp, which
                  // clearing storage does not reset on its own: the row kept
                  // claiming "Last saved …" for a snapshot that was gone.
                  useStore.setState({ autosaveAt: null, autosaveFailed: false });
                  showToast(t.clearAutosaveDone, "success");
                }}
              >
                {t.clearAutosave}
              </button>
              <button className="btn ghost settings-reset" onClick={resetPrefs}>
                {t.restorePrefs}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Segmented choice: one joined track, one selected segment. The selected
 * segment is a tinted step of the same scale rather than a filled block, so a
 * settings row never reads as a row of competing buttons.
 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  groupLabel,
  className = "",
}: {
  value: T;
  options: { id: T; label: string; title?: string }[];
  onChange: (id: T) => void;
  groupLabel: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`.trim()} role="group" aria-label={groupLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? "active" : ""}
          aria-pressed={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}