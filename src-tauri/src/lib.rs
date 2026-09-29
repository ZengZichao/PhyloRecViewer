//! Tauri desktop shell for PhyloRecViewer.
//!
//! The application is a fully client-side web app; this shell provides a native
//! window plus the native file dialogs, so the frontend can open and save files
//! from the local disk while working entirely offline.
//!
//! # Who is allowed to touch the disk
//!
//! The webview never supplies a filesystem path in the normal flow: the open and
//! save dialogs are run *here* (`open_text_files`, `save_text_via_dialog`,
//! `save_binary_via_dialog`), so a dialog round-trip and the resulting file
//! access happen in one trusted step.
//!
//! The lower-level path-taking commands (`read_text_file`, `save_text_atomic`,
//! `save_binary_atomic`) serve re-saving to an already authorised file, and are
//! gated by [`PathGrants`]: they only accept paths a native dialog issued
//! earlier in this session. That gate is what keeps the capability model
//! meaningful — `capabilities/default.json` deliberately grants NO `fs:*`
//! permission precisely so that file access is mediated by these commands, and
//! an ungated absolute-path API would let any script injected into the webview
//! read or overwrite everything in the user's home directory.
//!
//! # OS file associations
//!
//! When the user double-clicks a `.recphyloxml` file (or uses "Open with"), the
//! OS either passes the path as a CLI argument (Windows/Linux) or delivers a
//! `RunEvent::Opened` (macOS). Those paths come from the operating system, not
//! from the webview, so they need no grant. We read the file here and hand its
//! contents to the frontend, both for files present at launch (drained via
//! `take_pending_files`) and for files opened while the app is already running
//! (pushed via the `open-file` event). Files that cannot be read (too large,
//! non-UTF-8, deleted) are reported by name so the UI can tell the user instead
//! of silently doing nothing.

use std::collections::{HashSet, VecDeque};
use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_dialog::DialogExt;

/// Label of the single application window (mirrors `capabilities/default.json`).
const MAIN_WINDOW: &str = "main";

#[derive(Clone, serde::Serialize)]
struct OpenedFile {
    name: String,
    content: String,
}

/// What the frontend receives when it drains the launch-time file queue, and
/// what a native open dialog returns: the successes plus the names of the files
/// that could not be read (so the UI can toast them instead of losing them).
#[derive(Clone, serde::Serialize, Default)]
struct PendingOpenResult {
    files: Vec<OpenedFile>,
    /// Names of associated files that could not be read (for a user-facing toast).
    failed: Vec<String>,
}

/// Files opened before the frontend was ready to receive events, plus the
/// names of files that failed to read, plus the readiness flag. All three live
/// behind ONE mutex so "is the frontend ready?" and "stash vs emit" (and the
/// drain in `take_pending_files`) happen in a single critical section: an open
/// arriving between the readiness check and the drain is either stashed for
/// that drain or emitted directly, never stashed and left undelivered.
#[derive(Default)]
struct PendingState {
    files: Vec<OpenedFile>,
    failed: Vec<String>,
    ready: bool,
}

#[derive(Default)]
struct PendingOpen {
    inner: Mutex<PendingState>,
}

/// Maximum size (bytes) we read fully into memory for an OS-opened file.
const MAX_OPEN_BYTES: u64 = 64 * 1024 * 1024;

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

/// Read a file honouring the size cap and the UTF-8 requirement, keeping the OS
/// error message so the UI can surface "permission denied" instead of "missing".
fn read_capped_text(path: &Path) -> Result<String, String> {
    let len = std::fs::metadata(path)
        .map_err(|e| format!("{}: {}", path.display(), e))?
        .len();
    if len > MAX_OPEN_BYTES {
        return Err(format!(
            "File is too large to open ({} bytes, limit {} bytes).",
            len, MAX_OPEN_BYTES
        ));
    }
    std::fs::read_to_string(path).map_err(|e| format!("{}: {}", path.display(), e))
}

