// The made-up person the live harness applies as. Nothing here is anyone's
// real data (CODING_STANDARDS.md "Privacy"): an example.com email, a 555
// phone number, invented employers and street. A Canadian citizen living in
// Vancouver who applies in the US and Canada, needs sponsorship for the US,
// and declines every Self-ID question.

export const PERSONA = {
  first: 'Riley',
  last: 'Gagnon',
  email: 'riley.gagnon@example.com',
  phone: { countryCode: '+1', number: '604 555 0187', type: 'mobile' },
  address: {
    line1: '1200 Example Ave',
    city: 'Vancouver',
    region: 'BC',
    postalCode: 'V6B 1A1',
    country: 'CA',
  },
  links: {
    linkedin: 'https://www.linkedin.com/in/riley-gagnon-example',
    github: 'https://github.com/riley-gagnon-example',
    portfolio: '',
  },
  work: [
    {
      employer: 'Fernwood Software',
      title: 'Senior Software Engineer',
      location: 'Vancouver, BC',
      start: '2022-03',
      end: '',
      bullets: [
        'Lead a team of four building the payments API in TypeScript and Go, serving 2,000 merchants.',
        'Cut checkout latency by 35% by moving card authorization to an event-driven queue on AWS.',
        'Run the on-call rotation and wrote the incident review process the team uses today.',
      ],
    },
    {
      employer: 'Lakeshore Data',
      title: 'Software Engineer',
      location: 'Toronto, ON',
      start: '2019-07',
      end: '2022-02',
      bullets: [
        'Built Python data pipelines on PostgreSQL and Kubernetes that load 40 million rows a day.',
        'Shipped the React dashboard customers use to schedule and monitor their imports.',
      ],
    },
  ],
  education: {
    school: 'University of British Columbia',
    degree: 'BASc',
    level: 'bachelor',
    discipline: 'Computer Engineering',
    start: '2015-09',
    end: '2019-05',
  },
  skills: ['TypeScript', 'Go', 'Python', 'React', 'PostgreSQL', 'AWS', 'Kubernetes'],
  languages: [
    { language: 'English', proficiency: 'native' },
    { language: 'French', proficiency: 'professionalWorking' },
  ],
} as const;

/** The synthetic Resume, as HTML; the setup spec prints it to a PDF with Chromium. */
export function resumeHtml(): string {
  const p = PERSONA;
  const jobs = p.work
    .map(
      (job) => `<h3>${job.title}, ${job.employer}</h3>
<p class="meta">${job.location} · ${job.start.replace('-', '/')} – ${job.end === '' ? 'Present' : job.end.replace('-', '/')}</p>
<ul>${job.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul>`,
    )
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${p.first} ${p.last}</title>
<style>
body { font: 11pt Helvetica, Arial, sans-serif; margin: 36px 48px; color: #111; }
h1 { margin: 0; font-size: 22pt; } h2 { font-size: 12pt; border-bottom: 1px solid #999; margin-top: 18px; }
h3 { font-size: 11pt; margin: 10px 0 0; } .meta { margin: 2px 0; color: #444; } ul { margin: 4px 0; }
</style></head><body>
<h1>${p.first} ${p.last}</h1>
<p class="meta">${p.address.city}, ${p.address.region}, Canada · ${p.email} · ${p.phone.countryCode} ${p.phone.number}</p>
<p class="meta">${p.links.linkedin} · ${p.links.github}</p>
<h2>Experience</h2>
${jobs}
<h2>Education</h2>
<h3>${p.education.degree}, ${p.education.discipline}, ${p.education.school}</h3>
<p class="meta">Vancouver, BC · ${p.education.start.replace('-', '/')} – ${p.education.end.replace('-', '/')}</p>
<h2>Skills</h2>
<p>${p.skills.join(', ')}</p>
<h2>Languages</h2>
<p>English (native), French (professional working proficiency)</p>
</body></html>`;
}
