import { InteractiveWaveform } from './InteractiveWaveform';
import type { CommentItem, ProjectGroup } from '../types/project';
import { formatDate, formatSize } from '../utils/formatters';

// ProjectCard owns expansion and file presentation for one grouped project.
export function ProjectCard({
  group,
  isExpanded,
  isSelected,
  commentsByPath,
  onSelect,
  onToggleExpand,
  onArchiveAudio,
  onAddComment,
  bpmLoading,
  onRevealBpm,
}: {
  group: ProjectGroup;
  isExpanded: boolean;
  isSelected: boolean;
  commentsByPath: { [path: string]: CommentItem[] };
  onSelect: () => void;
  onToggleExpand: () => void;
  onArchiveAudio: (audioPath: string) => void;
  onAddComment: (audioPath: string, timestampSecs: number, text: string) => void;
  bpmLoading: boolean;
  onRevealBpm: () => void;
}) {
  // The header remains the only expansion control; selecting the card itself stays independent.
  return (
    <div
      className={`project-group-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
      onClick={onSelect}
    >
      <div
        className="group-header clickable"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
          onToggleExpand();
        }}
      >
        <div className="header-title-row">
          <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
          <h3>{group.projectName} {group.bpm !== null && <span className="project-bpm">{group.bpm} BPM</span>}</h3>
          {group.bpm === null && (
            <button
              className="project-bpm-btn"
              onClick={(event) => {
                event.stopPropagation();
                onRevealBpm();
              }}
              disabled={bpmLoading}
            >
              {bpmLoading ? 'Reading BPM...' : 'BPM'}
            </button>
          )}
        </div>
        <div className="header-details-row">
          <span className="group-counts">
            {group.mainProjects.length} Proj | {group.activeAudioFiles.length} Bounces | {group.archivedAudioFiles.length} Archived
          </span>
          <span className="group-meta-summary">
            Size: <strong>{formatSize(group.totalSize)}</strong> | {formatDate(group.lastModified)}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="group-body">
          {group.mainProjects.length > 0 && (
            <div className="sub-section">
              <span className="sub-title">Main Project Files</span>
              {group.mainProjects.map((file, index) => (
                <div key={index} className="file-item project">
                  <span className="badge project">ALS</span>
                  <div className="file-info-col">
                    <span className="file-name" title={file.path}>{file.name}</span>
                    <span className="file-meta">Modified: {formatDate(file.modified)} | Size: {formatSize(file.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {group.activeAudioFiles.length > 0 && (
            <div className="sub-section">
              <span className="sub-title">Matched Bounces & Exports</span>
              {group.activeAudioFiles.map((scored, index) => (
                <div key={index} className="file-item audio stacked">
                  <div className="file-top-row">
                    <span className={`badge ${scored.tier}`}>
                      {scored.confidence}% {scored.tier === 'auto' ? 'AUTO' : scored.tier === 'confirm' ? 'CONFIRM' : 'CHOOSE'}
                    </span>
                    <div className="file-info-col">
                      <span className="file-name" title={scored.file.path}>{scored.file.name}</span>
                      <span className="file-meta">
                        Modified: {formatDate(scored.file.modified)} | Size: {formatSize(scored.file.size)}
                      </span>
                    </div>
                    <button
                      className="action-btn remove"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchiveAudio(scored.file.path);
                      }}
                    >
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
