/**
 * Single source of truth for the application version shown in the About
 * dialog, exported metadata, CSV provenance lines and diagnostics.
 * Keep in sync with package.json / CITATION.cff (the release step bumps all).
 */
export const APP_VERSION = "0.2.0";

/** The app name, for titles and provenance strings. */
export const APP_NAME = "PhyloRecViewer";

/** The current release. The working tree may be ahead of it. */
export const ARCHIVED_RELEASE = "v0.2.0";
export const ARCHIVED_DOI = "10.5281/zenodo.23053317";
export const APP_CITATION =
  `Zeng, Z., & Wang, Y. (2026). ${APP_NAME} (${ARCHIVED_RELEASE}) [Computer software]. ` +
  `Zenodo. https://doi.org/${ARCHIVED_DOI}`;
