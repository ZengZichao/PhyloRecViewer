// React 18 requires this global flag for `act()` to work correctly in tests;
// without it every state update inside act() prints a console warning.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement navigation. The app downloads files by clicking an
// <a download> element, which is inert in a browser but makes jsdom print
// "Not implemented: navigation" in tests. Keep every other anchor click
// intact so link behaviour remains testable.
const nativeAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click(): void {
  if (this.hasAttribute("download")) return;
  nativeAnchorClick.call(this);
};

// jsPDF logs a benign fallback when a CSS font weight/style combination has no
// built-in PDF face (the SVG export test uses 600 italic). The PDF is produced
// correctly through the fallback; keep the test log free of library noise.
const nativeConsoleError = console.error;
console.error = (first: unknown, ...rest: unknown[]): void => {
  if (typeof first === "string" && first.includes("Unable to look up font label")) return;
  nativeConsoleError(first, ...rest);
};
const nativeConsoleWarn = console.warn;
console.warn = (first: unknown, ...rest: unknown[]): void => {
  if (typeof first === "string" && first.includes("Unable to look up font label")) return;
  nativeConsoleWarn(first, ...rest);
};
