import { AddressSection } from './AddressSection';
import { ContactSection } from './ContactSection';
import { CountriesSection } from './CountriesSection';
import { EducationSection } from './EducationSection';
import { IdentitySection } from './IdentitySection';
import { LinksSection } from './LinksSection';
import { PreferencesSection } from './PreferencesSection';
import { ScreeningSection } from './ScreeningSection';
import type { SectionProps } from './section-props';
import { SelfIdSection } from './SelfIdSection';
import { SkillsSection } from './SkillsSection';
import { WorkHistorySection } from './WorkHistorySection';

const JUMP = [
  ['identity', 'Identity'],
  ['contact', 'Contact'],
  ['address', 'Address'],
  ['links', 'Links'],
  ['countries', 'Where you apply'],
  ['preferences', 'Preferences'],
  ['work-history', 'Work history'],
  ['education', 'Education'],
  ['skills', 'Skills'],
  ['screening', 'Screening'],
  ['self-id', 'Self-ID'],
] as const;

/** The whole Profile, section by section, with links to jump between them. */
export function ProfileSections(props: SectionProps) {
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      <nav className="chips" aria-label="Profile sections">
        {JUMP.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="chip"
            onClick={() => {
              jump(id);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <IdentitySection {...props} />
      <ContactSection {...props} />
      <AddressSection {...props} />
      <LinksSection {...props} />
      <CountriesSection {...props} />
      <PreferencesSection {...props} />
      <WorkHistorySection {...props} />
      <EducationSection {...props} />
      <SkillsSection {...props} />
      <ScreeningSection {...props} />
      <SelfIdSection {...props} />
    </>
  );
}
