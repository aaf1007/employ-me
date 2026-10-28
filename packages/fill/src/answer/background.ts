import { normalizeLabel, type EducationEntry, type FieldType, type WorkEntry } from '@employ-me/core';
import { LANGUAGES } from '../classify';
import { textTarget, type OptionTarget } from '../match';
import type { ExtractedField } from '../types';
import { howHeardTarget, yearMonthTarget } from './targets';
import {
  isChoice,
  isOneOf,
  missing,
  option,
  skip,
  text,
  yesNo,
  type Answer,
  type AnswerContext,
} from './types';
import { vocabTarget } from './vocab';

// Answers from the Profile's background, preferences and screening answers,
// and the Resume.

const BACKGROUND_TYPES = [
  'work.currentEmployer',
  'work.employer',
  'work.currentTitle',
  'work.title',
  'work.location',
  'work.current',
  'work.startDate',
  'work.endDate',
  'work.description',
  'edu.school',
  'edu.degree',
  'edu.discipline',
  'edu.endDate',
  'edu.startDate',
  'edu.gpa',
  'skill.list',
  'language.name',
  'language.proficiency',
  'pref.relocation',
  'pref.workModel',
  'pref.startDate',
  'pref.noticePeriod',
  'screening.howHeard',
  'screening.referred',
  'screening.backgroundCheck',
  'screening.nonCompete',
  'screening.workedHereBefore',
  'file.resume',
  'file.coverLetter',
  'freeText.coverLetter',
] as const satisfies readonly FieldType[];

export function backgroundAnswer(
  fieldType: FieldType,
  field: ExtractedField,
  ctx: AnswerContext,
): Answer | null {
  const { profile } = ctx;
  if (!isOneOf(fieldType, BACKGROUND_TYPES)) return null;
  switch (fieldType) {
    case 'work.currentEmployer':
    case 'work.employer': {
      const job = jobFor(field, ctx);
      return job === undefined ? missing('your work history') : text(job.employer);
    }
    case 'work.currentTitle':
    case 'work.title': {
      const job = jobFor(field, ctx);
      return job === undefined ? missing('your work history') : text(job.title);
    }
    case 'work.location': {
      const job = jobFor(field, ctx);
      if (job === undefined) return missing('your work history');
      return job.location === undefined || job.location === ''
        ? missing('where this job was')
        : text(job.location);
    }
    case 'work.current': {
      const job = jobFor(field, ctx);
      return job === undefined ? missing('your work history') : yesNo(job.current);
    }
    case 'work.startDate': {
      const job = jobFor(field, ctx);
      return job === undefined ? missing('your work history') : dateAnswer(field, job.startDate);
    }
    case 'work.endDate': {
      const job = jobFor(field, ctx);
      if (job === undefined) return missing('your work history');
      if (job.current) {
        return skip(
          'notInProfile',
          'You still work here, so this stays empty. Tick "I currently work here".',
        );
      }
      return job.endDate === undefined ? missing('when this job ended') : dateAnswer(field, job.endDate);
    }
    case 'work.description': {
      const job = jobFor(field, ctx);
      if (job === undefined) return missing('your work history');
      return job.description === undefined || job.description === ''
        ? missing('a description of this job')
        : text(job.description);
    }
    case 'edu.school': {
      const school = schoolFor(field, ctx);
      // Typed into searchable lists: Greenhouse loads schools by search term.
      return school === undefined
        ? missing('your education')
        : option({ ...textTarget(school.school, school.school), firstWins: true });
    }
    case 'edu.degree': {
      const entry = schoolFor(field, ctx);
      const target = entry?.degreeLevel === undefined ? null : vocabTarget('degreeLevel', entry.degreeLevel);
      if (target !== null) return isChoice(field) ? option(target) : text(entry?.degree ?? target.text);
      return entry?.degree === undefined ? missing('your degree') : text(entry.degree);
    }
    case 'edu.discipline': {
      const entry = schoolFor(field, ctx);
      return entry?.discipline === undefined
        ? missing('your field of study')
        : option(textTarget(entry.discipline));
    }
    case 'edu.endDate': {
      const date = schoolFor(field, ctx)?.endDate;
      return date === undefined ? missing('your graduation date') : dateAnswer(field, date);
    }
    case 'edu.startDate': {
      const date = schoolFor(field, ctx)?.startDate;
      return date === undefined ? missing('your education start date') : dateAnswer(field, date);
    }
    case 'edu.gpa': {
      const gpa = schoolFor(field, ctx)?.gpa;
      return gpa === undefined ? missing('your GPA') : text(String(gpa.value));
    }
    case 'skill.list': {
      const skills = profile.background.skills.map((s) => s.name);
      if (skills.length === 0) return missing('your skills');
      return isChoice(field) ? options(skills.map((s) => textTarget(s))) : text(skills.join(', '));
    }
    case 'language.name': {
      const languages = profile.background.languages.map((l) => l.language);
      if (languages.length === 0) return missing('the languages you speak');
      return isChoice(field) ? options(languages.map((l) => textTarget(l))) : text(languages.join(', '));
    }
    case 'language.proficiency':
      return languageAnswer(field, ctx);
    case 'pref.relocation':
      return profile.preferences.relocation === undefined
        ? missing('whether you would relocate')
        : yesNo(profile.preferences.relocation);
    case 'pref.workModel':
      return workModelAnswer(field, ctx);
    case 'pref.startDate': {
      const start = profile.preferences.startDate;
      return start === undefined
        ? missing('your start date')
        : { kind: 'answer', value: { kind: 'date', iso: start }, source: 'rules' };
    }
    case 'pref.noticePeriod': {
      const notice = profile.preferences.noticePeriod;
      if (notice === undefined) return missing('your notice period');
      const unit = notice.amount === 1 ? notice.unit.replace(/s$/, '') : notice.unit;
      return text(`${notice.amount} ${unit}`);
    }
    case 'screening.howHeard':
      return profile.screening.howHeard === undefined
        ? missing('how you usually hear about jobs')
        : option(howHeardTarget(profile.screening.howHeard));
    case 'screening.referred':
      // "Please provide the name of the person who referred you": the Profile keeps no names.
      // "Have you been referred? If so, who?" is still a yes/no question.
      if (!isChoice(field) && asksForReferrer(normalizeLabel(field.label))) {
        return skip('notInProfile', 'If someone referred you, type their name. Otherwise leave it empty.');
      }
      return profile.screening.referred === undefined
        ? missing('whether you were referred')
        : yesNo(profile.screening.referred);
    case 'screening.backgroundCheck':
      return profile.screening.backgroundCheck === undefined
        ? missing('whether you agree to background checks')
        : yesNo(profile.screening.backgroundCheck);
    case 'screening.nonCompete':
      return profile.screening.nonCompete === undefined
        ? missing('whether you have a non-compete')
        : yesNo(profile.screening.nonCompete);
    case 'screening.workedHereBefore': {
      const before = ctx.employer === null ? undefined : profile.screening.workedHereBefore[ctx.employer];
      // "A company missing here is asked, not guessed" (core screening.ts).
      return before === undefined ? { kind: 'review', reason: 'askEachTime' } : yesNo(before);
    }
    case 'file.resume':
      return ctx.hasResume
        ? { kind: 'answer', value: { kind: 'file' }, source: 'rules' }
        : missing('a Resume');
    case 'file.coverLetter':
    case 'freeText.coverLetter':
      return skip(
        'coverLetter',
        'Cover letters are left for you. Attach or write one yourself, or click Draft.',
      );
  }
}

