import { InteractiveWaveform } from './InteractiveWaveform';
import type { CommentItem, ProjectGroup } from '../types/project';
import { formatDate, formatSize } from '../utils/formatters';

// ProjectHistory presents one selected project's active and archived audio associations.
export function ProjectHistory({
  project,
  archiveExpanded,
  commentsByPath,
  onToggleArchive,
  onArchiveAudio,
  onRestoreAudio,
  onAddComment,
}: {
  project: ProjectGroup | undefined;
  archiveExpanded: boolean;
  commentsByPath: { [path: string]: CommentItem[] };
  onToggleArchive: () => void;
  onArchiveAudio: (audioPath: string) => void;
  onRestoreAudio: (audioPath: string) => void;
  onAddComment: (audioPath: string, timestampSecs: number, text: string) => void;
}) {
  // Keeping the empty state here prevents App from needing to know history-specific rendering details.
  return (
    <div className="view-section">
      <h2>Project History // {project?.projectName}</h2>
      <p className="subtitle">Confidence-scored audio exports, timeline history, and version tracking.</p>

      {project ? (
        <div className="project-history-content">
          <div className="history-summary-card">
            <h3>Active Project: {project.projectName}</h3>
            <p>Total Size: <strong>{formatSize(project.totalSize)}</strong> | Last Modified: {formatDate(project.lastModified)}</p>
            <p className="hint-text">Press [TAB] to return to Project Explorer.</p>
          </div>

          <div className="sub-section" style={{ marginTop: '20px' }}>
            <span className="sub-title">Associated Bounces ({project.activeAudioFiles.length})</span>
            {project.activeAudioFiles.length === 0 ? (
              <p className="empty-text">No active audio bounces matched to this project. Check the archive below to restore files.</p>
            ) : (
              project.activeAudioFiles.map((scored, index) => (
                <div key={index} className="file-item audio stacked">
                  <div className="file-top-row">
                    <span className={`badge ${scored.tier}`}>
                      {scored.confidence}% {scored.tier === 'auto' ? 'AUTO' : scored.tier === 'confirm' ? 'CONFIRM' : 'CHOOSE'}
                    </span>
                    <div className="file-info-col">
                      <span className="file-name" title={scored.file.path}>{scored.file.name}</span>
                      <span className="file-meta">
                        Path: {scored.file.path} | Modified: {formatDate(scored.file.modified)}
                      </span>
                    </div>
                    <button className="action-btn remove" onClick={() => onArchiveAudio(scored.file.path)}>
                      Remove
                    </button>
                  </div>
                  <InteractiveWaveform
                    audioPath={scored.file.path}
                    active={true}
                    comments={commentsByPath[scored.file.path] || []}
                    onAddComment={(timestampSecs, text) => onAddComment(scored.file.path, timestampSecs, text)}
                  />
                </div>
              ))
            )}
          </div>

          {project.archivedAudioFiles.length > 0 && (
            <div className="archive-dropdown-container" style={{ marginTop: '30px' }}>
              <div className="archive-dropdown-header clickable" onClick={onToggleArchive}>
                <span className="expand-icon">{archiveExpanded ? '▼' : '▶'}</span>
                <span className="sub-title" style={{ margin: 0 }}>
                  Related Audio Archive ({project.archivedAudioFiles.length} hidden samples/exports)
                </span>
              </div>

              {archiveExpanded && (
                <div className="archive-dropdown-body">
                  <p className="subtitle" style={{ fontSize: '12px', marginBottom: '10px' }}>
                    Files here are kept accessible in case you want to add them back to your project association.
                  </p>
                  {project.archivedAudioFiles.map((scored, index) => (
                    <div key={index} className="file-item audio archived-item stacked">
                      <div className="file-top-row">
                        <span className="badge manual">ARCHIVED</span>
                        <div className="file-info-col">
                          <span className="file-name" title={scored.file.path}>{scored.file.name}</span>
                          <span className="file-meta">
                            Path: {scored.file.path} | Modified: {formatDate(scored.file.modified)}
                          </span>
                        </div>
                        <button className="action-btn add" onClick={() => onRestoreAudio(scored.file.path)}>
                          + Add Back
                        </button>
                      </div>
                      <InteractiveWaveform
                        audioPath={scored.file.path}
                        active={false}
                        comments={commentsByPath[scored.file.path] || []}
                        onAddComment={(timestampSecs, text) => onAddComment(scored.file.path, timestampSecs, text)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <p>No project selected.</p>
          <p className="hint-text">Press [TAB] to return to Explorer and select a project card.</p>
        </div>
      )}
    </div>
  );
}
