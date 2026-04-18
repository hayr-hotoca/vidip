import { useState, useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";
import { useTranslation } from 'react-i18next';
import { hideCenterInLongText, notify, updatePremiumTokensUsed, formatTime } from "@/features/app/app";

import "./TrimVideo.css";
import { useSelector } from 'react-redux';
import { RootState, store } from '@/app/store';
import { saveSelectedFilesState } from '@/features/file/file';

function Trim() {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState<string>("");
  const [tempVideoSource, setTempVideoSource] = useState<string>("");
  const [outputDir, setOutputDir] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<string>("");
  
  // Video player states
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  // Trim markers
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [isDraggingStart, setIsDraggingStart] = useState<boolean>(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState<boolean>(false);

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  // Drag and drop functionality (reused from ResizeImage)
  useEffect(() => {
    if ((filesDragInputPaths as any)['trim video']
      && (filesDragInputPaths as any)['trim video'].length) {
      (async () => {
        const firstPath = (filesDragInputPaths as any)['trim video'][0];
        setInputPath(firstPath);

        const response = await invoke('upload_video', {
          videoUri: firstPath,
          filename: firstPath.split('/').pop() || `for_trimming.mp4`
        });

        setTempVideoSource((response as { url: string }).url);
      })();
    }
  }, [filesDragInputPaths]);

  // Add and remove event listeners
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingStart, isDraggingEnd, duration, startTime, endTime]);

  // Update current time during playback
  useEffect(() => {
    const updateTime = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
        
        // Pause video if it reaches end marker during playback
        if (videoRef.current.currentTime >= endTime) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };
    
    const interval = setInterval(updateTime, 50);
    return () => clearInterval(interval);
  }, [endTime]);

  // Handle play/pause
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // If current time is at or past end marker, reset to start marker
        if (currentTime >= endTime) {
          videoRef.current.currentTime = startTime;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Listen for trim progress events
  useEffect(() => {
    const unlisten = listen("trim_progress", (event) => {
      const progress = event.payload as number;
      setProgress(progress);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return (
    <div style={{ paddingBottom: 100 }}>
      <div>
        <div
					style={{ height: tempVideoSource ? 100 : '100%' }}
          className="drop-zone"
          id="drop-zone"
          onClick={triggerFileInput}
        >
          <div className="drop-zone-text">
            <div
              title={hideCenterInLongText(inputPath).includes('...') ? inputPath : ''}
              className="file-path"
							style={{
								padding: tempVideoSource ? 0 : 10,
								marginBottom: tempVideoSource ? -6 : 'unset'
							}}
            >
              {hideCenterInLongText(inputPath)}
            </div>
            <span
							style={{
								marginBottom: tempVideoSource ? -6 : 10
							}}
						>{t('Drag & drop or click to select a video')}</span>
            <small>{t('mp4, avi, mov, mkv, wmv, webm, ...')}</small>
          </div>
        </div>
			</div>

      {tempVideoSource && <div
				className="video-section h-full relative inline-block"
			>
        <video
          ref={videoRef}
          className="video-player"
          src={tempVideoSource}
          onLoadedMetadata={handleVideoLoaded}
          onClick={togglePlayPause}
          style={{ width: '100%', borderRadius: 8 }}
        />
       	<div className='absolute bottom-[10px] left-[10px]' style={{ color: 'white' }}>
					{formatTime(currentTime).split('.')[0]}/{formatTime(duration).split('.')[0]}
      	</div>

        {/* Glass Play Button */}
        {!isPlaying && (
          <div
            className={`glass-play-button ${!isPlaying ? 'fade-in' : 'fade-out'}`}
            onClick={() => {
              togglePlayPause();
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
              <polygon points="24,18 24,46 46,32" />
            </svg>
          </div>
        )}
      </div>}
      
      {tempVideoSource && (
        <div className="video-controls">
          <div 
            className="timeline-container"
            ref={timelineRef}
            onClick={handleTimelineClick}
          >
            <div className="timeline-progress" style={{ width: `${(currentTime / duration) * 100}%` }} />
            
            <div 
              className="trim-marker start-marker"
              style={{ left: `${(startTime / duration) * 100}%`, zIndex: 0 }}
              onMouseDown={() => setIsDraggingStart(true)}
            />
            
            <div 
              className="trim-section"
              style={{ 
                left: `${(startTime / duration) * 100}%`,
                width: `${((endTime - startTime) / duration) * 100}%`
              }}
            />
            
            <div 
              className="trim-marker end-marker z-0"
              style={{ left: `${(endTime / duration) * 100}%` }}
              onMouseDown={() => setIsDraggingEnd(true)}
            />
          </div>
          
          <div className="time-display">
            <span>{formatTime(startTime).split('.')[0]}</span>
            <span>{formatTime(endTime - startTime).split('.')[0]}</span>
            <span>{formatTime(endTime).split('.')[0]}</span>
          </div>
        </div>
      )}
      
      <div className="row file-select">
        <div
          title={outputDir && hideCenterInLongText(outputDir).includes('...') ? outputDir : ''}
          className="file-path"
        >
          {hideCenterInLongText(outputDir) || t('No output directory selected')}
        </div>
        <button type="button" onClick={selectOutputDir}>{t('Select output directory')}</button>
      </div>
      
      <div className="row">
        <button
          type="button"
          onClick={trimVideo}
          disabled={!tempVideoSource || !outputDir || isProcessing || startTime === endTime}
          className="trim-btn"
        >
          {t('Trim')}
        </button>
      </div>
      
      {status && (
        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="status-text">{status}</div>
        </div>
      )}
    </div>
  );

  // Handle output directory selection
  async function selectOutputDir() {
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });
      
      if (selected && !Array.isArray(selected)) {
        setOutputDir(selected);
      }
    } catch (error) {
      console.error("Error selecting output directory:", error);
    }
  };

  // Handle video metadata loaded
  function handleVideoLoaded() {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
      setEndTime(videoDuration);
    }
  };

  // Handle timeline click
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (timelineRef.current && videoRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const clickPosition = offsetX / rect.width;
      const newTime = clickPosition * duration;
      
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Handle marker drag
  function handleMouseMove(e: MouseEvent) {
    if (!isDraggingStart && !isDraggingEnd) return;
    
    if (timelineRef.current && videoRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const position = Math.max(0, Math.min(1, offsetX / rect.width));
      const newTime = position * duration;
      
      if (isDraggingStart) {
        const validStartTime = Math.min(newTime, endTime - 0.5);
        setStartTime(validStartTime);
        videoRef.current.currentTime = validStartTime;
        setCurrentTime(validStartTime);
      } else if (isDraggingEnd) {
        const validEndTime = Math.max(newTime, startTime + 0.5);
        setEndTime(validEndTime);
        videoRef.current.currentTime = validEndTime;
        setCurrentTime(validEndTime);
      }
    }
  };

  // Handle mouse up event
  function handleMouseUp() {
    setIsDraggingStart(false);
    setIsDraggingEnd(false);
  };

  async function trimVideo() {
    if (!tempVideoSource || !outputDir) return;
    
    try {
      setIsProcessing(true);
      setStatus(t('Processing'));
      setProgress(0);

      const filename = inputPath.split('/').pop() || `output_trimmed.mp4`;
      const fileExt = inputPath.split('.').pop() || "mp4";

      // check output folder for duplicated filename, if found a duplicate create
      // a method in lib.rs to return the new filename of `${filename}_{1 or 2 or 3, or so on}
      // if not found duplicate return current filename
      const baseName = filename.replace(/\.[^/.]+$/, "");
      const desiredStem = `${baseName}_trimmed`;
      const output = await invoke<string>("unique_output_filename", {
        baseDir: outputDir,
        stem: desiredStem,
        ext: fileExt,
      });
      
      // Get ffmpeg path
      const resourcePath = await resolveResource("binaries/ffmpeg-aarch64-apple-darwin");

      // Call Rust function to trim video
      await invoke("trim_video", {
        inputPath,
        outputPath: output,
        ffmpegPath: resourcePath,
        startTime: formatTime(startTime),
        endTime: formatTime(endTime)
      });
      
      notify(t('Success'), 'success');
      setProgress(100);
      setStatus("");

      await updatePremiumTokensUsed();
    } catch (error) {
      notify(`${t('Error')}: ${error}`, 'error');
      setProgress(0);
    } finally {
      setStatus("");
      setIsProcessing(false);
    }
  };

  async function triggerFileInput() {
		try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm'] }]
      });

        if (store.getState().app.plan === 'free') {
          if (store.getState().app.premiumTokensUsed
            + 1 > store.getState().app.maxFreePremiumTokens
          ) {
            notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${store.getState().app.maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
            return;
          }
        }
      
			if (selected) {
        saveSelectedFilesState([selected]);
        setInputPath(selected);

        const response = await invoke('upload_video', {
          videoUri: selected,
          filename: selected.split('/').pop() || `output_trimmed.mp4`
        });

        setTempVideoSource((response as { url: string }).url);
      }
    } catch (error) {
      notify(`${t('Error selecting file')}: ${error}`, 'error');
    }
  };
}

export default Trim;