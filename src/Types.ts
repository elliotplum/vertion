export type ProgressionStatus = 'in_progress' | 'ideas' | 'unreleased' | 'released' | 'archived';

export interface Project {
  id: string;
  name: string;
  path?: string;
  status: ProgressionStatus;
  lastModified: string;
  lastModifiedAt?: number;
  createdAt?: number;
  fileSize: string;
}