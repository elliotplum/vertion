import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css';

type AppView = 'explorer' | 'project-history' | 'universal-recent';

interface MediaFile {
  name: string;
  path: string;
  file_type: 'project' | 'audio';
  size: number;
  modified: number;
  created: number;
}

interface ScoredAudioFile {
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

interface ProjectGroup {
  id: string;
  projectName: string;
  mainProjects: MediaFile[];
  backups: MediaFile[];
  activeAudioFiles: ScoredAudioFile[];
  archivedAudioFiles: ScoredAudioFile[];
  totalSize: number;
  lastModified: number;
  created: number;
}

interface CommentItem {
  id: string;
  timestampSecs: number;
  timeStr: string;
  text: string;
}

// Compute RMS (Root Mean Square) waveform from AudioBuffer for accurate visualization
function computeRmsWaveform(audioBuffer: AudioBuffer, numBars: number = 120): number[] {
  const rawData = audioBuffer.getChannelData(0); // Grab the first audio channel (mono/left)
  const samplesPerBar = Math.floor(rawData.length / numBars);
  const rmsValues: number[] = [];

  for (let i = 0; i < numBars; i++) {
    let sumSquares = 0;
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, rawData.length);
    const count = end - start;

    if (count === 0) {
      rmsValues.push(0);
      continue;
    }

    // Calculate sum of squares for RMS
    for (let j = start; j < end; j++) {
      const sample = rawData[j];
      sumSquares += sample * sample;
    }

    // Take square root of the mean
    const rms = Math.sqrt(sumSquares / count);
    rmsValues.push(rms);
  }

  // Global Normalization: Find the absolute loudest part of the ENTIRE song
  const maxRms = Math.max(...rmsValues, 0.0001); // Prevent division by zero

  // Scale every bar relative to that global maximum (so drop = 100%, breakdown scales down)
  return rmsValues.map((val) => val / maxRms);
}