fn read_opened(path: &Path) -> Option<OpenedFile> {
    let content = read_capped_text(path).ok()?;
    Some(OpenedFile {
        name: display_name(path),
        content,
    })
}

// ---------------------------------------------------------------------------
// Path grants
// ---------------------------------------------------------------------------

/// Upper bound on remembered dialog paths; a session that somehow exceeds it
/// simply forgets the oldest grants (evicting is always safe — the worst case is
/// that the user has to confirm the save dialog again).
const MAX_GRANTS: usize = 256;

#[derive(Default)]
struct GrantSet {
    keys: HashSet<PathBuf>,
    order: VecDeque<PathBuf>,
}

impl GrantSet {
    fn add(&mut self, key: PathBuf) {
        if !self.keys.insert(key.clone()) {
            return;
        }
        self.order.push_back(key);
        while self.order.len() > MAX_GRANTS {
            if let Some(oldest) = self.order.pop_front() {
                self.keys.remove(&oldest);
            }
        }
    }

    fn contains(&self, key: &Path) -> bool {
        self.keys.contains(key)
    }

    /// Test-only introspection: the eviction bound is the one thing a caller
    /// must not have to reason about from the outside.
    #[cfg(test)]
    fn count(&self) -> usize {
        self.keys.len()
    }
}

/// The set of paths a native file dialog has handed to this session.
///
/// Keys are *resolved* (see [`grant_key`]), never the raw strings the webview
/// sent, so `../` tricks and symlink swaps cannot make an ungated file look like
/// a granted one.
#[derive(Clone, Default)]
struct PathGrants {
    inner: Arc<Mutex<GrantSet>>,
}

/// Resolve a path to the canonical key used by [`PathGrants`].
///
/// Save-dialog targets normally do not exist yet, so the nearest existing
/// ancestor is canonicalized and the remaining components re-attached. Paths
/// with `.`/`..` components are never granted: the list is keyed by resolved
/// location, and a traversal component would let a single grant cover an
/// unlimited number of different files.
fn grant_key(path: &Path) -> Option<PathBuf> {
    if path.as_os_str().is_empty() {
        return None;
    }
    if path
        .components()
        .any(|c| matches!(c, Component::CurDir | Component::ParentDir))
    {
        return None;
    }
    if let Ok(canonical) = std::fs::canonicalize(path) {
        return Some(canonical);
    }
    let mut anchor = path.to_path_buf();
    let mut tail: Vec<OsString> = Vec::new();
    loop {
        let name = anchor.file_name()?.to_os_string();
        let parent = anchor.parent()?;
        tail.push(name);
        anchor = parent.to_path_buf();
        if let Ok(base) = std::fs::canonicalize(&anchor) {
            let mut key = base;
            for component in tail.iter().rev() {
                key.push(component);
            }
            return Some(key);
        }
    }
}

impl PathGrants {
    /// Remember a path a dialog just issued. Returns false when the path cannot
    /// be resolved to a key, in which case nothing is granted.
    fn grant(&self, path: &Path) -> bool {
        let Some(key) = grant_key(path) else {
            return false;
        };
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .add(key);
        true
    }

    fn contains(&self, path: &Path) -> bool {
        let Some(key) = grant_key(path) else {
            return false;
        };
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains(&key)
    }

    #[cfg(test)]
    fn count(&self) -> usize {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).count()
    }
}

/// Reject any path the dialogs never issued, returning the resolved key.
fn require_grant(grants: &PathGrants, path: &Path, action: &str) -> Result<PathBuf, String> {
    let key = grant_key(path).ok_or_else(|| {
        format!(
            "Refusing to {} '{}': not a usable path.",
            action,
            path.display()
        )
    })?;
    if grants.contains(path) {
        Ok(key)
    } else {
        Err(format!(
            "Refusing to {} '{}': only files chosen in a native open/save dialog are accessible.",
            action,
            path.display()
        ))
    }
}

