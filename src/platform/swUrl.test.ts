import { describe, expect, it } from "vitest";
import { swRegisterUrl } from "./swUrl";

describe("swRegisterUrl", () => {
  it("keeps the project-page sub-path instead of resolving to the domain root", () => {
    // The deployment shape that made a hardcoded "/sw.js" 404.
    const url = swRegisterUrl("./");
    expect(url).toBe("./sw.js");
    expect(
      new URL(url, "https://example.github.io/PhyloRecViewer/index.html").pathname,
    ).toBe("/PhyloRecViewer/sw.js");
  });

  it("accepts an explicit absolute base", () => {
    expect(swRegisterUrl("/PhyloRecViewer/")).toBe("/PhyloRecViewer/sw.js");
    expect(swRegisterUrl("/")).toBe("/sw.js");
  });
});
