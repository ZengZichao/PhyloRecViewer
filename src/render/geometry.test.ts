import { describe, expect, it } from "vitest";
import { makeProjector, pj } from "./geometry";

/**
 * The projector is a distance-preserving axis swap/flip. These tests pin the
 * four orientations so refactors to the rendering path can't silently mirror or
 * rotate the drawing the wrong way.
 */
describe("makeProjector", () => {
  it("top keeps the canonical mapping and bounding box", () => {
    const p = makeProjector("top", 100, 200);
    expect(p.width).toBe(100);
    expect(p.height).toBe(200);
    expect(p.horizontal).toBe(false);
    expect(p.leafDy).toBe(1);
    expect(pj(p, { x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it("bottom flips the growth axis (leaves grow up)", () => {
    const p = makeProjector("bottom", 100, 200);
    expect(p.leafDy).toBe(-1);
    expect(pj(p, { x: 10, y: 20 })).toEqual({ x: 10, y: 180 });
  });

  it("left swaps axes and the bounding box", () => {
    const p = makeProjector("left", 100, 200);
    expect(p.width).toBe(200);
    expect(p.height).toBe(100);
    expect(p.horizontal).toBe(true);
    expect(p.leafDx).toBe(1);
    expect(pj(p, { x: 10, y: 20 })).toEqual({ x: 20, y: 10 });
  });

  it("right swaps axes and flips horizontally", () => {
    const p = makeProjector("right", 100, 200);
    expect(p.width).toBe(200);
    expect(p.height).toBe(100);
    expect(p.leafDx).toBe(-1);
    expect(pj(p, { x: 10, y: 20 })).toEqual({ x: 180, y: 10 });
  });
});
