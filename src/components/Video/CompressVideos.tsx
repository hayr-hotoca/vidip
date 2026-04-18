import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { resolveResource } from '@tauri-apps/api/path';
import { listen } from "@tauri-apps/api/event";
import { calculateTimeDifference, hideCenterInLongText, notify, updatePremiumTokensUsed } from "@/features/app/app";
import "@/app/App.css";
import { useTranslation } from 'react-i18next';
import { COMPRESS_LEVEL, MAX_FILES } from "@/common/utils/constants";
import { useSelector } from "react-redux";
import { RootState, store } from "@/app/store";
import { saveSelectedFilesState } from "@/features/file/file";

function CompressVideos() {
  const { t } = useTranslation();
  const [inputPaths, setInputPaths] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [statusList, setStatusList] = useState<string[]>([]);
  const [progressList, setProgressList] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressLevel, setCompressLevel] = useState(COMPRESS_LEVEL);
  // compressLevelsObj[29] is 23 in ffmpeg -crf <number>
  const [compressLevelSliderValue, setCompressLevelSliderValue] = useState('29');

  const compressLevelsObj: { [key: number]: number } = {};
  for (let i = 1, value = 51; i <= 29; i++, value--) {
    compressLevelsObj[i] = value;
  }

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    if ((filesDragInputPaths as any)['compress videos']
      && (filesDragInputPaths as any)['compress videos'].length
    ) {
      setInputPaths((filesDragInputPaths as any)['compress videos']);
    }
  }, [filesDragInputPaths]);

  return (
    <div style={{ paddingBottom: 65 }}>
      <div className="drop-zone" onClick={selectInputFiles}>
        <div className="drop-zone-text">
          {inputPaths.length > 0 && inputPaths.map((p, i) => 
            <div
              title={hideCenterInLongText(p).includes('...') ? p : ''}
              className="file-path"
              key={i}
            >
              {hideCenterInLongText(p)}
            </div>
          )}
          <span>{t('Drag & drop or click to select videos')}</span>
          <small>{t('mp4, avi, mov, wmv, mkv, webm')}</small>
          <small>{t('Up to 5 videos')}</small>
        </div>
      </div>
      <div className="row file-select">
        <div
          title={outputDir && hideCenterInLongText(outputDir).includes('...') ? outputDir : ''}
          className="file-path"
        >
          {hideCenterInLongText(outputDir) || t('No save location selected')}
        </div>
        <button type="button" onClick={selectOutputDir}>{t('Select output folder')}</button>
      </div>
      <div className="row">
        <div className="float-right w-1/3 mt-5">
          <div
            style={{ marginBottom: -8 }}
            className="flex justify-between"
          >
            <small>{t('Smallest size')}</small>
            <small>{t('Best quality')}</small>
          </div>
          <input
            type="range"
            min="1"
            max="29"
            value={compressLevelSliderValue}
            onChange={(event) => {
              const sliderValue = event.target.value;
              setCompressLevelSliderValue(sliderValue);
              setCompressLevel(compressLevelsObj[parseInt(sliderValue)]);
            }}
            id="myRange"
          />
        </div>
        <button
          style={{ marginTop: 4 }}
          type="button"
          onClick={compressVideos}
          disabled={!inputPaths.length || !outputDir || isProcessing} className="compress-btn"
        >
          {t('Compress')}
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
      notify(`${t('Error selecting file')}: ${error}`, 'error');
    }
  }

  async function selectOutputDir() {
    try {
      const selected = await open({ directory: true });
      if (selected) {
        setOutputDir(selected as string);
      }
    } catch (error) {
      notify(`${t('Error selecting folder')}: ${error}`, 'error');
    }
  }

  async function compressVideos() {
    setIsProcessing(true);
    setStatusList(inputPaths.map(() => t('Waiting')));
    setProgressList(inputPaths.map(() => 0));
    const resourcePath = await resolveResource('binaries/ffmpeg-aarch64-apple-darwin');
    for (let i = 0; i < inputPaths.length; i++) {
      const input = inputPaths[i];
      const filename = input.split('/').pop() || `output_compressed_${i}.mp4`;
      const fileExt = input.split('.').pop() || "mp4";

      // check output folder for duplicated filename, if found a duplicate create
      // a method in lib.rs to return the new filename of `${filename}_{1 or 2 or 3, or so on}
      // if not found duplicate return current filename
      const baseName = filename.replace(/\.[^/.]+$/, "");
      const desiredStem = `${baseName}_compressed`;
      const output = await invoke<string>("unique_output_filename", {
        baseDir: outputDir,
        stem: desiredStem,
        ext: fileExt,
      });
      setStatusList(list => list.map((s, idx) => idx === i ? t('Processing') : s));
      setProgressList(list => list.map((p, idx) => idx === i ? 0 : p));
      const startDate = (new Date()).toISOString();
      let unsub: any;
      try {
        unsub = await listen<number>('compress_progress', (event) => {
          setProgressList(list => list.map((p, idx) => idx === i ? event.payload : p));
          setStatusList(list => list.map((s, idx) => idx === i ? `${t('Processing')} ${event.payload}%` : s));
        });
        await invoke("compress_video", {
          inputPath: input,
          outputPath: output,
          ffmpegPath: resourcePath,
          compressLevel: compressLevel,
        });
        setStatusList(list => list.map((s, idx) => idx === i ? `${t('Success')} (${calculateTimeDifference(startDate, (new Date()).toISOString()).seconds}s)` : s));
        setProgressList(list => list.map((p, idx) => idx === i ? 100 : p));

        await updatePremiumTokensUsed();
      } catch (error) {
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
    // Do not reset statusList/progressList so user can see results
  }
}

export default CompressVideos;
