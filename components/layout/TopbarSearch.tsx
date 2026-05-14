'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building, User, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, type LeadStatus } from '@/lib/types/domain';

interface CompanyHit {
  type?: 'company';
  id: string;
  name: string;
  domain: string | null;
  fit_score: number | null;
  status: LeadStatus;
}
interface ContactHit {
  type: 'contact';
  id: string;
  full_name: string | null;
  email: string | null;
  title: string | null;
  company_id: string;
  company_name: string | null;
}

type Hit =
  | (CompanyHit & { kind: 'company' })
  | (ContactHit & { kind: 'contact' });

export function TopbarSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ companies: CompanyHit[]; contacts: ContactHit[] }>({
    companies: [],
    contacts: [],
  });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced fetch
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults({ companies: [], contacts: [] });
      setActiveIndex(-1);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      const ctrl = new AbortController();
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => {
          setResults({ companies: j.companies ?? [], contacts: j.contacts ?? [] });
          setActiveIndex(-1);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return () => ctrl.abort();
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Build flat list for keyboard nav
  const hits: Hit[] = [
    ...results.companies.map((c) => ({ ...c, kind: 'company' as const })),
    ...results.contacts.map((c) => ({ ...c, kind: 'contact' as const })),
  ];

  function goTo(hit: Hit) {
    setOpen(false);
    setQ('');
    if (hit.kind === 'company') {
      router.push(`/leads/${hit.id}`);
    } else {
      router.push(`/leads/${hit.company_id}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && hits[activeIndex]) {
        e.preventDefault();
        goTo(hits[activeIndex]);
      } else if (q.trim().length >= 2) {
        // Fall back: jump to filtered leads list
        e.preventDefault();
        setOpen(false);
        router.push(`/leads?q=${encodeURIComponent(q.trim())}`);
        setQ('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && q.trim().length >= 2;
  const hasResults = hits.length > 0;
  let flatIdx = -1;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        placeholder="Search companies, contacts…"
        className="h-9 pl-9"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {loading && q.trim().length >= 2 && (
        <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-md border bg-popover shadow-lg">
          {!hasResults && !loading && (
            <div className="p-3 text-sm text-muted-foreground">
              No matches. <kbd className="rounded border bg-muted px-1 py-0.5 text-[10px]">Enter</kbd> to search /leads.
            </div>
          )}

          {results.companies.length > 0 && (
            <div>
              <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Companies
              </div>
              <ul>
                {results.companies.map((c) => {
                  flatIdx++;
                  const isActive = flatIdx === activeIndex;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => goTo({ ...c, kind: 'company' })}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                          isActive ? 'bg-mx-50' : 'hover:bg-muted/50',
                        )}
                      >
                        <Building className="h-3.5 w-3.5 shrink-0 text-mx-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{c.domain ?? '—'}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {c.fit_score !== null && (
                            <span className="rounded bg-mx-100 px-1.5 py-0.5 text-[10px] font-semibold text-mx-700">
                              {c.fit_score}
                            </span>
                          )}
                          <Badge variant="muted" className="text-[10px]">
                            {STATUS_LABELS[c.status]}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {results.contacts.length > 0 && (
            <div>
              <div className="border-b border-t bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contacts
              </div>
              <ul>
                {results.contacts.map((c) => {
                  flatIdx++;
                  const isActive = flatIdx === activeIndex;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => goTo({ ...c, kind: 'contact' })}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                          isActive ? 'bg-mx-50' : 'hover:bg-muted/50',
                        )}
                      >
                        <User className="h-3.5 w-3.5 shrink-0 text-mx-400" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.full_name || '(no name)'}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[c.title, c.company_name, c.email].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {hasResults && (
            <div className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
              <kbd className="rounded border bg-card px-1 py-0.5">↑↓</kbd> navigate ·{' '}
              <kbd className="rounded border bg-card px-1 py-0.5">Enter</kbd> open ·{' '}
              <kbd className="rounded border bg-card px-1 py-0.5">Esc</kbd> close
            </div>
          )}
        </div>
      )}
    </div>
  );
}
