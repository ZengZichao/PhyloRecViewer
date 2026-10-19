import { describe, expect, it } from "vitest";
import { detailLevelForZoom } from "./options";

describe("detailLevelForZoom", () => {
  it("uses full detail at or near 1:1", () => {
    expect(detailLevelForZoom(2)).toBe("full");
    expect(detailLevelForZoom(1)).toBe("full");
    expect(detailLevelForZoom(0.5)).toBe("full");
  });

  it("drops to medium when moderately zoomed out", () => {
    expect(detailLevelForZoom(0.41)).toBe("medium");
    expect(detailLevelForZoom(0.2)).toBe("medium");
  });

  it("drops to low when heavily zoomed out", () => {
    expect(detailLevelForZoom(0.15)).toBe("low");
    expect(detailLevelForZoom(0.03)).toBe("low");
  });
});
