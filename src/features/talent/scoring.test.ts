import { describe, expect, it } from "vitest";
import { scoreTalentAssessment } from "./scoring";

describe("talent self-assessment scoring", () => {
  it("normalizes real 1-5 answers to 0-100", () => {
    const scores = scoreTalentAssessment({ c1: 5, c2: 3, r1: 1, r2: 1, a1: 3, a2: 3, t1: 4, t2: 4, l1: 2, l2: 2 });
    expect(scores.communication).toBe(75);
    expect(scores.creativity).toBe(0);
    expect(scores.technical).toBe(75);
  });

  it("accepts numeric strings from form inputs", () => {
    const scores = scoreTalentAssessment({ c1: "5", c2: "3", r1: "1", r2: "1", a1: "3", a2: "3", t1: "4", t2: "4", l1: "2", l2: "2" });
    expect(scores.communication).toBe(75);
    expect(scores.creativity).toBe(0);
    expect(scores.technical).toBe(75);
  });
});