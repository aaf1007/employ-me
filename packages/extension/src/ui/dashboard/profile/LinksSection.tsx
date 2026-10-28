import { TextField } from '../controls/TextField';
import type { LinksForm } from '../profile-form';
import { fieldAt, type SectionProps } from './section-props';

export function LinksSection({ form, errors, prefilled, onChange }: SectionProps) {
  const at = fieldAt(errors, prefilled);
  const set = (patch: Partial<LinksForm>) => {
    onChange((f) => ({ ...f, links: { ...f.links, ...patch } }));
  };
  const { links } = form;
  return (
    <section className="card" id="links" data-testid="section-links">
      <h2>Links</h2>
      <div className="grid">
        <TextField
          label="LinkedIn"
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          {...at('links.linkedin')}
          value={links.linkedin}
          onChange={(v) => {
            set({ linkedin: v });
          }}
        />
        <TextField
          label="GitHub"
          type="url"
          placeholder="https://github.com/…"
          {...at('links.github')}
          value={links.github}
          onChange={(v) => {
            set({ github: v });
          }}
        />
        <TextField
          label="Portfolio or website"
          type="url"
          placeholder="https://"
          {...at('links.portfolio')}
          value={links.portfolio}
          onChange={(v) => {
            set({ portfolio: v });
          }}
        />
      </div>
    </section>
  );
}
