import type { CountryCode, Posting, PostingKey } from '@employ-me/core';
import { collapse, readableText } from '../dom';
import { countriesIn } from './countries';
import { canonicalPostingUrl, genericPostingKey, postingKeyFromUrl } from './key';
import { isRecord, parseJsonText, text } from '../json';

/** What the page says about its Posting; every part optional. */
interface PageFacts {
  title?: string | undefined;
  company?: string | undefined;
  location?: string | undefined;
  country?: CountryCode | undefined;
  description?: string | undefined;
}

/**
 * Reads what the page itself shows about the Posting: the ATS's own markup,
 * then schema.org JobPosting JSON-LD. The public job APIs are fetched by the
 * extension's allowlisted network module, not here (CLAUDE.md "Hard rules").
 */
export function readPosting(doc: Document, url: URL): Posting | null {
  const key = postingKeyFromUrl(url) ?? embeddedKey(doc) ?? genericPostingKey(url);
  const facts = { ...fromJsonLd(doc), ...defined(fromMarkup(doc, key)) };
  const country = facts.country ?? soleCountry(facts.location);
  return {
    key,
    url: canonicalPostingUrl(url).href,
    ...(facts.title === undefined ? {} : { title: facts.title }),
    ...(facts.company === undefined ? {} : { company: facts.company }),
    ...(facts.location === undefined ? {} : { location: facts.location }),
    ...(country === undefined ? {} : { country }),
    ...(facts.description === undefined ? {} : { description: facts.description }),
  };
}

/** The one country a location names, or undefined when it names none or several. */
export function soleCountry(location: string | undefined): CountryCode | undefined {
  if (location === undefined) return undefined;
  const countries = countriesIn(location);
  return countries.length === 1 ? countries[0] : undefined;
}

/** A company page embedding a Greenhouse board: the iframe's `for=` and `token=` name the Posting. */
function embeddedKey(doc: Document): PostingKey | null {
  const frame = doc.querySelector('iframe#grnhse_iframe, iframe[src*="greenhouse.io/embed/job_app"]');
  const src = frame?.getAttribute('src');
  if (src === null || src === undefined) return null;
  try {
    return postingKeyFromUrl(new URL(src, doc.baseURI));
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function fromMarkup(doc: Document, key: PostingKey): PageFacts {
  switch (key.ats) {
    case 'greenhouse':
      return {
        title:
          textOf(doc, '.job__title h1', 'h1.app-title', '.job__title') ??
          /^Job Application for (.+) at .+$/.exec(collapse(doc.title))?.[1],
        location: textOf(doc, '.job__location', '.location'),
        company: /\bat (.+)$/.exec(collapse(doc.title))?.[1],
        description: textOf(doc, '.job__description', '#content'),
      };
    case 'lever':
      return {
        title: textOf(doc, '.posting-header h2', '.posting-headline h2'),
        location: textOf(doc, '.posting-categories .location', '.posting-category.location'),
        company:
          /^(.+?) logo$/.exec(doc.querySelector('.main-header-logo img')?.getAttribute('alt') ?? '')?.[1] ??
          /^(.+?) - /.exec(collapse(doc.title))?.[1],
        description: textOf(doc, '[data-qa="job-description"]'),
      };
    case 'ashby':
      return {
        title: /^(.+?) @ /.exec(collapse(doc.title))?.[1],
        company: /@ (.+)$/.exec(collapse(doc.title))?.[1],
      };
    case 'generic':
      return {};
  }
}

function fromJsonLd(doc: Document): PageFacts {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    // A broken JSON-LD block reads as null; the markup may still say enough.
    const posting = jobPostingIn(parseJsonText(script.textContent));
    if (posting === null) continue;
    const org = posting['hiringOrganization'];
    const locations = [posting['jobLocation']].flat().filter(isRecord);
    const addresses = locations.map((l) => l['address']).filter(isRecord);
    const location = addresses
      .map((a) =>
        [text(a['addressLocality']), text(a['addressRegion']), text(a['addressCountry'])]
          .filter(Boolean)
          .join(', '),
      )
      .filter((l) => l !== '')
      .join('; ');
    const countries = new Set(addresses.flatMap((a) => countriesIn(text(a['addressCountry']) ?? '')));
    const [onlyCountry] = countries;
    const description = text(posting['description']);
    return {
      title: text(posting['title']),
      company: isRecord(org) ? text(org['name']) : undefined,
      location: location === '' ? undefined : location,
      country: countries.size === 1 ? onlyCountry : undefined,
      description: description === undefined ? undefined : htmlToText(doc, description),
    };
  }
  return {};
}

function jobPostingIn(value: unknown): Record<string, unknown> | null {
  for (const item of [value, isRecord(value) ? value['@graph'] : undefined].flat()) {
    if (isRecord(item) && item['@type'] === 'JobPosting') return item;
  }
  return null;
}

/** HTML to readable text, parsed into a detached document: nothing runs and the page is untouched. */
function htmlToText(doc: Document, html: string): string {
  const parser = doc.defaultView === null ? new DOMParser() : new doc.defaultView.DOMParser();
  return readableText(parser.parseFromString(html, 'text/html').body);
}

/** The text of the first selector that matches something, in the order given. */
function textOf(doc: Document, ...selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = readableText(doc.querySelector(selector));
    if (value !== '') return value;
  }
  return undefined;
}

function defined(facts: PageFacts): PageFacts {
  return Object.fromEntries(Object.entries(facts).filter(([, value]) => value !== undefined && value !== ''));
}
