import { useEffect, useRef, useState } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import type { CommentItem } from '../types/project';
import { computeRmsWaveform } from '../utils/waveform';

// This component owns one audio element so playback state cannot leak between tracks.
export function InteractiveWaveform({
  audioPath,
  active,
  comments,
  onAddComment,
}: {
  audioPath: string;
  active?: boolean;
  comments: CommentItem[];
  onAddComment: (timestampSecs: number, text: string) => void;
}) {
  // Playback state is local because each visible waveform has an independent playhead.
  const [selectedTimeSecs, setSelectedTimeSecs] = useState<number>(0);
  const [totalDurationSecs, setTotalDurationSecs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [bars, setBars] = useState<{ top: number; bottom: number }[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Loading through Tauri keeps filesystem paths out of the browser URL layer.
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

        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        if (audioRef.current && isMounted) {
          audioRef.current.src = url;
          audioRef.current.load();
        }

        // Decoding gives a real waveform; the fallback keeps the player usable for unsupported codecs.
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength);
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const rmsValues = computeRmsWaveform(audioBuffer, 260);

          if (isMounted) {
            setBars(rmsValues.map((rmsValue) => ({
              top: Math.max(12, Math.floor(rmsValue * 92)),
              bottom: Math.max(8, Math.floor(rmsValue * 75)),
            })));
          }
        } catch (decodeErr) {
          console.warn('Could not decode audio for waveform analysis, using placeholder:', decodeErr);
          if (isMounted) {
            setBars(Array.from({ length: 260 }, () => ({
              top: Math.random() * 80 + 20,
              bottom: Math.random() * 60 + 15,
            })));
          }
        }
      } catch (err: any) {
        console.error('Failed to load audio file:', err);
        if (isMounted) setErrorMsg(err.message || 'Could not load audio file');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadAudio();

    return () => {
      isMounted = false;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [audioPath]);

  // Playback always resumes from the selected playhead, matching the original player behavior.
  const togglePlayPause = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!audioRef.current || isLoading) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.currentTime = selectedTimeSecs;
      audioRef.current.play().then(() => setIsPlaying(true)).catch((err) => {
        console.error('Playback error:', err);
        setErrorMsg('Playback error');
      });
    }
  };

  // Convert a click position into a timestamp for direct seeking.
  const handleWaveformClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const durationToUse = totalDurationSecs > 0 ? totalDurationSecs : (audioRef.current?.duration || 1);
    const newSecs = percentage * durationToUse;

    setSelectedTimeSecs(newSecs);
    if (audioRef.current) audioRef.current.currentTime = newSecs;
  };

  // Comments are emitted upward so the parent can keep them associated with the file path.
  const handleCommentSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(selectedTimeSecs, commentText.trim());
    setCommentText('');
  };

  // Keep this local formatter tied to the waveform's display conventions.
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const durationToCalc = totalDurationSecs > 0 ? totalDurationSecs : (audioRef.current?.duration || 1);
  const playheadPercent = durationToCalc > 0 ? (selectedTimeSecs / durationToCalc) * 100 : 0;

  return (
    <div className="waveform-widget-container">
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setSelectedTimeSecs(audioRef.current.currentTime);
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

        {comments.map((comment) => {
          const leftPct = durationToCalc > 0 ? (comment.timestampSecs / durationToCalc) * 100 : 0;
          return (
            <div
              key={comment.id}
              className="waveform-comment-marker"
              style={{ left: `${leftPct}%` }}
              title={`[${comment.timeStr}] ${comment.text}`}
            />
          );
        })}

        <div className="waveform-bars-container">
          {bars.map((bar, index) => (
            <div key={index} className="waveform-bar-column">
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
            onChange={(event) => setCommentText(event.target.value)}
            className="waveform-comment-input"
            onClick={(event) => event.stopPropagation()}
          />
          <button type="submit" className="waveform-comment-btn" onClick={(event) => event.stopPropagation()}>
            Post
          </button>
        </form>
      </div>

      {comments.length > 0 && (
        <div className="comments-list">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="comment-pill"
              onClick={() => {
                setSelectedTimeSecs(comment.timestampSecs);
                if (audioRef.current) audioRef.current.currentTime = comment.timestampSecs;
              }}
            >
              <span className="comment-timestamp">{comment.timeStr}</span>
              <span className="comment-text">{comment.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
