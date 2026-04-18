import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { resolveResource } from "@tauri-apps/api/path";

import "./SplitVideo.css";
import { useTranslation } from 'react-i18next';
import { hideCenterInLongText, notify, updatePremiumTokensUsed } from "@/features/app/app";
import { RootState, store } from "@/app/store";
import { useSelector } from "react-redux";
import { MAX_FILES } from "@/common/utils/constants";
import { saveSelectedFilesState } from "@/features/file/file";

function SplitVideo() {
  const { t } = useTranslation();
  const [inputPaths, setInputPaths] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [statusList, setStatusList] = useState<string[]>([]);
  const [progressList, setProgressList] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // NEW STATES
  const [splitMode, setSplitMode] = useState<"time" | "parts">("time");
  const [timeUnit, setTimeUnit] = useState<"seconds" | "minutes" | "hours">("seconds");
  const [chunkValue, setChunkValue] = useState<string>("");

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    if ((filesDragInputPaths as any)['split videos']
      && (filesDragInputPaths as any)['split videos'].length
    ) {
      setInputPaths((filesDragInputPaths as any)['split videos']);
    }
  }, [filesDragInputPaths]);

  // VALIDATION
  const chunkNum = parseInt(chunkValue, 10);
  const isValid =
    splitMode === "time"
      ? chunkNum >= 1
      : chunkNum >= 2;

  return (
    <div style={{ paddingBottom: 90 }}>
      <div className="drop-zone" onClick={selectInputFiles}>
        <div className="drop-zone-text">
          {inputPaths.length > 0 && inputPaths.map((p, i) => 
            <div
              title={p && hideCenterInLongText(p).includes('...') ? p : ''}
              className="file-path"
              key={i}
            >{hideCenterInLongText(p)}</div>
          )}
          <span>{t('Drag & drop or click to select videos')}</span>
          <small>{t('mp4, avi, mov, mkv, wmv, webm, ...')}</small>
          <small>{t('Up to 5 videos')}</small>
        </div>
      </div>

      <div className="row file-select">
        <div
          title={outputDir && hideCenterInLongText(outputDir).includes('...') ? outputDir : ''}
          className="file-path"
        >
          {hideCenterInLongText(outputDir) || t('No output directory selected')}
        </div>
        <button type="button" onClick={selectOutputDir}>{t('Select output directory')}</button>
      </div>

      {/* NEW CONTROLS BELOW SPLIT BUTTON */}
      <div
        className="row"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginTop: 20,
          gap: 10
        }}
      >
        <select value={splitMode} onChange={(e) => setSplitMode(e.target.value as "time" | "parts")}>
          <option value="time">{t('By time')}</option>
          <option value="parts">{t('By parts')}</option>
        </select>

        {splitMode === "time" && (
          <select value={timeUnit} onChange={(e) => setTimeUnit(e.target.value as any)}>
            <option value="seconds">{t('seconds')}</option>
            <option value="minutes">{t('minutes')}</option>
            <option value="hours">{t('hours')}</option>
          </select>
        )}

        <input
          type="number"
          min={splitMode === "time" ? 1 : 2}
          placeholder={t("a number")}
          value={chunkValue}
          onChange={(e) => setChunkValue(e.target.value)}
          style={{ width: 150 }}
        />
      </div>

      {/* Split button */}
      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={splitVideos}
          disabled={!inputPaths.length || !outputDir || isProcessing || !isValid}
          className="split-btn"
        >
          {t('Split')}
        </button>
      </div>

      {statusList.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {statusList.map((status, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 500 }}>{inputPaths[i] ? inputPaths[i].split("/").pop() : ''}</div>
              <div style={{ width: '100%', background: '#eee', borderRadius: 4 }}>
                <div style={{ width: `${progressList[i] || 0}%`, background: '#2c6bed', height: 16, borderRadius: 4, transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: 13 }}>{status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  async function selectInputFiles() {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'webm'] }]
      });
      if (selected && Array.isArray(selected)) {
        const limited = selected.slice(0, MAX_FILES);

        if (store.getState().app.plan === 'free') {
          if (store.getState().app.premiumTokensUsed
            + limited.length > store.getState().app.maxFreePremiumTokens
          ) {
            notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${store.getState().app.maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
            return;
          }
        }

        if (selected.length > MAX_FILES) {
          notify(t('You can select up to 5 videos'), "error");
        }
        saveSelectedFilesState(limited);
      }
    } catch (error) {
      notify(`${t('Error selecting files')}: ${error}`, 'error');
    }
  }

  async function selectOutputDir() {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setOutputDir(selected as string);
      }
    } catch (error) {
      notify(`${t('Error selecting save location')}: ${error}`, 'error');
    }
  }

  async function splitVideos() {
    setIsProcessing(true);
    setStatusList(inputPaths.map(() => t('Waiting')));
    setProgressList(inputPaths.map(() => 0));
    const resourcePath = await resolveResource('binaries/ffmpeg-aarch64-apple-darwin');

    const value = parseInt(chunkValue, 10);
    const isByTime = splitMode === "time";

    for (let i = 0; i < inputPaths.length; i++) {
      const input = inputPaths[i];
      const filename = input.split('/').pop()?.split('.')[0] || `output_${i}`;
      const fileExt = input.split('.').pop() || "mp4";
      const outputSubDir = await invoke<string>("unique_output_subdir", {
        baseDir: outputDir,
        filename,
      });
      const outputPattern = `${outputSubDir}/${filename}_%04d.${fileExt}`;
      setStatusList(list => list.map((s, idx) => idx === i ? t('Processing') : s));
      setProgressList(list => list.map((p, idx) => idx === i ? 0 : p));
      let unsub: any;
      try {
        unsub = await listen<number>('split_progress', (event) => {
          setProgressList(list => list.map((p, idx) => idx === i ? event.payload : p));
          setStatusList(list => list.map((s, idx) => idx === i ? `${t('Processing')} ${event.payload}s` : s));
        });
        await invoke("split_video", {
          inputPath: input,
          outputPattern,
          ffmpegPath: resourcePath,
          byTime: isByTime,
          unit: timeUnit, // "seconds" | "minutes" | "hours"
          value          // either chunk size (time) or parts count
        });
        setStatusList(list => list.map((s, idx) => idx === i ? t('Success') : s));
        setProgressList(list => list.map((p, idx) => idx === i ? 100 : p));

        notify(t('Success'), 'success');
        await updatePremiumTokensUsed();
      } catch (error) {
        notify(`${t('Error')}: ${error}`, 'error');
        setStatusList(list => list.map((s, idx) => idx === i ? `${t('Error')}: ${error}` : s));
        setProgressList(list => list.map((p, idx) => idx === i ? 0 : p));
      } finally {
        if (unsub) {
          unsub();
        }
      }
    }
    setIsProcessing(false);
    setInputPaths([]);
    setOutputDir("");
  }
}

export default SplitVideo;
