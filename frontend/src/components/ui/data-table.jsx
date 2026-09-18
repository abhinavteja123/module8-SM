import { useMemo, useState } from 'react';
import { CaretUp, CaretDown, MagnifyingGlass } from '@phosphor-icons/react';

/**
 * Brutalist-register data grid: square corners, hairline rules, mono numeric cells.
 * columns: [{ key, header, render?(row), numeric?, sortable? }]
 */
export function DataTable({ columns, rows, searchable = true, pageSize = 25, getRowKey = (r, i) => r.id ?? i }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(null); // { key, dir }
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((row) => columns.some((c) => String(row[c.key] ?? '').toLowerCase().includes(q)));
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (key) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  return (
    <div className="rounded-none border border-ink/15 bg-white">
      {searchable && (
        <div className="flex items-center gap-2 border-b border-ink/15 bg-slate-50 px-3 py-2.5">
          <MagnifyingGlass size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search..."
            className="w-full max-w-xs bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
          />
          <span className="ml-auto font-mono text-xs text-slate-500">{sorted.length} rows</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-grid">
          <thead className="sticky top-0">
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  {c.sortable !== false ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === 'asc' ? <CaretUp size={11} /> : <CaretDown size={11} />) : null}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={getRowKey(row, i)} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : ''}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="py-8 text-center text-slate-400">No records found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-ink/15 px-3 py-2.5 font-mono text-xs text-slate-600">
          <span>Page {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border border-ink/15 px-2 py-1 disabled:opacity-30">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="rounded border border-ink/15 px-2 py-1 disabled:opacity-30">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
