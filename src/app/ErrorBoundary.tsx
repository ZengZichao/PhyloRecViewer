import { Component, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "../state/store";
import { sessionDataOfStore } from "../state/autosave";
import { serializeSession } from "../session";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Escape hatch: serialize whatever document state survived the crash into a
 * downloadable session file so a render-time exception never silently discards
 * the user's manual work (swaps, collapses, annotations, colors).
 */
function downloadRecoverySession(): void {
  try {
    // The same builder the menu's "Save session" uses, so recovery carries the
    // other tabs, the merged source files and the search/filter state instead
    // of quietly reducing the workspace to its first document.
    const data = sessionDataOfStore();
    if (!data) return;
    const blob = new Blob([serializeSession(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recovered.rpvsession.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // best-effort recovery; nothing more we can safely do here
  }
}

/**
 * Root error boundary. Without it, any exception thrown while rendering the
 * canvas / layout / analysis unmounts the whole React tree and leaves a blank
 * window with no way to recover — on desktop there is no reload shortcut. This
 * catches the crash, shows a recoverable panel, and offers a session export.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local diagnosis only (no telemetry / network for this offline tool).
    console.error("PhyloRecViewer crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const zh = useStore.getState().locale === "zh";
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div className="state-panel error" role="alert">
          <h2>{zh ? "出错了" : "Something went wrong"}</h2>
          <p>{error.message}</p>
          <p className="muted">
            {zh
              ? "你的工作尚未丢失，可先导出当前会话再重新加载。"
              : "Your work is not lost — export the current session, then reload."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
            <button className="btn primary" onClick={downloadRecoverySession}>
              {zh ? "导出当前会话" : "Export current session"}
            </button>
            <button className="btn" onClick={() => location.reload()}>
              {zh ? "重新加载" : "Reload"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
