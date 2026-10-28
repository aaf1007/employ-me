import type { ReactNode } from 'react';

export interface ShownError {
  readonly reason: string;
  readonly message: string;
  readonly fix: string;
}

/** What went wrong and what you can do about it (CODING_STANDARDS.md "Errors"). */
export function ErrorNotice({
  error,
  title,
  children,
}: {
  readonly error: ShownError;
  readonly title?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="notice notice-error" role="alert" data-testid="error-notice" data-reason={error.reason}>
      <strong>{title ?? error.message}</strong>
      {title === undefined ? null : <p>{error.message}</p>}
      <p data-testid="error-fix">{withCode(error.fix)}</p>
      {children === undefined ? null : (
        <div className="row" style={{ marginTop: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Shows `commands` in backticks as code, as HELPER_ERROR_FIXES writes them. */
function withCode(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) =>
      part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part,
    );
}
