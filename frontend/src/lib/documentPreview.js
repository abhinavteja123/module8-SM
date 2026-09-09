const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx']);

// PDFs use the browser's built-in viewer. Word and PowerPoint files use the
// Office web viewer so opening a programme document does not force a download.
export function documentPreviewUrl(item) {
  const extension = item?.file_name?.split('.').pop()?.toLowerCase();
  if (OFFICE_EXTENSIONS.has(extension) && item?.url) return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(item.url)}`;
  return item?.url;
}
