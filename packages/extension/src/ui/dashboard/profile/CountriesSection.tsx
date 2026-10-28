import { CountryPicker } from '../controls/CountryPicker';
import type { SectionProps } from './section-props';
import { WorkAuthorizationCard } from './WorkAuthorizationCard';

/** Which countries you apply in, and your Work Authorization for each (design.md "Country-specific answers"). */
export function CountriesSection(props: SectionProps) {
  const { form, errors, onChange } = props;
  return (
    <section className="card" id="countries" data-testid="section-countries">
      <h2>Where you apply</h2>
      <p className="card-intro">
        A Fill picks your Work Authorization by the Posting’s country. When the country is unclear, the
        question goes to review with each country’s answer side by side.
      </p>
      <CountryPicker
        label="Countries you apply in"
        path="countries"
        error={errors['countries']}
        value={form.countries}
        onChange={(countries) => {
          onChange((f) => ({ ...f, countries }));
        }}
      />
      <div style={{ marginTop: 16 }}>
        {form.countries.map((country) => (
          <WorkAuthorizationCard key={country} country={country} {...props} />
        ))}
      </div>
    </section>
  );
}