/** A month ("2023-05"): picked from a list of dates, else written as a date (one part per box on Workday). */
function dateAnswer(field: ExtractedField, yearMonth: string): Answer {
  return isChoice(field)
    ? option(yearMonthTarget(yearMonth))
    : { kind: 'answer', value: { kind: 'date', iso: yearMonth }, source: 'rules' };
}

const options = (targets: readonly OptionTarget[]): Answer => ({
  kind: 'answer',
  value: { kind: 'options', targets },
  source: 'rules',
});

/** Entry N of a repeating section: Greenhouse names them school--0, school--1. */
function entryIndex(field: ExtractedField): number {
  const match = /--(\d+)$/.exec(field.fieldId);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

function jobFor(field: ExtractedField, ctx: AnswerContext): WorkEntry | undefined {
  const history = ctx.profile.background.workHistory;
  if (/--\d+$/.test(field.fieldId)) return history[entryIndex(field)];
  return (
    history.find((job) => job.current) ??
    [...history].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  );
}

function schoolFor(field: ExtractedField, ctx: AnswerContext): EducationEntry | undefined {
  const education = ctx.profile.background.education;
  if (/--\d+$/.test(field.fieldId)) return education[entryIndex(field)];
  return [...education].sort((a, b) => (b.endDate ?? '9999').localeCompare(a.endDate ?? '9999'))[0];
}

function languageAnswer(field: ExtractedField, ctx: AnswerContext): Answer {
  const label = normalizeLabel(field.label);
  const asked = new RegExp(`\\b(${LANGUAGES})\\b`).exec(label)?.[1];
  if (asked === undefined) return skip('unrecognizedField', 'Answer this language question yourself.');
  const known = ctx.profile.background.languages.find((l) => l.language.toLowerCase() === asked);
  if (known === undefined) {
    const name = `${asked.charAt(0).toUpperCase()}${asked.slice(1)}`;
    return skip(
      'notInProfile',
      `Your Profile doesn't list ${name}. Add it to your languages if you speak it, or answer this yourself.`,
    );
  }
  const level = known.proficiency;
  const yes = /\bnative\b/.test(label)
    ? level === 'native'
    : /\bfluen\w*\b/.test(label)
      ? level === 'native' || level === 'fullProfessional'
      : true;
  return yesNo(yes);
}

function workModelAnswer(field: ExtractedField, ctx: AnswerContext): Answer {
  const models = ctx.profile.preferences.workModels;
  if (models.length === 0) return missing('the work models you prefer');
  const label = normalizeLabel(field.label);
  const asksRemote = /\bremote\b/.test(label);
  const asksOffice = /\b(hybrid|on ?site|onsite|in office|in person|offices?)\b/.test(label);
  if (asksRemote || asksOffice) {
    const yes = asksOffice
      ? models.includes('hybrid') || models.includes('onsite')
      : models.includes('remote');
    return yesNo(yes);
  }
  const names: Record<string, OptionTarget> = {
    remote: { text: 'Remote', patterns: [/\bremote\b/], fuzzy: false },
    hybrid: { text: 'Hybrid', patterns: [/\bhybrid\b/], fuzzy: false },
    onsite: { text: 'On-site', patterns: [/\b(on ?site|in office|in person)\b/], fuzzy: false },
  };
  const targets = models.map((m) => names[m]).filter((t): t is OptionTarget => t !== undefined);
  return isChoice(field) ? options(targets) : text(targets.map((t) => t.text).join(', '));
}

/** A box for the referrer's name, as opposed to "Were you referred? If so, who?". */
function asksForReferrer(label: string): boolean {
  return (
    /\b(name of|provide (their|the|his|her) name|referr?er s? name|who referred you)\b/.test(label) &&
    !/\b(have|were|are) you (been )?referred\b/.test(label)
  );
}
