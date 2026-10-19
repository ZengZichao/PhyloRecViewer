// A pure string helper for the export/save paths.
/**
 * The file-name stem used by every download and save path. Lives outside the
 * menu-bar component so it can be unit-tested (and so the module keeps
 * exporting only components).
 */
export function baseName(name: string | null): string {
  if (!name) return "reconciliation";
  // Strip the extension and only the characters a filesystem actually rejects.
  // A `[^\w.-]` class was used before, and `\w` is ASCII-only: every CJK name
  // collapsed to "_" (完整示例….recphyloxml -> "_", 日本語.nhx -> "_"), so two
  // Chinese-named documents exported to the SAME file and the atomic save
  // silently replaced the first one.
  const stripped = name
    .replace(/\.[^.]+$/, "")
    .replace(/[/\\:*?"<>|]+/g, "_")
    // Control characters cannot be written by hand but can arrive from a
    // crafted document name; drop them without a control-character regex class.
    .split("")
    .filter((c) => (c.codePointAt(0) ?? 0) >= 0x20)
    .join("")
    .replace(/^\s+|\s+$/g, "");
  // A stem of only dots would name the file "." / ".." once the extension is
  // appended back, which no filesystem takes well.
  return stripped && !/^\.+$/.test(stripped) ? stripped : "reconciliation";
}
