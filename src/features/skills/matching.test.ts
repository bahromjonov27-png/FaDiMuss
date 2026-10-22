import { describe, expect, it } from "vitest";
import { matchSkillProfiles, type SkillProfile } from "./matching";

const learner: SkillProfile = { userId: "a", displayName: "A", skillsToTeach: ["design"], skillsToLearn: ["english"], levels: { design: 4 }, languages: ["uz"], availabilitySummary: "Evenings" };
const candidate: SkillProfile = { userId: "b", displayName: "B", skillsToTeach: ["english"], skillsToLearn: ["design"], levels: { english: 4 }, languages: ["uz"], availabilitySummary: "Evenings" };

describe("skill swap matching", () => {
  it("scores complementary two-way profiles and explains the fit", () => {
    const match = matchSkillProfiles(learner, candidate, ["english"]);
    expect(match?.score).toBe(100);
    expect(match?.direction).toBe("two-way");
    expect(match?.reasons).toHaveLength(2);
  });

  it("does not match profiles without a complementary skill", () => {
    expect(matchSkillProfiles(learner, { ...candidate, skillsToTeach: ["math"] })).toBeNull();
  });
});