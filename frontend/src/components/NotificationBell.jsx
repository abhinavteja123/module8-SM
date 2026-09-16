import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const ROUTE_BY_ENTITY = {
  research_application: '/student/applications',
  opportunity_application: '/student/applications',
  self_internship: '/student/applications',
  document: '/student/documents',
  report_deadline: '/student/documents',
  // Written only by the analytics-alert background worker, only to
  // crcs_superadmin recipients — route to the page CRCS actually acts on,
  // not a generic analytics landing page.
  capacity_risk: '/crcs/mentor-allocations',
  pending_reviews: '/crcs/approvals',
  overdue_reports: '/crcs/analytics',
  // Older rows written before this fix still carry the generic type.
  internship_cycle: '/crcs/analytics',
};

function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: unread } = useQuery({ queryKey: ['notifications-unread-count'], queryFn: () => api('/notifications/unread-count'), refetchInterval: 30_000 });
  const { data: notifications = [] } = useQuery({ queryKey: ['notifications'], queryFn: () => api('/notifications'), enabled: open });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }); queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }); };
  const markRead = useMutation({ mutationFn: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }), onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }), onSuccess: invalidate });
  const count = unread?.count ?? 0;

  const openNotification = (notification) => {
    if (!notification.is_read) markRead.mutate(notification.id);
    setOpen(false);
    navigate(ROUTE_BY_ENTITY[notification.related_entity_type] ?? '/');
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Notifications" onClick={() => setOpen((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-indigo-50 hover:text-indigo-700">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.6-2.1a2 2 0 0 1-.4-1.2V11a6 6 0 1 0-12 0v2.7a2 2 0 0 1-.4 1.2L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" /></svg>
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="font-bold text-slate-900">Notifications</p>
              {count > 0 && <button type="button" onClick={() => markAllRead.mutate()} className="text-xs font-semibold text-indigo-700 hover:underline">Mark all read</button>}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!notifications.length ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
              ) : notifications.map((notification) => (
                <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`block w-full border-b border-slate-50 px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${notification.is_read ? '' : 'bg-indigo-50/60'}`}>
                  <div className="flex items-start gap-2">
                    {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                    <div className="min-w-0">
                      <p className={`text-sm ${notification.is_read ? 'font-medium text-slate-700' : 'font-bold text-slate-950'}`}>{notification.title}</p>
                      {notification.body && <p className="mt-0.5 truncate text-xs text-slate-500">{notification.body}</p>}
                      <p className="mt-1 text-[11px] text-slate-400">{timeAgo(notification.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
