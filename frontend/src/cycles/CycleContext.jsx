import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const CycleContext = createContext(null);
const storageKey = 'selectedCycleId';
const SETUP_ROLES = new Set(['crcs_superadmin']);
const HISTORY_ROLES = new Set(['crcs_superadmin', 'crcs_coordinator', 'hod', 'dean', 'school_office']);

function requestedCycleId() {
  return new URLSearchParams(window.location.search).get('cycle') || localStorage.getItem(storageKey) || null;
}

function hasAnyRole(user, roles) {
  return user?.roles?.some((assignment) => roles.has(assignment.role));
}

function visibleCyclesFor(user, cycles) {
  if (hasAnyRole(user, SETUP_ROLES)) return cycles;
  const canViewHistory = hasAnyRole(user, HISTORY_ROLES);
  return cycles.filter((cycle) => cycle.status === 'open' || (canViewHistory && cycle.status === 'closed'));
}

export function CycleProvider({ children }) {
  const { user } = useAuth();
  const [requestedId, setRequestedId] = useState(requestedCycleId);
  const { data: cycles = [], isLoading, error } = useQuery({
    queryKey: ['available-cycles', user?.id],
    queryFn: () => api('/cycles'),
    enabled: !!user && !user.isPlatformAdmin,
    staleTime: 60_000,
  });
  const visibleCycles = useMemo(() => visibleCyclesFor(user, cycles), [user, cycles]);
  const selectedCycle = visibleCycles.find((cycle) => cycle.id === requestedId) ?? visibleCycles.find((cycle) => cycle.status === 'open') ?? visibleCycles[0] ?? null;

  useEffect(() => {
    if (isLoading || !requestedId || visibleCycles.some((cycle) => cycle.id === requestedId)) return;
    if (selectedCycle) selectCycle(selectedCycle.id);
    else {
      localStorage.removeItem(storageKey);
      const url = new URL(window.location.href);
      url.searchParams.delete('cycle');
      window.history.replaceState({}, '', url);
      setRequestedId(null);
    }
  }, [visibleCycles, isLoading, requestedId, selectedCycle?.id]);

  useEffect(() => {
    const syncFromUrl = () => setRequestedId(requestedCycleId());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  function selectCycle(id) {
    if (!visibleCycles.some((cycle) => cycle.id === id)) return;
    localStorage.setItem(storageKey, id);
    const url = new URL(window.location.href);
    url.searchParams.set('cycle', id);
    window.history.replaceState({}, '', url);
    setRequestedId(id);
  }

  const value = useMemo(() => ({
    cycles: visibleCycles,
    allCycles: cycles,
    selectedCycle,
    selectedCycleId: selectedCycle?.id ?? null,
    selectCycle,
    isLoading,
    error,
    canViewDraftCycles: hasAnyRole(user, SETUP_ROLES),
    canViewCycleHistory: hasAnyRole(user, HISTORY_ROLES),
  }), [visibleCycles, cycles, selectedCycle, isLoading, error, user]);
  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

export function useCycle() {
  const context = useContext(CycleContext);
  if (!context) throw new Error('useCycle must be used inside CycleProvider');
  return context;
}
