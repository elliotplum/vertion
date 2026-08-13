import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css';

interface MediaFile {
  name: string;
  path: string;
  file_type: 'project' | 'audio';
  size: number;
  modified: number;
  created: number;
}

interface ProjectGroup {
  id: string;
  projectName: string;
  mainProjects: MediaFile[];
  backups: MediaFile[];
  audioFiles: MediaFile[];
  totalSize: number;
  lastModified: number;
  created: number;
}

function App() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'projects' | 'scans'>('projects');
  const [scannedPath, setScannedPath] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<{ [key: string]: boolean }>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('modified');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setCurrentView((prev) => (prev === 'projects' ? 'scans' : 'projects'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      }
    } catch (error) {
      console.error("Error scanning folder:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (projectName: string) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectName]: !prev[projectName]
    }));
  };

  const cleanName = (str: string) => {
    return str
      .replace(/\s*\[.*?\]/g, '')
      .replace(/\.(als|wav|mp3|flac|aiff)$/i, '')
      .replace(/^backup[-_\s]*/i, '')
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

  const groupedProjects: ProjectGroup[] = (() => {
    const projectMap: { [key: string]: { mainProjects: MediaFile[]; backups: MediaFile[]; audioFiles: MediaFile[] } } = {};
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
      projectMap[projName] = { mainProjects: [], backups: [], audioFiles: [] };
    });

    if (!projectMap["Other Files"]) {
      projectMap["Other Files"] = { mainProjects: [], backups: [], audioFiles: [] };
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
          if (isBackup) {
            projectMap[folderContext].backups.push(file);
          } else {
            projectMap[folderContext].mainProjects.push(file);
          }
        } else {
          projectMap["Other Files"].mainProjects.push(file);
        }
      } 
      else if (file.file_type === 'audio') {
        let matchedGroup = "Other Files";
        const audioClean = cleanName(file.name);

        for (const projName of distinctProjectNames) {
          const projClean = cleanName(projName);
          if (audioClean.includes(projClean) || file.path.toLowerCase().includes(projName.toLowerCase())) {
            matchedGroup = projName;
            break;
          }
        }

        projectMap[matchedGroup].audioFiles.push(file);
      }
    });

    return Object.keys(projectMap)
      .filter(name => {
        const group = projectMap[name];
        return group.mainProjects.length > 0 || group.backups.length > 0 || group.audioFiles.length > 0;
      })
      .map(name => {
        const groupFiles = [
          ...projectMap[name].mainProjects,
          ...projectMap[name].backups,
          ...projectMap[name].audioFiles,
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
          audioFiles: projectMap[name].audioFiles,
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
    if (sortBy === 'name') {
      return a.projectName.localeCompare(b.projectName);
    } else if (sortBy === 'size') {
      return b.totalSize - a.totalSize;
    } else if (sortBy === 'modified') {
      return b.lastModified - a.lastModified;
    }
    return 0;
  });

  return (
    <div className="app-container">
      <div className="top-bar">
        <span className="brand">VERTION // {currentView.toUpperCase()}</span>
        <span className="tab-hint">Press [TAB] to toggle view</span>
      </div>

      <div className="content">
        {currentView === 'projects' ? (
          <div className="view-section">
            <div className="header-row">
              <div>
                <h2>Active Projects & Versions</h2>
                <p className="subtitle">Overview of project sizes, timelines, and assets.</p>
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
                <div className="project-stack">
                  {filteredProjects.map((group) => {
                    const isExpanded = !!expandedProjects[group.id];
                    return (
                      <div key={group.id} className={`project-group-card ${isExpanded ? 'expanded' : ''}`}>
                        <div 
                          className="group-header clickable" 
                          onClick={() => toggleExpand(group.id)}
                        >
                          <div className="header-title-row">
                            <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                            <h3>🎵 {group.projectName}</h3>
                          </div>
                          <div className="header-details-row">
                            <span className="group-counts">
                              {group.mainProjects.length} Proj | {group.audioFiles.length} Audio | {group.backups.length} Backups
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

                            {group.audioFiles.length > 0 && (
                              <div className="sub-section">
                                <span className="sub-title">Matched Audio Exports & Bounces</span>
                                {group.audioFiles.map((file, fIdx) => (
                                  <div key={fIdx} className="file-item audio">
                                    <span className="badge audio">AUDIO</span>
                                    <div className="file-info-col">
                                      <span className="file-name" title={file.path}>{file.name}</span>
                                      <span className="file-meta">Modified: {formatDate(file.modified)} | Size: {formatSize(file.size)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {group.backups.length > 0 && (
                              <div className="sub-section backups">
                                <span className="sub-title">Saved Backups ({group.backups.length})</span>
                                <div className="backup-list">
                                  {group.backups.map((file, fIdx) => (
                                    <div key={fIdx} className="file-item backup">
                                      <span className="badge backup">BACKUP</span>
                                      <div className="file-info-col">
                                        <span className="file-name" title={file.path}>{file.name}</span>
                                        <span className="file-meta">Saved: {formatDate(file.modified)} | Size: {formatSize(file.size)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
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
        ) : (
          <div className="view-section">
            <h2>Scans & Analytics</h2>
            <p className="subtitle">Aggregated version history metrics.</p>
            <div className="empty-state">
              <p>Switch back using [TAB] to manage your project workspace.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;