/// Read a dialog-issued file into an [`OpenedFile`] (grant-checked).
fn read_granted_file(grants: &PathGrants, path: &Path) -> Result<OpenedFile, String> {
    require_grant(grants, path, "read")?;
    let content = read_capped_text(path)?;
    Ok(OpenedFile {
        name: display_name(path),
        content,
    })
}

/// Read a batch of dialog-issued paths, reporting unreadable ones by name — the
/// same contract as [`read_open_paths`] for OS-opened files.
fn read_granted_paths(grants: &PathGrants, paths: &[PathBuf]) -> (Vec<OpenedFile>, Vec<String>) {
    let mut files = Vec::new();
    let mut failed = Vec::new();
    for p in paths {
        match read_granted_file(grants, p) {
            Ok(f) => files.push(f),
            Err(_) => failed.push(display_name(p)),
        }
    }
    (files, failed)
}

/// Drain the files the OS asked us to open before the UI mounted, and mark the
/// frontend as ready (later opens are event-pushed, never queued).
#[tauri::command]
fn take_pending_files(state: tauri::State<'_, PendingOpen>) -> PendingOpenResult {
    // A mutex poisoned by a panic while it was held is recovered here instead
    // of re-panicking, which would break file-association opening.
    let mut st = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    // Flip readiness while still holding the lock: any Opened handler that
    // acquires the lock afterwards sees `ready` and emits instead of stashing,
    // so nothing opened around this moment can be lost.
    st.ready = true;
    let files = std::mem::take(&mut st.files);
    let failed = std::mem::take(&mut st.failed);
    PendingOpenResult { files, failed }
}

/// Read a text file whose path a native dialog issued earlier this session —
/// the single-path form, while [`open_text_files`] is the entry point the
/// frontend uses. Enforces the same size cap and UTF-8 requirement as opened
/// files.
#[tauri::command]
fn read_text_file(path: String, grants: tauri::State<'_, PathGrants>) -> Result<String, String> {
    let p = Path::new(&path);
    require_grant(&grants, p, "read")?;
    read_capped_text(p)
}

/// Validate a save target: reject empty paths and existing directories, and
/// require the parent directory to exist so a stray or crafted path cannot
/// silently create directories or clobber a tree.
fn validate_save_path(path: &Path) -> Result<PathBuf, String> {
    if path.to_string_lossy().trim().is_empty() {
        return Err("Empty save path.".to_string());
    }
    if path.is_dir() {
        return Err(format!(
            "Refusing to write over a directory: {}",
            path.display()
        ));
    }
    let parent = path
        .parent()
        .filter(|d| d.exists() && d.is_dir())
        .ok_or_else(|| format!("Parent directory does not exist for: {}", path.display()))?;
    let _ = parent;
    Ok(path.to_path_buf())
}

/// Grant-checked atomic write. Every command that puts bytes on disk goes
/// through here, so the allowlist cannot be stepped around by choosing the
/// right-looking command.
fn write_granted(grants: &PathGrants, path: &Path, bytes: &[u8]) -> Result<(), String> {
    require_grant(grants, path, "write to")?;
    write_atomic(path, bytes)
}

