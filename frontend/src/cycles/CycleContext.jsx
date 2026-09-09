import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const CycleContext = createContext(null);
const storageKey = 'selectedCycleId';

function requestedCycleId() {
  return new URLSearchParams(window.location.search).get('cycle') || localStorage.getItem(storageKey) || null;
}

export function CycleProvider({ children }) {
  const { user } = useAuth();
  const [requestedId, setRequestedId] = useState(requestedCycleId);
  const { data: cycles = [], isLoading, error } = useQuery({
    queryKey: ['available-cycles', user?.id],
    queryFn: () => api('/cycles'),
    enabled: !!user,
    staleTime: 60_000,
  });
  const selectedCycle = cycles.find((cycle) => cycle.id === requestedId) ?? cycles.find((cycle) => cycle.status === 'open') ?? cycles[0] ?? null;

  useEffect(() => {
    const syncFromUrl = () => setRequestedId(requestedCycleId());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  function selectCycle(id) {
    localStorage.setItem(storageKey, id);
    const url = new URL(window.location.href);
    url.searchParams.set('cycle', id);
    window.history.replaceState({}, '', url);
    setRequestedId(id);
  }

  const value = useMemo(() => ({ cycles, selectedCycle, selectedCycleId: selectedCycle?.id ?? null, selectCycle, isLoading, error }), [cycles, selectedCycle, isLoading, error]);
  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

export function useCycle() {
  const context = useContext(CycleContext);
  if (!context) throw new Error('useCycle must be used inside CycleProvider');
  return context;
}
