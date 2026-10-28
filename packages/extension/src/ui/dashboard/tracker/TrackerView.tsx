import { useMemo, useState } from 'react';
import type { DataStore, Topic } from '../../../storage';
import { ErrorNotice } from '../common/ErrorNotice';
import { PageHeader } from '../common/PageHeader';
import { useStoreQuery } from '../data/use-store-query';
import { plural } from '../format';
import { AddApplicationForm } from './AddApplicationForm';
import { ApplicationDetail } from './ApplicationDetail';
import { ApplicationTable } from './ApplicationTable';
import { CsvExportLink } from './CsvExportLink';
import { CsvImport } from './CsvImport';
import { companies, filterApplications, NO_FILTER, statusCounts, type TrackerFilter } from './filter';
import { TrackerFilters } from './TrackerFilters';

const APPLICATIONS: readonly Topic[] = ['applications'];
const loadApplications = (store: DataStore) => store.listApplications();

type Panel = 'none' | 'add' | 'import';

/** Your Applications (glossary "Tracker"). */
export function TrackerView() {
  const query = useStoreQuery(APPLICATIONS, loadApplications);
  const [filter, setFilter] = useState<TrackerFilter>(NO_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');

  const all = useMemo(() => (query.result?.ok === true ? query.result.value : []), [query.result]);
  const shown = useMemo(() => filterApplications(all, filter), [all, filter]);
  const counts = useMemo(() => statusCounts(all), [all]);
  const companyList = useMemo(() => companies(all), [all]);
  const selectedExists = selected !== null && all.some((a) => a.id === selected);

  return (
    <>
      <PageHeader
        title="Tracker"
        intro={
          all.length === 0
            ? 'Every Application you submit appears here, with a Snapshot of what you sent.'
            : `${plural(all.length, 'Application')}: ${String(counts.interviewing)} interviewing, ${plural(counts.offer, 'offer')}.`
        }
        actions={
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPanel('add');
              }}
            >
              Add Application
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPanel('import');
              }}
            >
              Import CSV
            </button>
            <CsvExportLink applications={all} />
          </>
        }
      />
      <div className="stack">
        {panel === 'add' ? (
          <AddApplicationForm
            onDone={(id) => {
              setPanel('none');
              if (id !== null) {
                setFilter(NO_FILTER);
                setSelected(id);
              }
            }}
          />
        ) : null}
        {panel === 'import' ? (
          <CsvImport
            onDone={() => {
              setPanel('none');
            }}
          />
        ) : null}

        {query.result === null ? (
          <p className="muted">Loading…</p>
        ) : !query.result.ok ? (
          <ErrorNotice error={query.result.error} title="Your Applications couldn’t be loaded." />
        ) : all.length === 0 ? (
          <div className="card empty" data-testid="tracker-empty">
            <p>No Applications yet.</p>
            <p className="small">
              When you submit a form you filled with employ-me, it’s recorded here. You can also add one by
              hand or import a CSV.
            </p>
          </div>
        ) : (
          <div className={selectedExists ? 'tracker with-detail' : 'tracker'}>
            <div className="card stack" style={{ gap: 12 }}>
              <TrackerFilters
                filter={filter}
                onChange={setFilter}
                counts={counts}
                total={all.length}
                companies={companyList}
              />
              {shown.length === 0 ? (
                <p className="empty" data-testid="tracker-no-match">
                  No Applications match.{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setFilter(NO_FILTER);
                    }}
                  >
                    Clear filters
                  </button>
                </p>
              ) : (
                <ApplicationTable applications={shown} selected={selected} onSelect={setSelected} />
              )}
            </div>
            {selectedExists ? (
              <ApplicationDetail
                key={selected}
                id={selected}
                onClose={() => {
                  setSelected(null);
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
