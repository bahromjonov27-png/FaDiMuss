export const talentCategories = [
  "communication",
  "creativity",
  "analytical",
  "technical",
  "leadership",
] as const;

export type TalentCategory = (typeof talentCategories)[number];
export type TalentScores = Record<TalentCategory, number>;

export const talentQuestions: Array<{ id: string; category: TalentCategory; text: string }> = [
  { id: "c1", category: "communication", text: "Fikrlarimni boshqalarga tushunarli yetkazaman." },
  { id: "c2", category: "communication", text: "Suhbatda boshqalarni diqqat bilan tinglayman." },
  { id: "r1", category: "creativity", text: "Yangi g'oyalar va noodatiy yechimlar topishni yoqtiraman." },
  { id: "r2", category: "creativity", text: "Bir muammoga bir nechta yondashuv o'ylab ko'raman." },
  { id: "a1", category: "analytical", text: "Murakkab ma'lumotni qismlarga ajratib tahlil qilaman." },
  { id: "a2", category: "analytical", text: "Qaror oldidan dalillarni solishtiraman." },
  { id: "t1", category: "technical", text: "Texnik muammolarning sababini mustaqil izlayman." },
  { id: "t2", category: "technical", text: "Raqamli vositalar va yangi texnologiyalarni sinab ko'raman." },
  { id: "l1", category: "leadership", text: "Guruh ishini tashkil etish mas'uliyatini olaman." },
  { id: "l2", category: "leadership", text: "Jamoaga maqsad sari harakat qilishda yordam beraman." },
];

export function scoreTalentAssessment(answers: Record<string, number | string>): TalentScores {
  return Object.fromEntries(talentCategories.map((category) => {
    const values = talentQuestions
      .filter((question) => question.category === category)
      .map((question) => Number(answers[question.id]))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 1;
    return [category, Math.round(((average - 1) / 4) * 100)];
  })) as TalentScores;
}