// SoundCloud-Style High-Detail Waveform & Robust Blob Playback Component
function InteractiveWaveform({ 
  audioPath, 
  active, 
  comments, 
  onAddComment 
}: { 
  audioPath: string; 
  active?: boolean;
  comments: CommentItem[];
  onAddComment: (timestampSecs: number, text: string) => void;
}) {
  const [selectedTimeSecs, setSelectedTimeSecs] = useState<number>(0);
  const [totalDurationSecs, setTotalDurationSecs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [bars, setBars] = useState<{ top: number; bottom: number }[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load audio file securely via Tauri FS plugin into a Blob URL and compute RMS waveform
  useEffect(() => {
    let isMounted = true;
    if (!audioPath) return;

    const loadAudio = async () => {
      setIsLoading(true);
      setErrorMsg(null);
      setIsPlaying(false);
      setBars([]);

      try {
        const contents = await readFile(audioPath);
        const blob = new Blob([contents], { type: 'audio/mpeg' });
        
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        if (audioRef.current && isMounted) {
          audioRef.current.src = url;
          audioRef.current.load();
        }

        // Decode audio and compute RMS waveform
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength);
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const rmsValues = computeRmsWaveform(audioBuffer, 260);

          // Convert RMS values to bar heights
          if (isMounted) {
            const computedBars = rmsValues.map((rmsVal) => {
              const topHeight = Math.max(12, Math.floor(rmsVal * 92));
              const bottomHeight = Math.max(8, Math.floor(rmsVal * 75));
              return { top: topHeight, bottom: bottomHeight };
            });
            setBars(computedBars);
          }
        } catch (decodeErr) {
          console.warn('Could not decode audio for waveform analysis, using placeholder:', decodeErr);
          // Fallback: generate placeholder bars if decoding fails
          if (isMounted) {
            const placeholderBars = Array.from({ length: 260 }, () => ({
              top: Math.random() * 80 + 20,
              bottom: Math.random() * 60 + 15
            }));
            setBars(placeholderBars);
          }
        }
      } catch (err: any) {
        console.error('Failed to load audio file:', err);
        if (isMounted) {
          setErrorMsg(err.message || 'Could not load audio file');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [audioPath]);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || isLoading) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = selectedTimeSecs;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Playback error:", err);
        setErrorMsg('Playback error');
      });
    }
  };

  // Bars are now computed from actual audio RMS analysis in the loadAudio effect above

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const durationToUse = totalDurationSecs > 0 ? totalDurationSecs : (audioRef.current?.duration || 1);
    const newSecs = percentage * durationToUse;
    
    setSelectedTimeSecs(newSecs);
    if (audioRef.current) {
      audioRef.current.currentTime = newSecs;
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(selectedTimeSecs, commentText.trim());
    setCommentText('');
  };

  const durationToCalc = totalDurationSecs > 0 ? totalDurationSecs : (audioRef.current?.duration || 1);
  const playheadPercent = durationToCalc > 0 ? (selectedTimeSecs / durationToCalc) * 100 : 0;

  return (
    <div className="waveform-widget-container">
      <audio 
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setSelectedTimeSecs(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && !isNaN(audioRef.current.duration)) {
            setTotalDurationSecs(audioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />

      <div 
        className={`waveform-wrapper-large ${active ? 'active' : 'archived'}`}
        onClick={handleWaveformClick}
        title="Click anywhere on the waveform to seek"
      >
        <div className="waveform-center-line" />
        <div className="waveform-playhead" style={{ left: `${playheadPercent}%` }} />
        
        {comments.map(c => {
          const leftPct = durationToCalc > 0 ? (c.timestampSecs / durationToCalc) * 100 : 0;
          return (
            <div 
              key={c.id} 
              className="waveform-comment-marker" 
              style={{ left: `${leftPct}%` }}
              title={`[${c.timeStr}] ${c.text}`}
            />
          );
        })}

        <div className="waveform-bars-container">
          {bars.map((bar, idx) => (
            <div key={idx} className="waveform-bar-column">
              <div className="waveform-bar-top" style={{ height: `${bar.top}%` }} />
              <div className="waveform-bar-bottom" style={{ height: `${bar.bottom}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="waveform-footer-row">
        <div className="waveform-playback-controls">
          <button 
            className={`play-pause-btn ${isPlaying ? 'playing' : ''}`}
            onClick={togglePlayPause}
            disabled={isLoading}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? '⏳' : isPlaying ? '⏸' : '▶'}
          </button>
          <span className="current-time-indicator">
            {isLoading ? 'Loading...' : errorMsg ? errorMsg : `${formatTime(selectedTimeSecs)} / ${formatTime(totalDurationSecs)}`}
          </span>
        </div>
        
        <form onSubmit={handleCommentSubmit} className="waveform-comment-form">
          <input 
            type="text" 
            placeholder={`Comment at ${formatTime(selectedTimeSecs)}...`}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="waveform-comment-input"
            onClick={(e) => e.stopPropagation()}
          />
          <button type="submit" className="waveform-comment-btn" onClick={(e) => e.stopPropagation()}>
            Post
          </button>
        </form>
      </div>

      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map(c => (
            <div 
              key={c.id} 
              className="comment-pill" 
              onClick={() => {
                setSelectedTimeSecs(c.timestampSecs);
                if (audioRef.current) audioRef.current.currentTime = c.timestampSecs;
              }}
            >
              <span className="comment-timestamp">{c.timeStr}</span>
              <span className="comment-text">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('explorer');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [scannedPath, setScannedPath] = useState<string | null>(null);
  
  const [audioOverrides, setAudioOverrides] = useState<{ [projectId: string]: { [path: string]: 'active' | 'archived' } }>({});
  const [archiveExpanded, setArchiveExpanded] = useState<boolean>(false);
  const [trackComments, setTrackComments] = useState<{ [path: string]: CommentItem[] }>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('modified');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        if (selectedProjectId) {
          setCurrentView(prev => (prev === 'project-history' ? 'explorer' : 'project-history'));
        } else {
          setCurrentView(prev => (prev === 'universal-recent' ? 'explorer' : 'universal-recent'));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProjectId]);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Ableton Project / Bounce Directory",
      });

      if (selected && typeof selected === 'string') {
        setLoading(true);
        setScannedPath(selected);
        
        const results: MediaFile[] = await invoke('scan_bounce_folder', { 
          folderPath: selected 
        });

        setFiles(results);
        setAudioOverrides({});
      }
    } catch (error) {
      console.error("Error scanning folder:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAudioStatus = (projectId: string, audioPath: string, targetStatus: 'active' | 'archived') => {
    setAudioOverrides(prev => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        [audioPath]: targetStatus
      }
    }));
  };

  const toggleExpand = (projectId: string) => {
    setExpandedProjectId(prev => (prev === projectId ? null : projectId));
  };

  const addCommentToTrack = (audioPath: string, timestampSecs: number, text: string) => {
    const mins = Math.floor(timestampSecs / 60);
    const secs = Math.floor(timestampSecs % 60);
    const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const newComment: CommentItem = {
      id: Math.random().toString(36).substring(2, 9),
      timestampSecs,
      timeStr,
      text
    };

    setTrackComments(prev => ({
      ...prev,
      [audioPath]: [...(prev[audioPath] || []), newComment]
    }));
  };

  const cleanName = (str: string) => {
    return str
      .replace(/\s*\[.*?\]/g, '')
      .replace(/\.(als|wav|mp3|flac|aiff)$/i, '')
      .replace(/^backup[-_\s]*/i, '')
      .replace(/\b(project|session|mix|master|v\d+)\b/gi, '')
      .replace(/[-_]/g, ' ')
      .toLowerCase()
      .trim();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestampSecs: number) => {
    if (!timestampSecs) return 'Unknown';
    const date = new Date(timestampSecs * 1000);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const scoreAudioAssociation = (
    audio: MediaFile, 
    projName: string, 
    projLastModified: number, 
    projFolderPath: string
  ): ScoredAudioFile => {
    let score = 0;
    const oneDaySecs = 86400;

    const lowerPath = audio.path.toLowerCase();
    const isInternalSample = lowerPath.includes('\\samples\\') || lowerPath.includes('/samples/');

    const audioDir = audio.path.substring(0, Math.max(audio.path.lastIndexOf('/'), audio.path.lastIndexOf('\\')));
    const sameFolder = audioDir.toLowerCase() === projFolderPath.toLowerCase() || lowerPath.includes(projName.toLowerCase());
    if (sameFolder) score += 20;

    const cleanProj = cleanName(projName);
    const cleanAudio = cleanName(audio.name);
    const similarNaming = cleanAudio.length > 0 && cleanProj.length > 0 && (
      cleanAudio.includes(cleanProj) || 
      cleanProj.includes(cleanAudio) ||
      cleanAudio === cleanProj
    );
    if (similarNaming) score += 10;

    const timeDiffSecs = Math.abs(audio.modified - projLastModified);
    const bounceCreatedRecently = timeDiffSecs < oneDaySecs * 30;
    if (bounceCreatedRecently) score += 30;

    const projectSavedRecently = projLastModified - audio.modified < oneDaySecs * 30 && projLastModified >= audio.modified;
    if (projectSavedRecently) score += 40;

    const finalScore = Math.min(score, 100);

    let tier: 'auto' | 'confirm' | 'manual' = 'manual';
    if (finalScore >= 95) tier = 'auto';
    else if (finalScore >= 70) tier = 'confirm';
    else tier = 'manual';

    return {
      file: audio,
      confidence: finalScore,
      signals: { projectSavedRecently, bounceCreatedRecently, sameFolder, similarNaming },
      tier,
      isInternalSample,
    };
  };

  const groupedProjects: ProjectGroup[] = (() => {
    const projectMap: { [key: string]: { mainProjects: MediaFile[]; backups: MediaFile[]; audioFiles: ScoredAudioFile[]; folderPath: string } } = {};
    const rawProjects: { name: string; file: MediaFile; isBackup: boolean; folderContext: string }[] = [];

    files.forEach((file) => {
      const isBackup = file.path.toLowerCase().includes('\\backup\\') || file.path.toLowerCase().includes('/backup/');
      const pathParts = file.path.split(/[/\\]/);
      let folderContext = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "Uncategorized";
      if (folderContext.toLowerCase() === 'backup' && pathParts.length >= 3) {
        folderContext = pathParts[pathParts.length - 3];
      }

      if (file.file_type === 'project') {
        const cleaned = cleanName(file.name);
        rawProjects.push({ name: cleaned, file, isBackup, folderContext });
      }
    });

    const distinctProjectNames = Array.from(new Set(rawProjects.map(p => p.folderContext)));

    distinctProjectNames.forEach(projName => {
      const sampleProj = rawProjects.find(p => p.folderContext === projName);
      const projDir = sampleProj 
        ? sampleProj.file.path.substring(0, Math.max(sampleProj.file.path.lastIndexOf('/'), sampleProj.file.path.lastIndexOf('\\')))
        : '';
      projectMap[projName] = { mainProjects: [], backups: [], audioFiles: [], folderPath: projDir };
    });

    if (!projectMap["Other Files"]) {
      projectMap["Other Files"] = { mainProjects: [], backups: [], audioFiles: [], folderPath: "" };
    }

    files.forEach((file) => {
      const isBackup = file.path.toLowerCase().includes('\\backup\\') || file.path.toLowerCase().includes('/backup/');
      const pathParts = file.path.split(/[/\\]/);
      let folderContext = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : "Other Files";
      if (folderContext.toLowerCase() === 'backup' && pathParts.length >= 3) {
        folderContext = pathParts[pathParts.length - 3];
      }

      if (file.file_type === 'project') {
        if (projectMap[folderContext]) {
          if (isBackup) projectMap[folderContext].backups.push(file);
          else projectMap[folderContext].mainProjects.push(file);
        } else {
          projectMap["Other Files"].mainProjects.push(file);
        }
      }
    });

    files.forEach((file) => {
      if (file.file_type === 'audio') {
        let bestMatch = "Other Files";
        let highestScore = -1;
        let bestScoredAudio: ScoredAudioFile | null = null;

        for (const projName of distinctProjectNames) {
          const groupData = projectMap[projName];
          const mockLastModified = groupData.mainProjects.reduce((max, f) => Math.max(max, f.modified), file.modified);
          const scored = scoreAudioAssociation(file, projName, mockLastModified, groupData.folderPath);

          if (scored.confidence > highestScore) {
            highestScore = scored.confidence;
            bestMatch = projName;
            bestScoredAudio = scored;
          }
        }

        if (bestScoredAudio && highestScore >= 10) {
          projectMap[bestMatch].audioFiles.push(bestScoredAudio);
        } else {
          const fallbackScored = scoreAudioAssociation(file, "Other Files", file.modified, "");
          projectMap["Other Files"].audioFiles.push(fallbackScored);
        }
      }
    });

    return Object.keys(projectMap)
      .filter(name => {
        const group = projectMap[name];
        return group.mainProjects.length > 0 || group.backups.length > 0 || group.audioFiles.length > 0;
      })
      .map(name => {
        const projOverrides = audioOverrides[name] || {};
        
        const activeAudioFiles: ScoredAudioFile[] = [];
        const archivedAudioFiles: ScoredAudioFile[] = [];

        projectMap[name].audioFiles.forEach(scored => {
          const override = projOverrides[scored.file.path];
          const isArchivedByDefault = scored.isInternalSample;
          const shouldBeActive = override ? override === 'active' : !isArchivedByDefault;

          if (shouldBeActive) activeAudioFiles.push(scored);
          else archivedAudioFiles.push(scored);
        });

        const groupFiles = [
          ...projectMap[name].mainProjects,
          ...projectMap[name].backups,
          ...activeAudioFiles.map(a => a.file),
        ];

        const totalSize = groupFiles.reduce((sum, f) => sum + f.size, 0);
        const lastModified = groupFiles.reduce((max, f) => Math.max(max, f.modified), 0);
        const validCreatedTimes = groupFiles.map(f => f.created).filter(t => t > 0);
        const created = validCreatedTimes.length > 0 ? Math.min(...validCreatedTimes) : lastModified;

        return {
          id: name,
          projectName: name,
          mainProjects: projectMap[name].mainProjects,
          backups: projectMap[name].backups,
          activeAudioFiles,
          archivedAudioFiles,
          totalSize,
          lastModified,
          created,
        };
      });
  })();

  const filteredProjects = groupedProjects.filter(group =>
    group.projectName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  filteredProjects.sort((a, b) => {
    if (sortBy === 'name') return a.projectName.localeCompare(b.projectName);
    else if (sortBy === 'size') return b.totalSize - a.totalSize;
    else if (sortBy === 'modified') return b.lastModified - a.lastModified;
    return 0;
  });

  const selectedProjectObj = groupedProjects.find(g => g.id === selectedProjectId);

  return (
    <div className="app-container">
      <div className="top-bar">
        <span className="brand">VERTION // {currentView.toUpperCase().replace('-', ' ')}</span>
        <span className="tab-hint">
          {selectedProjectId ? 'Press [TAB] to toggle Project History' : 'Press [TAB] for Recent Bounces'}
        </span>
      </div>

      <div className="content">
        {currentView === 'explorer' && (
          <div className="view-section">
            <div className="header-row">
              <div>
                <h2>Active Projects & Versions</h2>
                <p className="subtitle">Overview of project sizes, confidence-scored bounces, and assets.</p>
              </div>
              <button className="scan-btn" onClick={handleSelectFolder} disabled={loading}>
                {loading ? 'Scanning Directory...' : 'Select Folder to Scan'}
              </button>
            </div>

            {scannedPath && (
              <div className="path-container">
                <span className="path-label">Target:</span>
                <code className="path-text">{scannedPath}</code>
              </div>
            )}

            {files.length > 0 && (
              <div className="toolbar">
                <input 
                  type="text" 
                  placeholder="Search projects..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="sort-container">
                  <span className="sort-label">Sort by:</span>
                  <select 
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'size' | 'modified')}
                    className="sort-select"
                  >
                    <option value="modified">Last Modified</option>
                    <option value="size">Total Size</option>
                    <option value="name">Project Name</option>
                  </select>
                </div>
              </div>
            )}

            <div className="file-list-container">
              {filteredProjects.length === 0 ? (
                <div className="empty-state">
                  <p>{files.length === 0 ? 'No project folders loaded yet.' : 'No projects matching your search.'}</p>
                  {files.length === 0 && <p className="hint-text">Click "Select Folder to Scan" to analyze your Ableton library.</p>}
                </div>
              ) : (
                <div className="project-grid">
                  {filteredProjects.map((group) => {
                    const isExpanded = expandedProjectId === group.id;
                    const isSelected = group.id === selectedProjectId;
                    return (
                      <div 
                        key={group.id} 
                        className={`project-group-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => setSelectedProjectId(group.id)}
                      >
                        <div 
                          className="group-header clickable" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectId(group.id);
                            toggleExpand(group.id);
                          }}
                        >
                          <div className="header-title-row">
                            <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                            <h3>🎵 {group.projectName}</h3>
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
                                {group.mainProjects.map((file, fIdx) => (
                                  <div key={fIdx} className="file-item project">
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
                                {group.activeAudioFiles.map((scored, fIdx) => (
                                  <div key={fIdx} className="file-item audio stacked">
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleAudioStatus(group.id, scored.file.path, 'archived');
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <InteractiveWaveform 
                                      audioPath={scored.file.path}
                                      active={true}
                                      comments={trackComments[scored.file.path] || []}
                                      onAddComment={(ts, txt) => addCommentToTrack(scored.file.path, ts, txt)}
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'project-history' && (
          <div className="view-section">
            <h2>Project History // {selectedProjectObj?.projectName}</h2>
            <p className="subtitle">Confidence-scored audio exports, timeline history, and version tracking.</p>
            
            {selectedProjectObj ? (
              <div className="project-history-content">
                <div className="history-summary-card">
                  <h3>Active Project: {selectedProjectObj.projectName}</h3>
                  <p>Total Size: <strong>{formatSize(selectedProjectObj.totalSize)}</strong> | Last Modified: {formatDate(selectedProjectObj.lastModified)}</p>
                  <p className="hint-text">Press [TAB] to return to Project Explorer.</p>
                </div>

                <div className="sub-section" style={{ marginTop: '20px' }}>
                  <span className="sub-title">Associated Bounces ({selectedProjectObj.activeAudioFiles.length})</span>
                  {selectedProjectObj.activeAudioFiles.length === 0 ? (
                    <p className="empty-text">No active audio bounces matched to this project. Check the archive below to restore files.</p>
                  ) : (
                    selectedProjectObj.activeAudioFiles.map((scored, idx) => (
                      <div key={idx} className="file-item audio stacked">
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
                          <button 
                            className="action-btn remove" 
                            onClick={() => toggleAudioStatus(selectedProjectObj.id, scored.file.path, 'archived')}
                          >
                            Remove
                          </button>
                        </div>
                        <InteractiveWaveform 
                          audioPath={scored.file.path}
                          active={true}
                          comments={trackComments[scored.file.path] || []}
                          onAddComment={(ts, txt) => addCommentToTrack(scored.file.path, ts, txt)}
                        />
                      </div>
                    ))
                  )}
                </div>

                {selectedProjectObj.archivedAudioFiles.length > 0 && (
                  <div className="archive-dropdown-container" style={{ marginTop: '30px' }}>
                    <div 
                      className="archive-dropdown-header clickable"
                      onClick={() => setArchiveExpanded(prev => !prev)}
                    >
                      <span className="expand-icon">{archiveExpanded ? '▼' : '▶'}</span>
                      <span className="sub-title" style={{ margin: 0 }}>
                        Related Audio Archive ({selectedProjectObj.archivedAudioFiles.length} hidden samples/exports)
                      </span>
                    </div>

                    {archiveExpanded && (
                      <div className="archive-dropdown-body">
                        <p className="subtitle" style={{ fontSize: '12px', marginBottom: '10px' }}>
                          Files here are kept accessible in case you want to add them back to your project association.
                        </p>
                        {selectedProjectObj.archivedAudioFiles.map((scored, idx) => (
                          <div key={idx} className="file-item audio archived-item stacked">
                            <div className="file-top-row">
                              <span className="badge manual">ARCHIVED</span>
                              <div className="file-info-col">
                                <span className="file-name" title={scored.file.path}>{scored.file.name}</span>
                                <span className="file-meta">
                                  Path: {scored.file.path} | Modified: {formatDate(scored.file.modified)}
                                </span>
                              </div>
                              <button 
                                className="action-btn add" 
                                onClick={() => toggleAudioStatus(selectedProjectObj.id, scored.file.path, 'active')}
                              >
                                + Add Back
                              </button>
                            </div>
                            <InteractiveWaveform 
                              audioPath={scored.file.path}
                              active={false}
                              comments={trackComments[scored.file.path] || []}
                              onAddComment={(ts, txt) => addCommentToTrack(scored.file.path, ts, txt)}
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
        )}

        {currentView === 'universal-recent' && (
          <div className="view-section">
            <h2>Recent Bounces (Global)</h2>
            <p className="subtitle">Recent changes across your entire scanned workspace.</p>
            <div className="empty-state">
              <p>Global feed of recent project modifications and audio bounces.</p>
              <p className="hint-text">Press [TAB] to return to Project Explorer.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;