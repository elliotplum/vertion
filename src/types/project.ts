// The active screen determines which top-level workflow the application renders.
export type AppView = 'explorer' | 'dashboard' | 'project-history' | 'universal-recent';

// MediaFile is the normalized file shape returned by the Tauri directory scan.
export interface MediaFile {
  name: string;
  path: string;
  file_type: 'project' | 'audio';
  size: number;
  modified: number;
  created: number;
  bpm: number | null;
}

// ScoredAudioFile keeps both the association decision and the evidence behind it.
export interface ScoredAudioFile {
  file: MediaFile;
  confidence: number;
  signals: {
    projectSavedRecently: boolean;
    bounceCreatedRecently: boolean;
    sameFolder: boolean;
    similarNaming: boolean;
  };
  tier: 'auto' | 'confirm' | 'manual';
  isInternalSample: boolean;
}

// ProjectGroup is the view model consumed by the explorer and history screens.
export interface ProjectGroup {
  id: string;
  projectName: string;
  mainProjects: MediaFile[];
  backups: MediaFile[];
  activeAudioFiles: ScoredAudioFile[];
  archivedAudioFiles: ScoredAudioFile[];
  totalSize: number;
  lastModified: number;
  created: number;
  bpm: number | null;
}

// Comments are kept in memory and anchored to a precise audio timestamp.
export interface CommentItem {
  id: string;
  timestampSecs: number;
  timeStr: string;
  text: string;
}
