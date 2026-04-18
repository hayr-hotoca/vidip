import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';

import "./MergeVideos.css";
import { getFileNameAndExtension, hideCenterInLongText, notify, updatePremiumTokensUsed } from "@/features/app/app";
import { useSelector } from "react-redux";
import { RootState, store } from "@/app/store";
import { saveSelectedFilesState } from "@/features/file/file";

function MergeVideos() {
  const { t } = useTranslation();
  const [videoPaths, setVideoPaths] = useState<string[]>([]);
  const [outputPath, setOutputPath] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<number>(0);
  const [firstVideoFileExt, setFirstVideoFileExt] = useState<string>('mp4');
  const [finalMergedVideoFilenameWithoutExt, setFinalMergedVideoFilenameWithoutExt] = useState<string>('');

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    // Listen for merge progress
    const unlisten = listen<number>('merge_progress', (event) => {
      setProgress(event.payload);
      setStatus(t('Merging videos') + `...: ${event.payload}%`);
    });
    return () => {
      unlisten.then(fn => fn());
    };
  }, [t]);

  useEffect(() => {
    if (
      (filesDragInputPaths as any)['merge videos']
      && (filesDragInputPaths as any)['merge videos'].length
    ) {
      setVideoPaths(prev => [...new Set([...prev, ...(filesDragInputPaths as any)['merge videos']])]);
      const selectedFilename = getFileNameAndExtension((filesDragInputPaths as any)['merge videos'][0].split("/").pop() || '');

        setFirstVideoFileExt(selectedFilename.fileExt || 'mp4');

        let filenameWithoutExt = selectedFilename.fileNameWithoutExt;
        const last4Chars = filenameWithoutExt.substring(filenameWithoutExt.length-4);

        if (/^\d{4}$/.test(last4Chars)) {
          // final merge app uri must not contain 0000, 0001, 0002, ...
          filenameWithoutExt = filenameWithoutExt.substring(0, filenameWithoutExt.length-4);
          if (filenameWithoutExt.endsWith("_")) {
            filenameWithoutExt = filenameWithoutExt.substring(0, filenameWithoutExt.length-1);
          }
        }

        setFinalMergedVideoFilenameWithoutExt(filenameWithoutExt);
    }
  }, [filesDragInputPaths]);

  return (
    <div style={{ paddingBottom: 100 }}>
      <div className="drop-zone" onClick={selectVideos}>
        <div className="drop-zone-text">
          <span>{t('Drag & drop or click to select videos')}</span>
          <small>{t('mp4, avi, mov, mkv, wmv, webm, ...')}</small>
        </div>
      </div>

      {videoPaths.length > 0 && <div className="selected-videos">
        {videoPaths.map((path, index) => (
          <div key={path} className="video-item">
            <span
              title={path && hideCenterInLongText(path).includes('...') ? path : ''}
              className="video-path"
            >{hideCenterInLongText(path)}</span>
            <button 
              onClick={() => removeVideo(index)}
              className="remove-btn"
            >
              ✕
            </button>
          </div>
        ))}
      </div>}

      <div className="row file-select">
        <div
          title={outputPath && hideCenterInLongText(outputPath).includes('...') ? outputPath : ''}
          className="file-path"
        >{hideCenterInLongText(outputPath) || t("No save location selected")}</div>
        <button type="button" onClick={selectOutputPath}>
          {t('Select output folder')}
        </button>
      </div>

      <div className="row">
        <button 
          type="button" 
          onClick={mergeVideos}
          disabled={videoPaths.length < 2 || !outputPath}
          className="merge-btn"
        >
          {t('Merge Videos')}
        </button>
      </div>

      {progress > 0 && progress < 100 && (
        <div style={{ width: '100%', background: '#eee', borderRadius: 4, marginTop: 10 }}>
          <div style={{ width: `${progress}%`, background: '#2c6bed', height: 16, borderRadius: 4, transition: 'width 0.2s' }} />
        </div>
      )}
      {status && <p className="status">{status}</p>}
    </div>
  );

  async function selectVideos() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Video',
          extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm']
        }]
      });

      if (store.getState().app.plan === 'free') {
        if (store.getState().app.premiumTokensUsed + 1
          > store.getState().app.maxFreePremiumTokens
        ) {
          notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${store.getState().app.maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
          return;
        }
      }

      setVideoPaths([]);
      if (selected && Array.isArray(selected)) {
        saveSelectedFilesState(selected);
      }
    } catch (error) {
      notify(t('Error selecting files') + `: ${String(error)}`, 'error');
    }
  }

  async function selectOutputPath() {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setOutputPath(selected as string);
      }
    } catch (error) {
      notify(`${t('Error selecting folder')}: ${error}`, 'error');
    }
  }

  async function mergeVideos() {
    if (videoPaths.length < 2) {
      notify(t("Please select at least 2 videos to merge"), 'error');
      return;
    }
    if (!outputPath) {
      notify(t("Please select save location"), 'error');
      return;
    }

    try {
      setStatus(t("Merging videos") + '...');
      setProgress(0);
      const desiredStem = `${finalMergedVideoFilenameWithoutExt}`;
      const output = await invoke<string>("unique_output_filename", {
        baseDir: outputPath,
        stem: desiredStem,
        ext: firstVideoFileExt,
      });

      const resourcePath = await resolveResource('binaries/ffmpeg-aarch64-apple-darwin');
      const result = await invoke("merge_videos", {
        videoPaths,
        outputPath: output,
        ffmpegPath: resourcePath,
      });
      notify(t("Success") + `: ${String(result)}`, 'success');
      setProgress(100);

      await updatePremiumTokensUsed();
      setStatus("");
    } catch (error) {
      notify(t("Error") + `: ${String(error)}`, 'error');
      setStatus("");
      setProgress(0);
    }
    setVideoPaths([]);
    setOutputPath("");
  }

  function removeVideo(index: number) {
    setVideoPaths(prev => prev.filter((_, i) => i !== index));
  }
}

export default MergeVideos;
