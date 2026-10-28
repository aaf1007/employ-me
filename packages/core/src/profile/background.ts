import { z } from 'zod';
import { idSchema, nonEmptyText, yearMonthSchema } from '../common';
import { VOCAB } from '../taxonomy/vocab';

export const workEntryShape = {
  id: idSchema,
  employer: nonEmptyText,
  title: nonEmptyText,
  location: z.string().trim().optional(),
  startDate: yearMonthSchema,
  /** Absent while `current` is true. */
  endDate: yearMonthSchema.optional(),
  current: z.boolean().default(false),
  description: z.string().max(10_000).optional(),
};
export const workEntrySchema = z.strictObject(workEntryShape);
export type WorkEntry = z.infer<typeof workEntrySchema>;

export const gpaShape = {
  value: z.number().nonnegative(),
  scale: z.number().positive(),
};

export const educationEntryShape = {
  id: idSchema,
  school: nonEmptyText,
  /** As written on the resume: "B.Sc.", "MEng". */
  degree: z.string().trim().optional(),
  degreeLevel: z.enum(VOCAB.degreeLevel).optional(),
  discipline: z.string().trim().optional(),
  startDate: yearMonthSchema.optional(),
  /** Graduation (or expected graduation). */
  endDate: yearMonthSchema.optional(),
  /** Optional (design.md "Background"). */
  gpa: z.strictObject(gpaShape).optional(),
};
export const educationEntrySchema = z.strictObject(educationEntryShape);
export type EducationEntry = z.infer<typeof educationEntrySchema>;

export const skillShape = {
  name: nonEmptyText,
  /** Other spellings forms might use: "JS" for "JavaScript". */
  aliases: z.array(nonEmptyText).default([]),
};
export const skillSchema = z.strictObject(skillShape);
export type Skill = z.infer<typeof skillSchema>;

export const languageSkillShape = {
  /** Language name in English: "French". */
  language: nonEmptyText,
  proficiency: z.enum(VOCAB.languageProficiency),
};
export const languageSkillSchema = z.strictObject(languageSkillShape);
export type LanguageSkill = z.infer<typeof languageSkillSchema>;

/** Background: work history, education (optional GPA), skills, languages. */
export const backgroundSchema = z.strictObject({
  workHistory: z.array(workEntrySchema).default([]),
  education: z.array(educationEntrySchema).default([]),
  skills: z.array(skillSchema).default([]),
  languages: z.array(languageSkillSchema).default([]),
});
export type Background = z.infer<typeof backgroundSchema>;
