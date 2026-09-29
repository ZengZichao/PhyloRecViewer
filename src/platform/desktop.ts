/**
 * Desktop (Tauri) integration. Every function is a no-op-friendly wrapper that
 * touches Tauri APIs only when running inside the desktop shell; the web build
 * ignores them and falls back to standard browser file I/O.
 *
 * Security note: the open/save dialogs are run *by the Rust shell* here, not by
 * `@tauri-apps/plugin-dialog` in this window. That is deliberate: the Rust file
 * commands accept only paths a native dialog issued during this session, so a
 * script injected into the webview cannot aim the reader/writer at an arbitrary
 * file. Were the dialog to run here and only the read/write happen in Rust, the
 * path would still be attacker-supplied and the capability model
 * (`capabilities/default.json` grants no `fs:*` permission) would be moot. The
 * accepted consequence is that the list of accepted file extensions lives in
 * exactly one place — `OPEN_EXTENSIONS` in `src-tauri/src/lib.rs`.
 */

interface TauriWindow {
  __TAURI_INTERNALS__?: unknown;
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as TauriWindow).__TAURI_INTERNALS__ !== undefined
  );
}

/** A document's text together with the file name it came from, the shape the store keeps. */
export interface DesktopTextFile {
  name: string;
  text: string;
}

/** The shape the Rust `open_text_files` command answers with. */
interface RustOpenResult {
  files: { name: string; content: string }[];
  failed: string[];
}

/**
 * Result of a multi-select open.
 *
 * It IS the array of readable files, so callers can keep treating it as a plain
 * list (`many.length`, `openInNewTab(many)`); it additionally carries `failed`,
 * the names of the files the dialog returned but that could not be read
 * (oversized, non-UTF-8, or deleted between the dialog and the read).
 *
 * One unreadable file must not reject the whole batch: that would push the
 * caller back onto the browser picker and silently drop the N-1 files the user
 * just selected. This shape never rejects over a per-file error, so callers
 * MUST surface `failed` (e.g. through `openFailedToast`) rather than
 * pretending the batch opened cleanly.
 */
export interface DesktopOpenManyResult extends Array<DesktopTextFile> {
  failed: string[];
}

/**
 * Run the native open dialog in the Rust shell and read what the user picked.
 * `multiple` decides whether the picker accepts more than one file.
 */
async function openViaDialog(multiple: boolean): Promise<RustOpenResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<Partial<RustOpenResult> | null>("open_text_files", {
    multi: multiple,
  });
  return { files: res?.files ?? [], failed: res?.failed ?? [] };
}

/**
 * Open a native file picker and return the chosen file's name + text, or null
 * when the user cancels. Throws when a file WAS chosen but could not be read, so
 * the caller can say so rather than treating it as a clean cancel.
 */
export async function desktopOpenText(): Promise<DesktopTextFile | null> {
  const { files, failed } = await openViaDialog(false);
  const first = files[0];
  if (first) return { name: first.name, text: first.content };
  if (failed.length > 0) {
    throw new Error(`Could not open ${failed.join(", ")}`);
  }
  return null;
}

/**
 * Open a native picker that accepts several files (for batch import).
 *
 * A single unreadable file never rejects the batch: the readable files come back
 * in the array, the unreadable ones by name in `.failed`.
 */
export async function desktopOpenTextMany(): Promise<DesktopOpenManyResult> {
  const { files, failed } = await openViaDialog(true);
  const out = files.map((f) => ({
    name: f.name,
    text: f.content,
  })) as DesktopOpenManyResult;
  out.failed = failed;
  return out;
}

/**
 * Save text through a native save dialog run in the Rust shell; false means the
 * user cancelled. Dialog and atomic write (temp file + fsync + rename) form one
 * command, so a write can only ever target the path that dialog just issued.
 */
export async function desktopSaveText(
  defaultName: string,
  content: string,
  ext: string,
): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<boolean>("save_text_via_dialog", {
    defaultName,
    ext,
    contents: content,
  });
}

/**
 * Save binary data through a native save dialog run in the Rust shell; false
 * means cancelled. The same dialog + atomic-write round trip as
 * {@link desktopSaveText}.
 */
export async function desktopSaveBinary(
  defaultName: string,
  data: Uint8Array,
  ext: string,
): Promise<boolean> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<boolean>("save_binary_via_dialog", {
    defaultName,
    ext,
    // Tauri deserializes a `Vec<u8>` from a plain number array.
    data: Array.from(data),
  });
}

/** A file the operating system asked the app to open (double-click / "Open with"). */
export interface OpenedFile {
  name: string;
  content: string;
}

/**
 * Drain the files the OS handed over before the UI mounted (associated files
 * present at launch). The backend reads their contents, which keeps arbitrary
 * paths out of the fs scope. Files it could not read come back by name so the UI
 * can tell the user rather than ignoring them silently. The web build returns
 * {[], []}.
 */
export async function desktopTakePendingFiles(): Promise<{
  files: OpenedFile[];
  failed: string[];
}> {
  if (!isTauri()) return { files: [], failed: [] };
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<{ files: OpenedFile[]; failed: string[] }>("take_pending_files");
  } catch {
    return { files: [], failed: [] };
  }
}

/**
 * Subscribe to notifications about associated files that could not be opened
 * once the app is already running; returns the unsubscribe function.
 */
export async function onDesktopOpenFailed(
  cb: (names: string[]) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<string[]>("open-file-failed", (e) => cb(e.payload));
  } catch {
    return () => {};
  }
}

/**
 * Subscribe to files the OS hands over while the app is already running (macOS
 * delivers them through the `open-file` event); returns the unsubscribe
 * function.
 */
export async function onDesktopOpenFile(
  cb: (files: OpenedFile[]) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<OpenedFile[]>("open-file", (e) => cb(e.payload));
  } catch {
    return () => {};
  }
}
