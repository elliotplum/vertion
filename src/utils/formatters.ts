// Format byte counts for compact project summaries and file metadata.
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const kilobyte = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(kilobyte));
  return `${parseFloat((bytes / Math.pow(kilobyte, unitIndex)).toFixed(1))} ${sizes[unitIndex]}`;
}

// Backend timestamps are Unix seconds, while JavaScript dates use milliseconds.
export function formatDate(timestampSecs: number): string {
  if (!timestampSecs) return 'Unknown';

  const date = new Date(timestampSecs * 1000);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Keep comment labels consistent between waveform markers and the comment list.
export function formatTimestamp(timestampSecs: number): string {
  const mins = Math.floor(timestampSecs / 60);
  const secs = Math.floor(timestampSecs % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}
