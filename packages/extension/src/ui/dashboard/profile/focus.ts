/** Moves focus to the first input showing an error, once React has rendered the errors. */
export function focusFirstInvalid(): void {
  requestAnimationFrame(() => {
    const first = document.querySelector<HTMLElement>(
      '[data-invalid="true"] input, [data-invalid="true"] select, [data-invalid="true"] textarea',
    );
    first?.scrollIntoView({ block: 'center' });
    first?.focus({ preventScroll: true });
  });
}
