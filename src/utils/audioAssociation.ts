import type { MediaFile, ProjectGroup, ScoredAudioFile } from '../types/project';

// Remove naming noise so projects and exports can be compared despite different conventions.
export function cleanName(value: string): string {
  return value
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\.(als|wav|mp3|flac|aiff)$/i, '')
    .replace(/^backup[-_\s]*/i, '')
    .replace(/\b(project|session|mix|master|v\d+)\b/gi, '')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .trim();
}

// Score an audio file against one project using the app's existing confidence signals.
export function scoreAudioAssociation(
  audio: MediaFile,
  projectName: string,
  projectLastModified: number,
  projectFolderPath: string,
): ScoredAudioFile {
  let score = 0;
  const oneDaySecs = 86400;
  const lowerPath = audio.path.toLowerCase();
  const isInternalSample = lowerPath.includes('\\samples\\') || lowerPath.includes('/samples/');

  const audioDir = audio.path.substring(0, Math.max(audio.path.lastIndexOf('/'), audio.path.lastIndexOf('\\')));
  const sameFolder = audioDir.toLowerCase() === projectFolderPath.toLowerCase()
    || lowerPath.includes(projectName.toLowerCase());
  if (sameFolder) score += 20;

  const cleanProject = cleanName(projectName);
  const cleanAudio = cleanName(audio.name);
  const similarNaming = cleanAudio.length > 0 && cleanProject.length > 0 && (
    cleanAudio.includes(cleanProject)
    || cleanProject.includes(cleanAudio)
    || cleanAudio === cleanProject
  );
  if (similarNaming) score += 10;

  const timeDiffSecs = Math.abs(audio.modified - projectLastModified);
  const bounceCreatedRecently = timeDiffSecs < oneDaySecs * 30;
  if (bounceCreatedRecently) score += 30;

  const projectSavedRecently = projectLastModified - audio.modified < oneDaySecs * 30
    && projectLastModified >= audio.modified;
  if (projectSavedRecently) score += 40;

  const confidence = Math.min(score, 100);
  const tier = confidence >= 95 ? 'auto' : confidence >= 70 ? 'confirm' : 'manual';

  return {
    file: audio,
    confidence,
    signals: { projectSavedRecently, bounceCreatedRecently, sameFolder, similarNaming },
    tier,
    isInternalSample,
  };
}

// Rebuild the display model from scan results and manual archive decisions.
export function groupProjects(
  files: MediaFile[],
  audioOverrides: { [projectId: string]: { [path: string]: 'active' | 'archived' } },
): ProjectGroup[] {
  const projectMap: {
    [key: string]: {
      mainProjects: MediaFile[];
      backups: MediaFile[];
      audioFiles: ScoredAudioFile[];
      folderPath: string;
    };
  } = {};
  const rawProjects: { name: string; file: MediaFile; isBackup: boolean; folderContext: string }[] = [];

  // Project folders define groups because a single folder can contain several versions.
  files.forEach((file) => {
    const isBackup = file.path.toLowerCase().includes('\\backup\\') || file.path.toLowerCase().includes('/backup/');
    const pathParts = file.path.split(/[/\\]/);
    let folderContext = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : 'Uncategorized';
    if (folderContext.toLowerCase() === 'backup' && pathParts.length >= 3) {
      folderContext = pathParts[pathParts.length - 3];
    }

    if (file.file_type === 'project') {
      rawProjects.push({ name: cleanName(file.name), file, isBackup, folderContext });
    }
  });

  const distinctProjectNames = Array.from(new Set(rawProjects.map((project) => project.folderContext)));

  distinctProjectNames.forEach((projectName) => {
    const sampleProject = rawProjects.find((project) => project.folderContext === projectName);
    const projectDirectory = sampleProject
      ? sampleProject.file.path.substring(0, Math.max(sampleProject.file.path.lastIndexOf('/'), sampleProject.file.path.lastIndexOf('\\')))
      : '';
    projectMap[projectName] = { mainProjects: [], backups: [], audioFiles: [], folderPath: projectDirectory };
  });

  // Files without a recognizable project folder remain visible instead of being discarded.
  if (!projectMap['Other Files']) {
    projectMap['Other Files'] = { mainProjects: [], backups: [], audioFiles: [], folderPath: '' };
  }

  files.forEach((file) => {
    const isBackup = file.path.toLowerCase().includes('\\backup\\') || file.path.toLowerCase().includes('/backup/');
    const pathParts = file.path.split(/[/\\]/);
    let folderContext = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : 'Other Files';
    if (folderContext.toLowerCase() === 'backup' && pathParts.length >= 3) {
      folderContext = pathParts[pathParts.length - 3];
    }

    if (file.file_type === 'project') {
      if (projectMap[folderContext]) {
        if (isBackup) projectMap[folderContext].backups.push(file);
        else projectMap[folderContext].mainProjects.push(file);
      } else {
        projectMap['Other Files'].mainProjects.push(file);
      }
    }
  });

  files.forEach((file) => {
    if (file.file_type !== 'audio') return;

    let bestMatch = 'Other Files';
    let highestScore = -1;
    let bestScoredAudio: ScoredAudioFile | null = null;

    distinctProjectNames.forEach((projectName) => {
      const groupData = projectMap[projectName];
      const mockLastModified = groupData.mainProjects.reduce(
        (max, projectFile) => Math.max(max, projectFile.modified),
        file.modified,
      );
      const scored = scoreAudioAssociation(file, projectName, mockLastModified, groupData.folderPath);

      if (scored.confidence > highestScore) {
        highestScore = scored.confidence;
        bestMatch = projectName;
        bestScoredAudio = scored;
      }
    });

    if (bestScoredAudio && highestScore >= 10) {
      projectMap[bestMatch].audioFiles.push(bestScoredAudio);
    } else {
      projectMap['Other Files'].audioFiles.push(scoreAudioAssociation(file, 'Other Files', file.modified, ''));
    }
  });

  return Object.keys(projectMap)
    .filter((name) => {
      const group = projectMap[name];
      return group.mainProjects.length > 0 || group.backups.length > 0 || group.audioFiles.length > 0;
    })
    .map((name) => {
      const projectOverrides = audioOverrides[name] || {};
      const activeAudioFiles: ScoredAudioFile[] = [];
      const archivedAudioFiles: ScoredAudioFile[] = [];

      projectMap[name].audioFiles.forEach((scored) => {
        const override = projectOverrides[scored.file.path];
        const isArchivedByDefault = scored.isInternalSample;
        const shouldBeActive = override ? override === 'active' : !isArchivedByDefault;

        if (shouldBeActive) activeAudioFiles.push(scored);
        else archivedAudioFiles.push(scored);
      });

      const groupFiles = [
        ...projectMap[name].mainProjects,
        ...projectMap[name].backups,
        ...activeAudioFiles.map((audio) => audio.file),
      ];
      const totalSize = groupFiles.reduce((sum, file) => sum + file.size, 0);
      const lastModified = groupFiles.reduce((max, file) => Math.max(max, file.modified), 0);
      const validCreatedTimes = groupFiles.map((file) => file.created).filter((time) => time > 0);
      const created = validCreatedTimes.length > 0 ? Math.min(...validCreatedTimes) : lastModified;
      const bpm = [...projectMap[name].mainProjects, ...projectMap[name].backups]
        .find((projectFile) => projectFile.bpm !== null)?.bpm ?? null;

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
        bpm,
      };
    });
}
