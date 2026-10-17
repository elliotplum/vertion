import { useEffect, useState } from 'react';
import type { Project, ProgressionStatus } from '../Types';

const STORAGE_KEY = 'vertion.dashboard-projects.v1';

export interface ImportedProject {
  id: string;
  name: string;
  path: string;
  lastModified: string;
  lastModifiedAt?: number;
  createdAt?: number;
  fileSize: string;
}

function isBackupDirectory(path: string | undefined): boolean {
  const pathParts = path?.split(/[\\/]/).filter(Boolean) ?? [];
  return pathParts[pathParts.length - 1]?.toLowerCase() === 'backup';
}

function loadProjects(): Project[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((project): project is Project => {
      if (!project || typeof project !== 'object') return false;
      const candidate = project as Partial<Project>;
      return typeof candidate.id === 'string'
        && typeof candidate.name === 'string'
        && typeof candidate.status === 'string'
        && ['in_progress', 'ideas', 'unreleased', 'released', 'archived'].includes(candidate.status)
        && typeof candidate.lastModified === 'string'
        && typeof candidate.fileSize === 'string'
        && !(candidate.status === 'archived' && isBackupDirectory(candidate.path));
    });
  } catch {
    return [];
  }
}

export function useDashboardProjects() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  const addProject = (name: string, path?: string) => {
    const now = new Date().toLocaleString();
    const nowTimestamp = Date.now();
    const project: Project = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      path: path?.trim() || undefined,
      status: 'ideas',
      lastModified: now,
      lastModifiedAt: nowTimestamp,
      createdAt: nowTimestamp,
      fileSize: path ? 'Linked project' : 'Idea',
    };
    setProjects((current) => [...current, project]);
  };

  const importProjects = (imports: ImportedProject[]) => {
    setProjects((current) => {
      const importedNames = new Set(imports.map((project) => project.name.trim().toLowerCase()));
      const retainedProjects = current.filter((project) => !(
        project.status === 'archived'
        && isBackupDirectory(project.path)
        && importedNames.has(project.name.trim().toLowerCase())
      ));
      const importsByPath = new Map(imports.map((project) => [project.path, project]));
      const refreshedProjects = retainedProjects.map((project) => {
        const scannedProject = project.path ? importsByPath.get(project.path) : undefined;
        if (!scannedProject || !scannedProject.lastModifiedAt) return project;

        return {
          ...project,
          lastModified: scannedProject.lastModified,
          lastModifiedAt: scannedProject.lastModifiedAt,
          createdAt: scannedProject.createdAt ?? project.createdAt,
          fileSize: scannedProject.fileSize,
        };
      });
      const existingPaths = new Set(refreshedProjects.map((project) => project.path).filter(Boolean));
      const additions = imports
        .filter((project) => !existingPaths.has(project.path))
        .map((project) => ({
          ...project,
          status: 'archived' as const,
        }));

      return additions.length > 0 || retainedProjects.length !== current.length || refreshedProjects.some((project, index) => project !== retainedProjects[index])
        ? [...refreshedProjects, ...additions]
        : current;
    });
  };

  const updateProject = (projectId: string, changes: Partial<Pick<Project, 'name' | 'path' | 'status'>>) => {
    setProjects((current) => current.map((project) => (
      project.id === projectId
        ? { ...project, ...changes, lastModified: new Date().toLocaleString(), lastModifiedAt: Date.now() }
        : project
    )));
  };

  const updateStatus = (projectId: string, status: ProgressionStatus) => {
    setProjects((current) => current.map((project) => (
      project.id === projectId ? { ...project, status } : project
    )));
  };

  const removeProject = (projectId: string) => {
    setProjects((current) => current.filter((project) => project.id !== projectId));
  };

  return { projects, addProject, importProjects, updateProject, updateStatus, removeProject };
}