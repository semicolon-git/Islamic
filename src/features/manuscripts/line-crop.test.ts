import { describe, expect, it } from "vitest";
import { autoTurn, rectPolygon } from "./geometry";

describe("line crop orientation", () => {
  it("turns vertical glosses so they read horizontally, using the baseline direction", () => {
    const tall = rectPolygon({ x: 0, y: 0, w: 40, h: 300 });
    expect(autoTurn(rectPolygon({ x: 0, y: 0, w: 300, h: 40 }))).toBe("none");
    expect(autoTurn(tall)).toBe("cw");
    expect(autoTurn(tall, [[20, 290], [20, 10]])).toBe("cw");
    expect(autoTurn(tall, [[20, 10], [20, 290]])).toBe("ccw");
  });
});
