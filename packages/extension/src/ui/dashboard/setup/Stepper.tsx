import { STEPS, type StepId } from './steps';

export function Stepper({ current }: { readonly current: StepId }) {
  const at = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="stepper" aria-label="Setup steps">
      {STEPS.map((step, index) => (
        <li key={step.id} aria-current={index === at ? 'step' : undefined} data-done={index < at}>
          {String(index + 1)}. {step.title}
        </li>
      ))}
    </ol>
  );
}