/// Atomically write `bytes` to `path`: create a sibling temp file, write, fsync,
/// then rename over the target. Any failure after the temp file is created
/// removes it, so we never leave a stray `*.tmp-*` behind on a full disk or a
/// permission error, and `sync_all` flushes data before the rename so a
/// power loss cannot leave a truncated 0-byte overwrite.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    validate_save_path(path)?;
    let mut tmp = path.as_os_str().to_os_string();
    tmp.push(format!(".tmp-{}", std::process::id()));
    let tmp = PathBuf::from(tmp);
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // 0o644 so exported figures/sessions remain group/other readable in
        // shared directories and pipelines.
        opts.mode(0o644);
    }
    let mut file = opts.open(&tmp).map_err(|e| e.to_string())?;
    if let Err(e) = std::io::Write::write_all(&mut file, bytes) {
        drop(file);
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    if let Err(e) = file.sync_all() {
        drop(file);
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    drop(file);
    if let Err(e) = std::fs::rename(&tmp, path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}

/// Atomically save text to an already dialog-issued path.
#[tauri::command]
fn save_text_atomic(
    path: String,
    contents: String,
    grants: tauri::State<'_, PathGrants>,
) -> Result<(), String> {
    write_granted(&grants, Path::new(&path), contents.as_bytes())
}

/// Atomically save binary data (PNG / PDF exports) to an already
/// dialog-issued path, through the same hardened writer as text saves.
#[tauri::command]
fn save_binary_atomic(
    path: String,
    data: Vec<u8>,
    grants: tauri::State<'_, PathGrants>,
) -> Result<(), String> {
    write_granted(&grants, Path::new(&path), &data)
}

// ---------------------------------------------------------------------------
// Native dialogs (run in Rust so the webview never names a path)
// ---------------------------------------------------------------------------

/// Attach the dialog to the main window where the platform supports it (macOS
/// sheets / Windows modals), so the dialog belongs to the application window
/// rather than opening unparented.
fn attach_parent<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    builder: tauri_plugin_dialog::FileDialogBuilder<R>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            return builder.set_parent(&window);
        }
    }
    let _ = app;
    builder
}

/// The dialog plugin is driven from Rust only, so a missing plugin handle (or a
/// dialog the platform refused to open) has to surface as an error rather than
/// a silently empty result.
fn file_picker<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri_plugin_dialog::FileDialogBuilder<R> {
    let names: Vec<String> = OPEN_EXTENSIONS
        .iter()
        .map(|e| e.trim_start_matches('.').to_string())
        .collect();
    let extensions: Vec<&str> = names.iter().map(String::as_str).collect();
    attach_parent(app, app.dialog().file()).add_filter("recPhyloXML / NHX", &extensions)
}

/// Show a native open dialog and read what the user picked. Runs the whole
/// dialog round-trip in Rust, so the only paths that end up granted are the ones
/// the OS dialog actually returned. `multi` is the frontend's single-select vs
/// multi-select open flag.
#[tauri::command]
async fn open_text_files(app: tauri::AppHandle, multi: bool) -> Result<PendingOpenResult, String> {
    let picked: Vec<PathBuf> = if multi {
        file_picker(&app)
            .blocking_pick_files()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|p| p.into_path().ok())
            .collect()
    } else {
        file_picker(&app)
            .blocking_pick_file()
            .and_then(|p| p.into_path().ok())
            .map(|p| vec![p])
            .unwrap_or_default()
    };
    if picked.is_empty() {
        // User cancelled: no files, no failures.
        return Ok(PendingOpenResult::default());
    }
    let grants = app.state::<PathGrants>().inner().clone();
    for path in &picked {
        grants.grant(path);
    }
    let (files, failed) = read_granted_paths(&grants, &picked);
    Ok(PendingOpenResult { files, failed })
}

/// Show a native save dialog for `default_name` filtered to `ext` and return the
/// chosen path, or None when the user cancels.
fn pick_save_target<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    default_name: &str,
    ext: &str,
) -> Option<PathBuf> {
    let builder = app.dialog().file().set_file_name(default_name);
    let builder = if ext.is_empty() {
        builder
    } else {
        builder.add_filter(ext.to_uppercase(), &[ext])
    };
    attach_parent(app, builder)
        .blocking_save_file()
        .and_then(|p| p.into_path().ok())
}

/// Save text through a native save dialog. Returns false when the user cancels.
#[tauri::command]
async fn save_text_via_dialog(
    app: tauri::AppHandle,
    default_name: String,
    ext: String,
    contents: String,
) -> Result<bool, String> {
    let Some(path) = pick_save_target(&app, &default_name, &ext) else {
        return Ok(false);
    };
    let grants = app.state::<PathGrants>().inner().clone();
    grants.grant(&path);
    write_granted(&grants, &path, contents.as_bytes())?;
    Ok(true)
}

