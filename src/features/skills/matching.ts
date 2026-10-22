export type SkillProfile = {
  userId: string;
  displayName: string;
  skillsToTeach: string[];
  skillsToLearn: string[];
  levels: Record<string, number>;
  languages: string[];
  availabilitySummary: string;
};

export type SkillMatch = {
  score: number;
  direction: "two-way" | "one-way";
  offeredSkill: string;
  requestedSkill: string;
  reasons: string[];
};

export function matchSkillProfiles(
  learner: SkillProfile,
  candidate: SkillProfile,
  goalSkills: string[] = [],
): SkillMatch | null {
  const offeredSkill = candidate.skillsToTeach.find((skill) => learner.skillsToLearn.includes(skill));
  if (!offeredSkill) return null;

  const requestedSkill = learner.skillsToTeach.find((skill) => candidate.skillsToLearn.includes(skill));
  const direction = requestedSkill ? "two-way" : "one-way";
  const skillComplementarity = direction === "two-way" ? 100 : 70;
  const goalFit = goalSkills.length === 0 || goalSkills.includes(offeredSkill) ? 100 : 60;
  const candidateLevel = candidate.levels[offeredSkill] ?? 3;
  const levelFit = candidateLevel >= 3 ? 100 : 75;
  const languageFit = learner.languages.some((language) => candidate.languages.includes(language)) ? 100 : 50;
  const availabilityFit = learner.availabilitySummary && candidate.availabilitySummary ? 100 : 50;
  const score = Math.round(
    0.4 * skillComplementarity + 0.25 * goalFit + 0.15 * levelFit
    + 0.1 * languageFit + 0.1 * availabilityFit,
  );
  const reasons = [
    `${candidate.displayName} ${offeredSkill} ko'nikmasini o'rgata oladi`,
    direction === "two-way" ? `siz ${requestedSkill} bo'yicha yordam bera olasiz` : "Moslik bir tomonlama",
  ];

  return { score, direction, offeredSkill, requestedSkill: requestedSkill ?? "", reasons };
}