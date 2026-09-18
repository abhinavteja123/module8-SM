import { useEffect, useState } from 'react';
import { Dialog } from './ui/dialog.jsx';
import { documentPreviewUrl } from '../lib/documentPreview.js';

// Shared in-app preview for any document/PDF link across the app - opens as a
// popup Dialog instead of navigating to a new tab. `item` needs at least
// `{ title | file_name, url }`.
export function DocumentPreviewModal({ item, onClose }) {
  const previewUrl = documentPreviewUrl(item);
  const open = Boolean(item && previewUrl);
  // Keep the last item rendered while the dialog's exit transition plays, so the
  // panel doesn't flash empty for the ~200ms fade-out after `item` is cleared.
  const [lastItem, setLastItem] = useState(item);
  useEffect(() => { if (open) setLastItem(item); }, [open, item]);
  const shown = open ? item : lastItem;

  return (
    <Dialog open={open} onClose={onClose} title={shown ? (shown.title ?? shown.file_name) : undefined} size="xl">
      {shown && (
        <iframe
          title={`Preview: ${shown.title ?? shown.file_name}`}
          src={documentPreviewUrl(shown)}
          className="min-h-[60vh] w-full rounded-xl bg-slate-100"
        />
      )}
    </Dialog>
  );
}