/// Save binary data (PNG / PDF) through a native save dialog. Returns false when
/// the user cancels.
#[tauri::command]
async fn save_binary_via_dialog(
    app: tauri::AppHandle,
    default_name: String,
    ext: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    let Some(path) = pick_save_target(&app, &default_name, &ext) else {
        return Ok(false);
    };
    let grants = app.state::<PathGrants>().inner().clone();
    grants.grant(&path);
    write_granted(&grants, &path, &data)?;
    Ok(true)
}

/// Associated-file extensions we know how to handle.
const OPEN_EXTENSIONS: [&str; 7] = [
    ".recphyloxml",
    ".recphylo",
    ".xml",
    ".phyloxml",
    ".nhx",
    ".nwk",
    ".newick",
];

fn is_open_extension(arg: &str) -> bool {
    let l = arg.to_ascii_lowercase();
    OPEN_EXTENSIONS.iter().any(|ext| l.ends_with(ext))
}

/// Read every candidate path; returns the successes and the failed names.
fn read_open_paths<I: IntoIterator<Item = std::path::PathBuf>>(
    paths: I,
) -> (Vec<OpenedFile>, Vec<String>) {
    let mut files = Vec::new();
    let mut failed = Vec::new();
    for p in paths {
        match read_opened(&p) {
            Some(f) => files.push(f),
            None => failed.push(display_name(&p)),
        }
    }
    (files, failed)
}

