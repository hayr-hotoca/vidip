import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {Jimp} from 'jimp';

import "../../app/App.css";
import { calculateTimeDifference, getFileNameAndExtension, getImageSize, hideCenterInLongText, notify, saveFile, updatePremiumTokensUsed } from "../../features/app/app";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { RootState, store } from "@/app/store";

function ResizeImage() {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState("");
  const [status, setStatus] = useState("");
  const [resizeType, setResizeType] = useState<"width (px)" | "height (px)" | "width (%)" | "height (%)">("width (px)");
  const [resizeValue, setResizeValue] = useState<number>(0);
  const [afterResizedValue, setAfterResizedValue] = useState<number>(0);
  const [originalSize, setOriginalSize] = useState<{ width: number, height: number }>({ width: 0, height: 0 });
  const [resizedImageData, setResizedImageData] = useState<string | null>(null);
  const [resizedImageBlob, setResizedImageBlob] = useState<Blob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resizing, setResizing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    if (
      (filesDragInputPaths as any)['resize image']
      && (filesDragInputPaths as any)['resize image'].length
    ) {
      (async () => {
        const firstPath = (filesDragInputPaths as any)['resize image'][0];
        try {
          setStatus(t("Reading dropped file..."));
          // Read bytes from backend
          const bytes = await invoke<number[]>('read_file_bytes', { path: firstPath });
          const uint8 = new Uint8Array(bytes);

          // Infer mime type from extension
          const lower = firstPath.toLowerCase();
          const ext = lower.split('.').pop() || '';
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff',
            webp: 'image/webp',
            ico: 'image/x-icon',
          };
          const mime = mimeMap[ext] || 'application/octet-stream';

          const blob = new Blob([uint8], { type: mime });
          const filename = firstPath.split(/[\\\/]/).pop() || 'dropped_file';
          const file = new File([blob], filename, { type: mime });

          setSelectedFile(file);
          setInputPath(firstPath);
          handleSetOriginalSize(file);
          setStatus("");
        } catch (err) {
          setStatus(`${t('Error reading dropped file')}: ${err}`);
        }
      })();
    }
  }, [filesDragInputPaths]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (store.getState().app.plan === 'free') {
      if (store.getState().app.premiumTokensUsed + 1
        > store.getState().app.maxFreePremiumTokens
      ) {
          notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${store.getState().app.maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
        return;
      }
    }

    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setSelectedFile(file);
    setInputPath(file.name);
    handleSetOriginalSize(file);
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }


  function resizeImage() {
    if (!selectedFile) {
      notify(t("Please select input file"), "error");
      return;
    }

    setStatus(t("resizing") + '...');
    setResizing(true);

    setTimeout(async () => {
      try {
        const startDate = (new Date()).toISOString();
        
        // Validate file extension
        const fileExtension = selectedFile.name.toLowerCase().split('.').pop();
        const supportedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'ico'];
        
        if (!fileExtension || !supportedExtensions.includes(fileExtension)) {
          setStatus(`${t('Error: Unsupported file format. Supported formats')}: ${supportedExtensions.join(', ')}`);
          return;
        }
        
        // Read file using FileReader
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          const data = e.target?.result;
          
          if (!data || !(data instanceof ArrayBuffer)) {
            setResizing(false);
            setStatus("");
            notify(t("Error: Could not read file data"), "error");
            return;
          }
          
          try {
            // Create image from buffer
            const image = await Jimp.fromBuffer(data);
            
            // Resize based on selected type
            if (resizeType.includes('px')) {
              if (resizeType === "width (px)") {
                image.resize({w: resizeValue});
              } else {
                image.resize({ h: resizeValue });
              }
            }
  
            if (resizeType.includes('%')) {
              if (resizeType === "width (%)") {
                image.resize({w: (resizeValue/100)*originalSize.width});
              } else {
                image.resize({ h: (resizeValue/100)*originalSize.height });
              }
            }

            if (resizeType.includes('px')) {
              setAfterResizedValue(resizeValue);
            }

            if (resizeType.includes('%')) {
              if (resizeType === "width (%)") {
                setAfterResizedValue((resizeValue/100)*originalSize.width);
              } else {
                setAfterResizedValue((resizeValue/100)*originalSize.height);
              }
            }
            
            // Get image as buffer and create blob
            const buffer = await image.getBuffer('image/jpeg');
            const blob = new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' });
            const base64 = await image.getBase64('image/jpeg');
            
            setResizedImageBlob(blob);
            setResizedImageData(base64);
            notify(`${t('Success: Image resized! You can now download it. Finished in')}: ${calculateTimeDifference(startDate, (new Date()).toISOString()).seconds}s`, 'success');
            setResizing(false);
            setStatus("");
          } catch (imageError) {
            notify(`${t('Error processing image')}: ${imageError}`, 'error');
            setResizing(false);
            setStatus("");
          }
        };
        
        reader.onerror = () => {
          setResizing(false);
          setStatus("");
          notify(t("Error reading file"), 'error');
        };
        
        // Read file as ArrayBuffer
        reader.readAsArrayBuffer(selectedFile);
        
      } catch (error) {
        setResizing(false);
        setStatus("");
        notify(`${t('Error')}: ${error}`, 'error');
      }
    }, 10);
  }

  async function saveImage() {
    // Get original filename without extension
    const originalName = selectedFile?.name
      ? getFileNameAndExtension(selectedFile?.name)
      : { fileNameWithoutExt: 'image', fileExt: 'jpg' };
    const saveRes = await saveFile(
      resizedImageBlob,
      `${originalName.fileNameWithoutExt}_resized_${resizeType}_${resizeValue}.${originalName.fileExt}`
    );
    if (!saveRes.success) {
      if (saveRes.e === "Save cancelled") return;
      return notify(`${t('Error')}: ${saveRes.e}`, 'error');
    }

    await updatePremiumTokensUsed();
    notify(t("Image saved successfully!"), 'success');
  }

  function handleSetOriginalSize(file: Blob) {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const data = e.target?.result;
      
      if (!data || !(data instanceof ArrayBuffer)) {
        notify(t("Error: Could not read file data"), 'error');
        return;
      }
      
      try {
        // Create image from buffer
        const image = await Jimp.fromBuffer(data);
        const size = await getImageSize(image);
        setOriginalSize(size);
        setResizeValue(resizeType === 'width (px)' ? size.width : size.height);
        
      } catch (imageError) {
        notify(`${t('Error processing image')}: ${imageError}`, 'error');
      }
    };
    
    reader.onerror = () => {
      notify(`${t('Error reading file')}`, 'error');
    };
    
    // Read file as ArrayBuffer
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="px-5 mt-2 pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      <div 
        className="drop-zone"
        id="drop-zone"
        onClick={triggerFileInput}
      >
        <div className="drop-zone-text">
          <div
						title={hideCenterInLongText(inputPath).includes('...') ? inputPath : ''}
						className="file-path"
					>{hideCenterInLongText(inputPath)}</div>
          <span>{t('Drag & drop or click to select image')}</span>
          <small>{t('any image type')}</small>
        </div>
      </div>

      <div className="resize-options flex justify-end items-center flex-wrap">
        <div className="flex mr-4">
          <label className="mr-3" style={{ display: 'block', fontWeight: 'bold' }}>
            {t('Original size')}:
            <span className="font-medium ml-2">{originalSize.width}/{originalSize.height}</span>
          </label>
          <label className="mr-2" style={{ display: 'block', fontWeight: 'bold' }}>
            {t('Resize option')}:
          </label>
          <select
            value={resizeType}
            onChange={(e) => {
              setResizeType(e.target.value as "width (px)" | "height (px)" | "width (%)" | "height (%)");

              const resizeValueInputEl = document.getElementById('resize-value');
              if (e.target.value.includes('%')
                && resizeValue > 1000
              ) {
                setResizeValue(1000);
                if (resizeValueInputEl) {
                  // @ts-ignore
                  resizeValueInputEl.value = 1000;
                }
              } else if (e.target.value.includes('px')
                && resizeValue > 20000
              ) {
                setResizeValue(20000);
                if (resizeValueInputEl) {
                  // @ts-ignore
                  resizeValueInputEl.value = 20000;
                } 
              }
            }}
            className="h-[25px]"
          >
            <option value="width (px)">{t('width (px)')}</option>
            <option value="height (px)">{t('height (px)')}</option>
            <option value="width (%)">{t('width (%)')}</option>
            <option value="height (%)">{t('height (%)')}</option>
          </select>
        </div>
        
        <div className="flex items-center">
          <label
            style={{ display: 'block', fontWeight: 'bold' }}
            className="mr-2"
          >
            {t(resizeType)}:
          </label>
          <input
            id='resize-value'
            type="number"
            value={resizeValue}
            onChange={(e) => {
              const resizeValueInputEl = document.getElementById('resize-value');

              if (resizeType.includes('%')
                && parseInt(e.target.value) > 1000
              ) {
                setResizeValue(1000);
                if (resizeValueInputEl) {
                  // @ts-ignore
                  resizeValueInputEl.value = 1000;
                }
              } else if (resizeType.includes('px')
                && parseInt(e.target.value) > 20000
              ) {
                setResizeValue(20000);
                if (resizeValueInputEl) {
                  // @ts-ignore
                  resizeValueInputEl.value = 20000;
                }
              } else {
                setResizeValue(parseInt(e.target.value) || resizeValue);
              }
            }}
            min="1"
            max={resizeType.includes('%') ? "1000" : "20000"}
            style={{
              width: 80,
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '14px',
              height: 30
            }}
          />
        </div>
      </div>

      <div className="row">
        <button 
          type="button" 
          onClick={resizeImage}
          disabled={!selectedFile || resizing}
          className="compress-btn"
        >
          {resizing ? t('resizing') + '...' : t('Resize') + ' ' + t('image')}
        </button>
      </div>

      {resizedImageData && (
        <div style={{ marginTop: '20px' }}>
          <h3 className="mb-2">{t('Preview & save resized image')}:</h3>
          <div
            className="overflow-auto max-w-2/3 max-h-[400px] mx-auto"
            style={{ 
              border: '1px solid #ccc', 
              padding: '10px', 
              borderRadius: '8px',
              backgroundColor: '#f9f9f9',
              marginBottom: '10px'
            }}
          >
            <img 
              src={resizedImageData} 
              alt="Resized preview" 
              style={{ 
                maxWidth: resizeType.startsWith('width') ? afterResizedValue : 'unset', 
                maxHeight: resizeType.startsWith('height') ? afterResizedValue : 'unset',
                display: 'block',
                margin: '0 auto'
              }} 
            />
          </div>
          <button 
            type="button" 
            onClick={saveImage}
            className="compress-btn"
            style={{ 
              backgroundColor: '#28a745',
              borderColor: '#28a745'
            }}
          >
            {t('Save resized image')}
          </button>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}

export default ResizeImage;

