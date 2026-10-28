import { AddressSection } from '../profile/AddressSection';
import { ContactSection } from '../profile/ContactSection';
import { EducationSection } from '../profile/EducationSection';
import { IdentitySection } from '../profile/IdentitySection';
import { LinksSection } from '../profile/LinksSection';
import type { SectionProps } from '../profile/section-props';
import { SkillsSection } from '../profile/SkillsSection';
import { WorkHistorySection } from '../profile/WorkHistorySection';

/** Step 2: you check every field the Provider pre-filled (design.md "Setup"). */
export function ReviewStep({ providerName, ...props }: SectionProps & { readonly providerName: string }) {
  const count = props.prefilled.size;
  return (
    <div className="stack" data-testid="step-review">
      <div className="notice notice-warn">
        <strong>Check every field.</strong>
        <p>
          {count === 0
            ? 'Fill in what applies to you. Anything you leave empty is reported as “not in your Profile” when a form asks for it.'
            : `${providerName} filled in the highlighted fields from your Resume. It can be wrong, so check each one and correct it.`}
        </p>
      </div>
      <IdentitySection {...props} />
      <ContactSection {...props} />
      <AddressSection {...props} />
      <LinksSection {...props} />
      <WorkHistorySection {...props} />
      <EducationSection {...props} />
      <SkillsSection {...props} />
    </div>
  );
}