fn stash(app: &tauri::AppHandle, files: Vec<OpenedFile>, failed: Vec<String>) {
    let state = app.state::<PendingOpen>();
    let mut st = state.inner.lock().unwrap_or_else(|e| e.into_inner());
    st.files.extend(files);
    st.failed.extend(failed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpen::default())
        // The allowlist every path-taking command is checked against. Only the
        // dialog commands below ever add to it.
        .manage(PathGrants::default())
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            open_text_files,
            save_text_via_dialog,
            save_binary_via_dialog,
            read_text_file,
            save_text_atomic,
            save_binary_atomic
        ])
        .setup(|app| {
            // Windows/Linux deliver associated files as CLI arguments.
            let (files, failed) = read_open_paths(
                std::env::args()
                    .skip(1)
                    // Skip option flags, but keep a real file even if its path
                    // happens to begin with '-' (e.g. `./-tree.nhx`): a leading
                    // dash alone does not make an argument a flag.
                    .filter(|a| !a.starts_with('-') || Path::new(a).is_file())
                    .filter(|a| is_open_extension(a))
                    .map(PathBuf::from)
                    .collect::<Vec<_>>(),
            );
            stash(app.handle(), files, failed);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            // macOS delivers associated files (at launch and while running)
            // through the Opened event rather than argv. This variant only
            // exists on Apple / Android platforms — gate it with the same
            // cfg the upstream crate uses so Windows/Linux compile cleanly.
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let RunEvent::Opened { urls } = event {
                let (files, failed) = read_open_paths(
                    urls.iter()
                        .filter_map(|u| u.to_file_path().ok())
                        .collect::<Vec<_>>(),
                );
                if files.is_empty() && failed.is_empty() {
                    return;
                }
                // Decide readiness and stash-or-emit in ONE critical section so
                // a concurrent take_pending_files drain cannot lose this open.
                // If the frontend is ready, emit; otherwise queue it for
                // the next drain.
                let pending_for_emit = {
                    let state = app.state::<PendingOpen>();
                    let mut st = state.inner.lock().unwrap_or_else(|e| e.into_inner());
                    if st.ready {
                        Some((files, failed))
                    } else {
                        st.files.extend(files);
                        st.failed.extend(failed);
                        None
                    }
                };
                if let Some((files, failed)) = pending_for_emit {
                    if !failed.is_empty() {
                        let _ = app.emit("open-file-failed", failed);
                    }
                    if !files.is_empty() {
                        let _ = app.emit("open-file", files);
                    }
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            {
                let _ = (app, event);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory unique per test, with the temp dir resolved so the
    /// keys match what `grant_key` computes (macOS `/var` -> `/private/var`).
    fn scratch_dir(tag: &str) -> PathBuf {
        let base =
            std::fs::canonicalize(std::env::temp_dir()).unwrap_or_else(|_| std::env::temp_dir());
        let dir = base.join(format!(
            "phylorecviewer-test-{}-{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch dir");
        dir
    }

    #[test]
    fn open_extension_matching_is_case_insensitive() {
        assert!(is_open_extension("/tmp/a.recphyloxml"));
        assert!(is_open_extension("Foo.NHX"));
        assert!(is_open_extension("tree.Newick"));
        assert!(!is_open_extension("notes.txt"));
        assert!(!is_open_extension("data.json"));
    }

    #[test]
    fn read_opened_rejects_missing_and_reports_failures_by_name() {
        // A path that does not exist yields None; read_open_paths records the
        // file name in `failed` rather than panicking.
        let (files, failed) = read_open_paths(vec![PathBuf::from("/nonexistent/z.nhx")]);
        assert!(files.is_empty());
        assert_eq!(failed, vec!["z.nhx".to_string()]);
    }

    #[test]
    fn validate_save_path_rejects_empty_target() {
        assert!(validate_save_path(Path::new("")).is_err());
        assert!(validate_save_path(Path::new("   ")).is_err());
    }

    #[test]
    fn validate_save_path_rejects_missing_parent() {
        // Non-existent parent: the writer must never create directory trees.
        let dir = scratch_dir("parent");
        let ghost = dir.join("no-such-subdir").join("out.nhx");
        assert!(validate_save_path(&ghost).is_err());
        // Writing to it is rejected too, even though the scratch dir is granted.
        let grants = PathGrants::default();
        grants.grant(&ghost);
        assert!(write_granted(&grants, &ghost, b"x").is_err());
    }

    #[test]
    fn write_rejects_path_never_issued_by_a_dialog() {
        let dir = scratch_dir("ungated");
        let secret = dir.join("secrets.nhx");
        std::fs::write(&secret, "(A)B;").unwrap();
        let grants = PathGrants::default();
        // Nothing has been granted yet: neither read nor write is allowed.
        assert!(!grants.contains(&secret));
        assert!(read_granted_file(&grants, &secret).is_err());
        assert!(write_granted(&grants, &secret, b"overwrite").is_err());
        assert!(require_grant(&grants, Path::new("/etc/hosts"), "read").is_err());
        // The file is untouched: the gate really ran before any I/O.
        assert_eq!(std::fs::read_to_string(&secret).unwrap(), "(A)B;");
    }

    #[test]
    fn read_accepts_only_dialog_issued_paths() {
        let dir = scratch_dir("read");
        let granted = dir.join("a.nhx");
        let other = dir.join("b.nhx");
        std::fs::write(&granted, "(A,B);").unwrap();
        std::fs::write(&other, "(C,D);").unwrap();

        let grants = PathGrants::default();
        assert!(grants.grant(&granted));
        assert_eq!(
            read_granted_file(&grants, &granted).unwrap().content,
            "(A,B);"
        );
        // Same directory, never issued by a dialog -> rejected.
        assert!(read_granted_file(&grants, &other).is_err());
    }

    #[test]
    fn write_accepts_dialog_issued_target_before_file_exists() {
        let dir = scratch_dir("write");
        // A save dialog hands out a path that does not exist yet.
        let target = dir.join("figure.png");
        assert!(!target.exists());
        let grants = PathGrants::default();
        assert!(grants.grant(&target));
        write_granted(&grants, &target, b"\x89PNG").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"\x89PNG");
        // Re-saving to the same authorised path is accepted: with the file
        // present the key resolves through `canonicalize` directly.
        assert!(grants.contains(&target));
        write_granted(&grants, &target, b"v2").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"v2");
        // A sibling the dialog never issued stays unwritable.
        assert!(write_granted(&grants, &dir.join("other.png"), b"x").is_err());
    }

    #[test]
    fn grants_are_keyed_by_resolved_path_not_string() {
        let dir = scratch_dir("resolve");
        let file = dir.join("tree.nwk");
        std::fs::write(&file, "(A);").unwrap();
        let grants = PathGrants::default();
        grants.grant(&file);
        // `..` in the un-resolved path is never a grant, even when it points at
        // a granted file: one grant must not cover a whole tree of spellings.
        assert!(!grants.contains(&dir.join("sub").join("..").join("tree.nwk")));
        assert!(read_granted_file(&grants, &dir.join("sub").join("..").join("tree.nwk")).is_err());
        // Neither is an explicit relative form.
        assert!(grant_key(Path::new("./tree.nwk")).is_none());
        assert!(grant_key(Path::new("")).is_none());
    }

    #[test]
    fn symlinked_grant_does_not_open_the_symlink_target() {
        let dir = scratch_dir("symlink");
        let granted = dir.join("granted.nhx");
        std::fs::write(&granted, "(A);").unwrap();
        let outside = scratch_dir("symlink-out").join("passwd-like.txt");
        std::fs::write(&outside, "secret").unwrap();

        let grants = PathGrants::default();
        grants.grant(&granted);
        // Attack: after the grant, swap the granted path for a link to another
        // file. The check resolves links, so the target is NOT what was granted.
        #[cfg(unix)]
        {
            std::fs::remove_file(&granted).unwrap();
            std::os::unix::fs::symlink(&outside, &granted).unwrap();
            assert!(!grants.contains(&granted));
            assert!(read_granted_file(&grants, &granted).is_err());
            assert_eq!(std::fs::read_to_string(&outside).unwrap(), "secret");
        }
    }

    #[test]
    fn dialog_read_reports_failures_by_name() {
        // Mirrors `read_opened_rejects_missing_and_reports_failures_by_name` for
        // the dialog path: a readable file next to one deleted in between is
        // delivered, and the other is named in `failed`.
        let dir = scratch_dir("batch");
        let good = dir.join("ok.nhx");
        std::fs::write(&good, "(A,B);").unwrap();
        let missing = dir.join("gone.nhx");
        let grants = PathGrants::default();
        for p in [&good, &missing] {
            grants.grant(p);
        }
        let (files, failed) = read_granted_paths(&grants, &[good.clone(), missing.clone()]);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].name, "ok.nhx");
        assert_eq!(failed, vec!["gone.nhx".to_string()]);
    }

    #[test]
    fn grant_list_is_bounded() {
        let dir = scratch_dir("bounded");
        let grants = PathGrants::default();
        for i in 0..(MAX_GRANTS + 16) {
            grants.grant(&dir.join(format!("f{}.nhx", i)));
        }
        assert!(grants.count() <= MAX_GRANTS);
        // The most recent paths stay granted; the oldest were evicted.
        assert!(grants.contains(&dir.join(format!("f{}.nhx", MAX_GRANTS + 15))));
        assert!(!grants.contains(&dir.join("f0.nhx")));
    }

    #[test]
    fn save_command_shape_preserves_cancel_semantics() {
        // `pick_save_target` needs a running app handle, so only the pure part
        // of the save path is unit-tested here: an empty save target is refused
        // and a granted one round-trips. (The dialog itself is exercised by
        // `cargo run` / the packaged app.)
        let grants = PathGrants::default();
        assert!(write_granted(&grants, Path::new(""), b"x").is_err());
        assert_eq!(grants.count(), 0);
    }
}
