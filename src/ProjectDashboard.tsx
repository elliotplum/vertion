import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import './ProjectDashboard.css';
import type { Project, ProgressionStatus } from './Types';

interface ProjectDashboardProps {
  projects: Project[];
  onUpdateStatus: (projectId: string, newStatus: ProgressionStatus) => void;
  onAddProject: (name: string, path?: string) => void;
  onUpdateProject: (projectId: string, changes: Partial<Pick<Project, 'name' | 'path'>>) => void;
  onRemoveProject: (projectId: string) => void;
  onSelectProject: (project: Project) => void;
}

const STATUS_SECTIONS: { key: ProgressionStatus; label: string; accent: string }[] = [
  { key: 'in_progress', label: 'IN PROGRESS', accent: '#39ff88' },
  { key: 'ideas', label: 'IDEAS', accent: '#c9a227' },
  { key: 'unreleased', label: 'UNRELEASED', accent: '#c9c9c0' },
  { key: 'released', label: 'RELEASED', accent: '#ff7700' },
  { key: 'archived', label: 'ARCHIVE', accent: '#555555' },
];

type ProjectSort = 'modified' | 'created' | 'name-asc' | 'name-desc' | 'oldest' | 'random';

const DEFAULT_SORT: Record<ProgressionStatus, ProjectSort> = {
  in_progress: 'modified',
  ideas: 'modified',
  unreleased: 'modified',
  released: 'modified',
  archived: 'modified',
};

function projectTimestamp(timestamp: number | undefined, displayDate: string): number {
  return timestamp ?? (Date.parse(displayDate) || 0);
}

