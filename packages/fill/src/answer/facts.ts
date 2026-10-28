import { normalizeLabel, type FieldType } from '@employ-me/core';
import { CALLING_CODES } from '../posting';
import type { ExtractedField } from '../types';
import { backgroundAnswer } from './background';
import { cityTarget, countryName, countryTarget, regionTarget } from './places';
import { isChoice, isOneOf, missing, option, text, yesNo, type Answer, type AnswerContext } from './types';
import { vocabTarget } from './vocab';

// Answers from the ordinary parts of the Profile: identity, contact, address
// and links here; background, preferences and screening in background.ts.

export function factAnswer(fieldType: FieldType, field: ExtractedField, ctx: AnswerContext): Answer | null {
  return identityAnswer(fieldType, field, ctx) ?? backgroundAnswer(fieldType, field, ctx);
}

const IDENTITY_TYPES = [
  'name.first',
  'name.last',
  'name.middle',
  'name.full',
  'name.preferred',
  'identity.over18',
  'contact.email',
  'phone.full',
  'phone.number',
  'phone.countryCode',
  'phone.type',
  'address.line1',
  'address.line2',
  'address.city',
  'address.postalCode',
  'address.region',
  'address.country',
  'address.full',
  'address.location',
  'link.linkedin',
  'link.github',
  'link.portfolio',
  'link.other',
] as const satisfies readonly FieldType[];

function identityAnswer(fieldType: FieldType, field: ExtractedField, ctx: AnswerContext): Answer | null {
  const { profile } = ctx;
  const legal = profile.identity?.legalName;
  const preferred = profile.identity?.preferredName;
  const address = profile.address;
  const phone = profile.contact?.phone;
  if (!isOneOf(fieldType, IDENTITY_TYPES)) return null;
  switch (fieldType) {
    case 'name.first':
      return legal === undefined ? missing('your name') : text(legal.first);
    case 'name.last':
      return legal === undefined ? missing('your name') : text(legal.last);
    case 'name.middle':
      return legal?.middle === undefined || legal.middle === ''
        ? missing('your middle name')
        : text(legal.middle);
    case 'name.full':
      return legal === undefined
        ? missing('your name')
        : text([legal.first, legal.middle, legal.last].filter(Boolean).join(' '));
    case 'name.preferred': {
      // Workday's "I have a preferred name" box, which shows the preferred-name fields.
      if (field.widget === 'checkbox') return yesNo(preferred !== undefined);
      const first = preferred?.first ?? legal?.first;
      if (first === undefined) return missing('your preferred name');
      const wantsFull = !/\bfirst\b/.test(normalizeLabel(field.label)) && preferred?.last !== undefined;
      return text(wantsFull ? `${first} ${preferred.last ?? ''}`.trim() : first);
    }
    case 'identity.over18':
      return profile.identity?.over18 === undefined
        ? missing('whether you are 18 or older')
        : yesNo(profile.identity.over18);
    case 'contact.email':
      return profile.contact === undefined ? missing('your email') : text(profile.contact.email);
    case 'phone.full':
      return phone === undefined
        ? missing('your phone number')
        : text(`${phone.countryCode} ${phone.number}`);
    case 'phone.number':
      return phone === undefined ? missing('your phone number') : text(phone.number);
    case 'phone.countryCode': {
      if (phone === undefined) return missing('your phone number');
      const home = address?.country;
      const country =
        home !== undefined && CALLING_CODES[home] === phone.countryCode
          ? home
          : Object.keys(CALLING_CODES).find((c) => CALLING_CODES[c] === phone.countryCode);
      return country === undefined ? text(phone.countryCode) : option(countryTarget(country));
    }
    case 'phone.type': {
      const target = phone === undefined ? null : vocabTarget('phoneType', phone.type);
      return target === null ? missing('your phone type') : option(target);
    }
    case 'address.line1':
      return address === undefined ? missing('your address') : text(address.line1);
    case 'address.line2':
      return address?.line2 === undefined || address.line2 === ''
        ? missing('an address line 2')
        : text(address.line2);
    case 'address.city':
      return address === undefined ? missing('your address') : text(address.city);
    case 'address.postalCode':
      return address?.postalCode === undefined ? missing('your postal code') : text(address.postalCode);
    case 'address.region':
      return address?.region === undefined
        ? missing('your province or state')
        : option(regionTarget(address.country, address.region));
    case 'address.country':
      return address === undefined ? missing('your address') : option(countryTarget(address.country));
    case 'address.full':
      return address === undefined
        ? missing('your address')
        : text(
            [
              address.line1,
              address.line2,
              address.city,
              address.region,
              address.postalCode,
              countryName(address.country),
            ]
              .filter(Boolean)
              .join(', '),
          );
    case 'address.location': {
      if (address === undefined) return missing('your address');
      if (isChoice(field)) return option(cityTarget(address.city, address.country, address.region));
      return text([address.city, address.region, countryName(address.country)].filter(Boolean).join(', '));
    }
    case 'link.linkedin':
      return profile.links.linkedin === undefined
        ? missing('your LinkedIn URL')
        : text(profile.links.linkedin);
    case 'link.github':
      return profile.links.github === undefined ? missing('your GitHub URL') : text(profile.links.github);
    case 'link.portfolio':
      return profile.links.portfolio === undefined
        ? missing('your portfolio URL')
        : text(profile.links.portfolio);
    case 'link.other':
      return profile.links.portfolio === undefined ? missing('a website URL') : text(profile.links.portfolio);
  }
}
