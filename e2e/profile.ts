import { profileSchema, savedAnswerSchema, type ProfileInput } from '@employ-me/core';

// The test Profile every fill spec uses. Obviously fake (CODING_STANDARDS.md
// "Privacy"). It lives in Toronto, may work in Canada, needs sponsorship for
// the US and the UK, and has Self-ID Answers that are not all "decline", so
// the specs prove each one lands on the form's own wording.

const input: ProfileInput = {
  schemaVersion: 1,
  identity: { legalName: { first: 'Sam', last: 'Lee' }, preferredName: { first: 'Sammy' }, over18: true },
  contact: {
    email: 'sam.lee@example.com',
    phone: { countryCode: '+1', number: '416 555 0123', type: 'mobile' },
  },
  address: { line1: '100 Queen St W', city: 'Toronto', region: 'ON', postalCode: 'M5H 2N2', country: 'CA' },
  links: {
    linkedin: 'https://www.linkedin.com/in/sam-lee-example',
    github: 'https://github.com/sam-lee-example',
    portfolio: 'https://sam-lee.example.com',
  },
  countries: ['CA', 'US', 'GB'],
  workAuthorization: {
    CA: { citizenships: ['CA'], authorizedNow: true, status: 'Citizen', sponsorship: 'no' },
    US: {
      citizenships: ['CA'],
      authorizedNow: false,
      status: 'TN eligible',
      sponsorship: 'yes',
      usPerson: false,
    },
    GB: { citizenships: ['CA'], authorizedNow: false, sponsorship: 'yes' },
  },
  preferences: {
    relocation: true,
    workModels: ['hybrid', 'remote'],
    startDate: '2027-01-04',
    noticePeriod: { amount: 2, unit: 'weeks' },
    salary: {
      CA: { currency: 'CAD', min: 120000, max: 140000, period: 'year' },
      US: { currency: 'USD', min: 150000, max: 170000, period: 'year' },
    },
  },
  background: {
    workHistory: [
      {
        id: 'w1',
        employer: 'Northwind Analytics',
        title: 'Software Engineer',
        location: 'Toronto, ON',
        startDate: '2023-05',
        current: true,
      },
      {
        id: 'w2',
        employer: 'Contoso Labs',
        title: 'Software Engineering Intern',
        startDate: '2022-01',
        endDate: '2022-08',
      },
    ],
    education: [
      {
        id: 'e1',
        school: 'University of Waterloo',
        degree: 'BMath',
        degreeLevel: 'bachelor',
        discipline: 'Computer Science',
        startDate: '2018-09',
        endDate: '2023-04',
        gpa: { value: 3.7, scale: 4 },
      },
      {
        id: 'e2',
        school: 'University of Toronto',
        degree: 'MEng',
        degreeLevel: 'master',
        discipline: 'Computer Engineering',
        startDate: '2023-09',
        endDate: '2025-04',
      },
    ],
    skills: [{ name: 'TypeScript' }, { name: 'React' }, { name: 'Python' }],
    languages: [
      { language: 'English', proficiency: 'native' },
      { language: 'French', proficiency: 'professionalWorking' },
    ],
  },
  selfId: {
    US: {
      sex: 'male',
      hispanicLatino: 'no',
      race: 'asian',
      veteran: 'notProtectedVeteran',
      disability: 'no',
    },
    CA: { genderIdentity: 'man', indigenous: 'no', visibleMinority: 'yes', disability: 'no' },
  },
  screening: {
    howHeard: 'Company website',
    referred: false,
    workedHereBefore: { mongodb: false, spotify: false, geotab: false },
    backgroundCheck: true,
    nonCompete: false,
  },
};

export const TEST_PROFILE = profileSchema.parse(input);

export const TEST_SAVED_ANSWERS = [
  savedAnswerSchema.parse({
    id: 's1',
    question: 'What frameworks/libraries are you most proficient in?',
    answer: 'React, Node.js and Django.',
    source: 'manual',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
  }),
  savedAnswerSchema.parse({
    id: 's2',
    question: 'Additional Information',
    answer: 'Happy to share more about my projects on request.',
    source: 'manual',
    createdAt: '2026-10-28T00:00:00Z',
    updatedAt: '2026-10-28T00:00:00Z',
  }),
];

/** The Resume file the specs attach. A tiny valid PDF, generated, with no personal data. */
export const TEST_RESUME = {
  meta: {
    id: 'r1',
    label: 'General',
    fileName: 'sam-lee-resume.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 320,
    addedAt: '2026-10-28T00:00:00Z',
    isDefault: true,
  },
  pdf: '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
} as const;
