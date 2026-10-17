import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { MediaFile } from '../types/project';

interface ProjectBpm {
  path: string;
  bpm: number | null;
}

// Keep native dialog details outside the React coordinator while preserving cancel behavior.
export async function selectProjectFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Ableton Project / Bounce Directory',
  });

  return selected && typeof selected === 'string' ? selected : null;
}

// The Rust command remains the single source of truth for filesystem scanning.
export async function scanProjectFolder(folderPath: string): Promise<MediaFile[]> {
  return invoke<MediaFile[]>('scan_bounce_folder', { folderPath });
}

// BPM scanning is explicit because decompressing ALS XML is much more expensive than indexing files.
export async function scanProjectBpms(alsPaths: string[]): Promise<ProjectBpm[]> {
  return invoke<ProjectBpm[]>('scan_project_bpms', { alsPaths });
}
