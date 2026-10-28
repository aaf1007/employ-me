import { normalizeLabel } from '@employ-me/core';
import { useState } from 'react';
import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useStoreQuery } from '../data/use-store-query';
import { RefusedSavedAnswerCard } from './RefusedSavedAnswerCard';
import { SavedAnswerCard } from './SavedAnswerCard';
import { SavedAnswerEditor } from './SavedAnswerEditor';

const SAVED: readonly Topic[] = ['savedAnswers'];
const loadSaved = (store: DataStore) => store.listSavedAnswers();
const loadRefused = (store: DataStore) => store.listRefusedSavedAnswers();

export function SavedAnswersView() {
  const saved = useStoreQuery(SAVED, loadSaved);
  const refused = useStoreQuery(SAVED, loadRefused);
  const quarantined = refused.result?.ok === true ? refused.result.value : [];
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const wanted = normalizeLabel(search);
  const all = saved.result?.ok === true ? saved.result.value : [];
  const shown = [...all]
    .reverse()
    .filter(
      (s) =>
        wanted === '' ||
        normalizeLabel(s.question).includes(wanted) ||
        normalizeLabel(s.answer).includes(wanted) ||
        Object.keys(s.employerOverrides).some((employer) => employer.includes(wanted)),
    );

  return (
    <>
      <PageHeader
        title="Saved Answers"
        intro="Answers you accepted. A question that matches word for word (ignoring case and punctuation) is filled with your answer; a similar one goes to Needs your review."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setAdding(true);
            }}
          >
            Add a Saved Answer
          </button>
        }
      />
      <div className="stack">
        {adding ? (
          <section className="card">
            <h2>New Saved Answer</h2>
            <SavedAnswerEditor
              onDone={() => {
                setAdding(false);
              }}
            />
          </section>
        ) : null}
        {quarantined.length === 0 ? null : (
          <ul
            className="stack"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
            data-testid="refused-saved-answer-list"
          >
            {quarantined.map((r) => (
              <RefusedSavedAnswerCard key={r.id} refused={r} />
            ))}
          </ul>
        )}
        <input
          className="input"
          type="search"
          placeholder="Search questions, answers and companies"
          aria-label="Search Saved Answers"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        {saved.result === null ? (
          <p className="muted">Loading…</p>
        ) : !saved.result.ok ? (
          <ErrorNotice error={saved.result.error} />
        ) : all.length === 0 ? (
          <p className="empty card">No Saved Answers yet. Drafts you accept during a Fill are kept here.</p>
        ) : shown.length === 0 ? (
          <p className="empty">Nothing matches “{search}”.</p>
        ) : (
          <ul
            className="stack"
            style={{ listStyle: 'none', padding: 0, margin: 0 }}
            data-testid="saved-answer-list"
          >
            {shown.map((s) => (
              <SavedAnswerCard key={s.id} saved={s} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