function randomSortKey(id: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projects,
  onUpdateStatus,
  onAddProject,
  onUpdateProject,
  onRemoveProject,
  onSelectProject,
}) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftPath, setDraftPath] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [detailProject, setDetailProject] = useState<Project | null>(null);
  const [sortByStatus, setSortByStatus] = useState(DEFAULT_SORT);
  const [randomSeeds, setRandomSeeds] = useState<Record<ProgressionStatus, number>>({
    in_progress: 0,
    ideas: 0,
    unreleased: 0,
    released: 0,
    archived: 0,
  });

  const changeSort = (status: ProgressionStatus, sort: ProjectSort) => {
    setSortByStatus((current) => ({ ...current, [status]: sort }));
    if (sort === 'random') {
      setRandomSeeds((current) => ({ ...current, [status]: Math.floor(Math.random() * 2 ** 31) }));
    }
  };

  const submitProject = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;

    if (editingProject) {
      onUpdateProject(editingProject.id, { name, path: draftPath.trim() || undefined });
    } else {
      onAddProject(name, draftPath.trim() || undefined);
    }
    setDraftName('');
    setDraftPath('');
    setEditingProject(null);
    setIsComposerOpen(false);
  };

  const startEditing = (project: Project) => {
    setEditingProject(project);
    setDraftName(project.name);
    setDraftPath(project.path || '');
    setIsComposerOpen(true);
  };

  const closeComposer = () => {
    setDraftName('');
    setDraftPath('');
    setEditingProject(null);
    setIsComposerOpen(false);
  };

  const startNewIdea = () => {
    setDraftName('');
    setDraftPath('');
    setEditingProject(null);
    setIsComposerOpen(true);
  };

  const choosePath = async (directory: boolean) => {
    const selected = await open({
      directory,
      multiple: false,
      title: directory ? 'Choose project folder' : 'Choose project file',
    });
    if (typeof selected === 'string') setDraftPath(selected);
  };

  return (
    <div className="view-section dashboard-container">
      <div className="dashboard-header header-row">
        <div>
          <h2 className="dashboard-title">
            <strong>Dashboard</strong>
            <span>- A hub for project tracking, idea development and cataloging</span>
          </h2>
        </div>
      </div>

      {isComposerOpen && (
        <form className="project-composer" onSubmit={submitProject}>
          <div className="composer-heading">
            <div>
              <h3>{editingProject ? 'Edit project' : 'Add an idea'}</h3>
              <p className="subtitle">Ideas can start without a linked folder.</p>
            </div>
            <button type="button" className="close-btn" onClick={closeComposer} aria-label="Close project form">×</button>
          </div>
          <div className="composer-fields">
            <label>
              Project name
              <input autoFocus value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="e.g. Night Drive" />
            </label>
            <label>
              Path <span className="optional-label">optional</span>
              <div className="path-picker-row">
                <input value={draftPath} onChange={(event) => setDraftPath(event.target.value)} placeholder="Link a folder or .als file" />
                <button type="button" className="icon-btn" onClick={() => choosePath(true)}>Folder</button>
                <button type="button" className="icon-btn" onClick={() => choosePath(false)}>File</button>
              </div>
            </label>
          </div>
          <div className="composer-footer">
            <button type="button" className="dashboard-secondary-btn" onClick={closeComposer}>Cancel</button>
            <button type="submit" className="dashboard-primary-btn" disabled={!draftName.trim()}>{editingProject ? 'Save Changes' : 'Add Idea'}</button>
          </div>
        </form>
      )}

      <div className="dashboard-sections">
        {STATUS_SECTIONS.map(section => {
          const sectionProjects = projects
            .filter(project => project.status === section.key)
            .sort((a, b) => {
              switch (sortByStatus[section.key]) {
                case 'created':
                  return projectTimestamp(b.createdAt, b.lastModified) - projectTimestamp(a.createdAt, a.lastModified);
                case 'name-asc':
                  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
                case 'name-desc':
                  return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
                case 'oldest':
                  return projectTimestamp(a.lastModifiedAt, a.lastModified) - projectTimestamp(b.lastModifiedAt, b.lastModified);
                case 'random':
                  return randomSortKey(a.id, randomSeeds[section.key]) - randomSortKey(b.id, randomSeeds[section.key]);
                case 'modified':
                default:
                  return projectTimestamp(b.lastModifiedAt, b.lastModified) - projectTimestamp(a.lastModifiedAt, a.lastModified);
              }
            });

          return (
            <section key={section.key} className={`status-section status-${section.key}`}>
              <div className="column-header" style={{ borderColor: section.accent }}>
                <span className="section-label" style={{ color: section.accent }}>{section.label}</span>
                <span className="section-count">{sectionProjects.length}</span>
                {sectionProjects.length > 6 && <span className="section-scroll-hint">SCROLL TO BROWSE</span>}
                <label className="section-sort-control">
                  <span>Sort</span>
                  <select
                    aria-label={`Sort ${section.label.toLowerCase()} projects`}
                    value={sortByStatus[section.key]}
                    onChange={(event) => changeSort(section.key, event.target.value as ProjectSort)}
                  >
                    <option value="modified">Last modified</option>
                    <option value="created">Date created</option>
                    <option value="oldest">Oldest modified</option>
                    <option value="name-asc">Name A–Z</option>
                    <option value="name-desc">Name Z–A</option>
                    <option value="random">Random</option>
                  </select>
                </label>
                {section.key === 'ideas' && (
                  <button type="button" className="dashboard-primary-btn new-idea-btn" onClick={startNewIdea}>
                    + New Idea
                  </button>
                )}
              </div>

              <div className="project-list" aria-label={`${section.label} projects`}>
                {sectionProjects.length === 0 ? (
                  <div className="empty-slot">-- NO PROJECTS --</div>
                ) : (
                  sectionProjects.map(project => (
                    <div key={project.id} className="project-item">
                      <div 
                        className="project-info"
                        onClick={() => {
                          onSelectProject(project);
                          setDetailProject(project);
                        }}
                      >
                        <span className="project-name">{project.name}</span>
                        <span className="project-meta">{project.path || 'No linked path'} · Updated {project.lastModified}</span>
                      </div>
                      <div className="project-item-actions">
                        <select
                          aria-label={`Status for ${project.name}`}
                          value={project.status}
                          onChange={(event) => onUpdateStatus(project.id, event.target.value as ProgressionStatus)}
                          className="status-dropdown"
                        >
                          <option value="in_progress">In Progress</option>
                          <option value="ideas">Ideas</option>
                          <option value="unreleased">Unreleased</option>
                          <option value="released">Released</option>
                          <option value="archived">Archive</option>
                        </select>
                        <button className="icon-btn" onClick={() => startEditing(project)} aria-label={`Edit ${project.name}`}>Edit</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {detailProject && (
        <div className="dashboard-modal-backdrop" onClick={() => setDetailProject(null)}>
          <section className="project-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="composer-heading">
              <div>
                <span className="detail-eyebrow">PROJECT DETAILS</span>
                <h3>{detailProject.name}</h3>
              </div>
              <button className="close-btn" onClick={() => setDetailProject(null)} aria-label="Close project details">×</button>
            </div>
            <div className="detail-grid">
              <span>Status</span><strong>{STATUS_SECTIONS.find((section) => section.key === detailProject.status)?.label}</strong>
              <span>Path</span><strong className="detail-path">{detailProject.path || 'No linked path'}</strong>
              <span>Last updated</span><strong>{detailProject.lastModified}</strong>
            </div>
            <div className="composer-footer">
              <button className="dashboard-secondary-btn" onClick={() => startEditing(detailProject)}>Edit</button>
              {detailProject.path && (
                <button className="dashboard-secondary-btn" onClick={() => revealItemInDir(detailProject.path!).catch(() => undefined)}>Reveal Path</button>
              )}
              <button className="danger-btn" onClick={() => {
                if (window.confirm(`Remove ${detailProject.name} from the dashboard?`)) {
                  onRemoveProject(detailProject.id);
                  setDetailProject(null);
                }
              }}>Remove</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};