import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Jimp } from 'jimp';

import '../../app/App.css';
import { calculateTimeDifference, getFileNameAndExtension, hideCenterInLongText, notify, saveFile, updatePremiumTokensUsed } from '../../features/app/app';
import { useTranslation } from 'react-i18next';
import { RootState, store } from '@/app/store';
import { useSelector } from 'react-redux';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

let rotationTextInputTimeout: NodeJS.Timeout;

function CropAndRotateImage() {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState('');
  const [status, setStatus] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>({ width: 0, height: 0 });
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [rotation, setRotation] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string>('');
  const [croppedImageData, setCroppedImageData] = useState<string | null>(null);
  const [croppedImageBlob, setCroppedImageBlob] = useState<Blob | null>(null);
  const [rotatedImageBlob, setRotatedImageBlob] = useState<Blob | null>(null);
  const [hasRotated, setHasRotated] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const {
    filesDragInputPaths,
  } = useSelector((state: RootState) => state.app);

  useEffect(() => {
    if (
      (filesDragInputPaths as any)['crop & rotate image']
      && (filesDragInputPaths as any)['crop & rotate image'].length
    ) {
      (async () => {
        const firstPath = (filesDragInputPaths as any)['crop & rotate image'][0];

        try {
          const bytes = await invoke<number[]>('read_file_bytes', { path: firstPath });
          const uint8 = new Uint8Array(bytes);

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
          handleImageLoad(file);
        } catch (err) {
          notify(`${t('Error reading dropped file')}: ${err}`, 'error');
        }
      })();
    }
  }, [filesDragInputPaths]);

  const handleImageLoad = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageData(result);
      
      // Reset rotation state when loading new image
      setHasRotated(false);
      setRotatedImageBlob(null);
      setRotation(0);
      
      // Load image to get dimensions
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
        // Initialize crop area to center of image
        const centerX = img.naturalWidth / 2;
        const centerY = img.naturalHeight / 2;
        const cropWidth = Math.min(200, img.naturalWidth * 0.3);
        const cropHeight = Math.min(200, img.naturalHeight * 0.3);
        setCropArea({
          x: centerX - cropWidth / 2,
          y: centerY - cropHeight / 2,
          width: cropWidth,
          height: cropHeight
        });
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (store.getState().app.plan === 'free') {
      if (store.getState().app.premiumTokensUsed + 1
        > store.getState().app.maxFreePremiumTokens
      ) {
          notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${store.getState().app.maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
        return;
      }
    }

    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setInputPath(file.name);
    handleImageLoad(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Crop area interaction handlers
  const handleMouseDown = (e: React.MouseEvent, action: 'move' | 'resize', handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (action === 'move') {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (action === 'resize' && handle) {
      setIsResizing(true);
      setResizeHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!imageContainerRef.current || !imageRef.current) return;

    const imageRect = imageRef.current.getBoundingClientRect();
    
    // Calculate scale factors
    const scaleX = imageDimensions.width / imageRect.width;
    const scaleY = imageDimensions.height / imageRect.height;

    if (isDragging) {
      const deltaX = (e.clientX - dragStart.x) * scaleX;
      const deltaY = (e.clientY - dragStart.y) * scaleY;
      
      setCropArea(prev => ({
        ...prev,
        x: Math.max(0, Math.min(imageDimensions.width - prev.width, prev.x + deltaX)),
        y: Math.max(0, Math.min(imageDimensions.height - prev.height, prev.y + deltaY))
      }));
      
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isResizing) {
      const deltaX = (e.clientX - dragStart.x) * scaleX;
      const deltaY = (e.clientY - dragStart.y) * scaleY;
      
      setCropArea(prev => {
        let newCrop = { ...prev };
        
        switch (resizeHandle) {
          case 'se': // bottom-right
            newCrop.width = Math.max(10, Math.min(imageDimensions.width - prev.x, prev.width + deltaX));
            newCrop.height = Math.max(10, Math.min(imageDimensions.height - prev.y, prev.height + deltaY));
            break;
          case 'sw': // bottom-left
            newCrop.width = Math.max(10, Math.min(prev.x + prev.width, prev.width - deltaX));
            newCrop.height = Math.max(10, Math.min(imageDimensions.height - prev.y, prev.height + deltaY));
            newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, prev.x + deltaX));
            break;
          case 'ne': // top-right
            newCrop.width = Math.max(10, Math.min(imageDimensions.width - prev.x, prev.width + deltaX));
            newCrop.height = Math.max(10, Math.min(prev.y + prev.height, prev.height - deltaY));
            newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, prev.y + deltaY));
            break;
          case 'nw': // top-left
            newCrop.width = Math.max(10, Math.min(prev.x + prev.width, prev.width - deltaX));
            newCrop.height = Math.max(10, Math.min(prev.y + prev.height, prev.height - deltaY));
            newCrop.x = Math.max(0, Math.min(imageDimensions.width - newCrop.width, prev.x + deltaX));
            newCrop.y = Math.max(0, Math.min(imageDimensions.height - newCrop.height, prev.y + deltaY));
            break;
        }
        
        return newCrop;
      });
      
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, isResizing, dragStart, resizeHandle, imageDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle('');
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // Rotate image
  const rotateImage = async (degrees: number) => {
    if (!selectedFile) {
      notify(t('Please select an image first'), 'error');
      return;
    }

    setProcessing(true);
    setStatus(t('Rotating image...'));

    try {
      const startDate = new Date().toISOString();
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        
      if (!data || !(data instanceof ArrayBuffer)) {
        setProcessing(false);
        setStatus("");
        notify(t('Error: Could not read file data'), 'error');
        return;
      }
        
        try {
          const image = await Jimp.fromBuffer(data);
          image.rotate(degrees);
          
          // Make background transparent for rotated image
          const base64 = await image.getBase64('image/png');
          const buffer = await image.getBuffer('image/png');
          const blob = new Blob([new Uint8Array(buffer)], { type: 'image/png' });
          
          setImageData(base64);
          setRotatedImageBlob(blob);
          setRotation(degrees);
          setHasRotated(true); // Mark that user has performed rotation
          
          // Update dimensions after rotation
          setImageDimensions({ width: image.width, height: image.height });
          
          // Reset crop area to center
          const centerX = image.width / 2;
          const centerY = image.height / 2;
          const cropWidth = Math.min(200, image.width * 0.3);
          const cropHeight = Math.min(200, image.height * 0.3);
          setCropArea({
            x: centerX - cropWidth / 2,
            y: centerY - cropHeight / 2,
            width: cropWidth,
            height: cropHeight
          });
          
          notify(t('Rotated image saved successfully') + ` in ${calculateTimeDifference(startDate, new Date().toISOString()).seconds}s`, 'success');
          setProcessing(false);
          setStatus("");
        } catch (imageError) {
          setProcessing(false);
          setStatus("");
          notify(`${t('Error processing image')}: ${imageError}`, 'error');
        }
      };
      
      reader.readAsArrayBuffer(selectedFile);
    } catch (error) {
      setProcessing(false);
      setStatus("");
      notify(`${t('Error')}: ${error}`, 'error');
    }
  };

  // Handle rotation slider change (only update display value)
  const handleRotationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRotation = parseInt(e.target.value);
    setRotation(newRotation);
    // Don't process rotation here - only when mouse is released
  };

  // Handle rotation slider mouse up (process rotation only when user releases mouse)
  const handleRotationMouseUp = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const newRotation = parseInt((e.target as HTMLInputElement).value);
    rotateImage(newRotation);
  };

  // Crop image
  const cropImage = async () => {
    if (!selectedFile || !imageData) {
      notify(t('Please select an image first'), 'error');
      return;
    }

    setProcessing(true);
    setStatus('Cropping image...');

    try {
      const startDate = new Date().toISOString();
      
      // Convert base64 image data to buffer
      const base64Data = imageData.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      try {
        const image = await Jimp.fromBuffer(bytes.buffer);
        
        // Crop the image using current crop area
        image.crop({
          x: Math.round(cropArea.x),
          y: Math.round(cropArea.y),
          w: Math.round(cropArea.width),
          h: Math.round(cropArea.height)
        });
        
        const buffer = await image.getBuffer('image/jpeg');
        const blob = new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' });
        const base64 = await image.getBase64('image/jpeg');
        
        setCroppedImageBlob(blob);
        setCroppedImageData(base64);

        notify(t('Success: Image cropped! Finished in') + ` ${calculateTimeDifference(startDate, new Date().toISOString()).seconds}s`, 'success');
        setProcessing(false);
        setStatus("");
      } catch (imageError) {
        notify(`${t('Error processing image')}: ${imageError}`, 'error');
        setProcessing(false);
        setStatus("");
      }
    } catch (error) {
      notify(`${t('Error')}: ${error}`, 'error');
      setProcessing(false);
      setStatus("");
    }
  };

  // Save rotated image
  const saveRotatedImage = async () => {
    if (!rotatedImageBlob || !selectedFile || !hasRotated) {
      notify(t('No rotated image available to save'), 'error');
      return;
    }

    // Get original filename without extension
    const originalName = selectedFile?.name
      ? getFileNameAndExtension(selectedFile?.name)
      : { fileNameWithoutExt: 'image', fileExt: 'png' };
    
    const saveRes = await saveFile(
      rotatedImageBlob,
      `${originalName.fileNameWithoutExt}_rotated_${rotation}deg.png`
    );
    
    if (!saveRes.success) {
      if (saveRes.e === "Save cancelled") return;
      return notify(`${t('Error')}: ${saveRes.e}`, 'error');
    }

    await updatePremiumTokensUsed();
    notify(t('Rotated image saved successfully!'), 'success');
  };

  // Download cropped image
  const downloadCroppedImage = async () => {
    if (!croppedImageBlob) {
      notify(t('No cropped image available to download'), 'error');
      return;
    }

    try {
      const selected = await save({
        defaultPath: `cropped_image_${Math.round(cropArea.width)}x${Math.round(cropArea.height)}.jpg`,
        filters: [{
          name: 'Image',
          extensions: ['.jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'ico']
        }]
      });

      if (selected) {
        const arrayBuffer = await croppedImageBlob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        await invoke('write_file', {
          path: selected,
          contents: Array.from(buffer)
        });
        
        await updatePremiumTokensUsed();
        notify(t('Cropped image saved successfully!'), 'success');
      } else {
        // notify(t('Save cancelled'), 'info');
      }
    } catch (error) {
      notify(`${t('Error saving image')}: ${error}`, 'error');
    }
  };

  // Calculate crop area position and size in pixels relative to displayed image
  const getCropAreaStyle = () => {
    if (!imageRef.current || !imageData) return {};
    
    const imageRect = imageRef.current.getBoundingClientRect();
    const scaleX = imageRect.width / imageDimensions.width;
    const scaleY = imageRect.height / imageDimensions.height;
    
    return {
      left: cropArea.x * scaleX,
      top: cropArea.y * scaleY,
      width: cropArea.width * scaleX,
      height: cropArea.height * scaleY,
    };
  };

  return (
    <div className="px-5 mt-2 pb-40">
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
          >
            {hideCenterInLongText(inputPath)}
          </div>
          <span>{t('Drag & drop or click to select image')}</span>
          <small>{t('any image type')}</small>
        </div>
      </div>

      {imageData && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-4 flex-col">
              <label className="font-bold">
                {t('Original size')}:
                <span className="font-medium ml-2">{imageDimensions.width} x {imageDimensions.height}</span>
              </label>
              <label className="font-bold">
                {t('Crop area')}:
                <span className="font-medium ml-2">{Math.round(cropArea.width)} x {Math.round(cropArea.height)} px</span>
              </label>
            </div>
            
            <div className="flex flex-col space-x-4 flex-2">
              <div className='flex items-center'>
                <label className="font-bold mr-2">
                  {t('Rotation')}:
                </label>
                <input
                  type="number"
                  min="-180"
                  max="180"
                  placeholder={t("degree")}
                  value={rotation}
                  disabled={processing}
                  onChange={(e) => {
                    handleRotationChange(e);

                    if (rotationTextInputTimeout) {
                      clearTimeout(rotationTextInputTimeout);
                    }

                    rotationTextInputTimeout = setTimeout(() => {
                      if (!e.target.value) return;
                      let newRotation = parseInt(e.target.value);

                      if (newRotation > 180) {
                        newRotation = 180;
                      } else if (newRotation < -180) {
                        newRotation = -180;
                      }

                      rotateImage(newRotation);
                    }, 750);
                  }}
                  style={{ width: 70, marginRight: 8 }}
                />
                <label>°</label>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                value={rotation}
                onChange={handleRotationChange}
                onMouseUp={handleRotationMouseUp}
                onTouchEnd={handleRotationMouseUp}
                disabled={processing}
                style={{
                  width: '400px',
                  height: '6px',
                  background: '#ddd',
                  outline: 'none',
                  borderRadius: '3px',
                  cursor: processing ? 'not-allowed' : 'pointer'
                }}
              />
            </div>
          </div>

          <div className="relative inline-block" ref={imageContainerRef}>
            <img
              ref={imageRef}
              src={imageData}
              alt="Image to crop"
              style={{
                maxWidth: '100%',
                maxHeight: '500px',
                display: 'block'
              }}
            />
            
            {/* Crop area overlay */}
            <div
              className="absolute border-2 border-blue-500 bg-blue-500 opacity-20 cursor-move"
              style={getCropAreaStyle()}
              onMouseDown={(e) => handleMouseDown(e, 'move')}
            >
              {/* Resize handles */}
              <div
                className="absolute w-3 h-3 bg-blue-500 border border-white cursor-se-resize"
                style={{ bottom: -6, right: -6 }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'se')}
              />
              <div
                className="absolute w-3 h-3 bg-blue-500 border border-white cursor-sw-resize"
                style={{ bottom: -6, left: -6 }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'sw')}
              />
              <div
                className="absolute w-3 h-3 bg-blue-500 border border-white cursor-ne-resize"
                style={{ top: -6, right: -6 }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'ne')}
              />
              <div
                className="absolute w-3 h-3 bg-blue-500 border border-white cursor-nw-resize"
                style={{ top: -6, left: -6 }}
                onMouseDown={(e) => handleMouseDown(e, 'resize', 'nw')}
              />
            </div>
          </div>

          <div className="mt-4 flex space-x-4">
            <button
              onClick={cropImage}
              disabled={!selectedFile || processing}
              className="compress-btn"
            >
              {processing ? t('Processing') + '...' : t('Crop') + ' ' + t('image')}
            </button>
            <button
              onClick={saveRotatedImage}
              disabled={!rotatedImageBlob || !hasRotated || processing}
              className="compress-btn"
              style={{ 
                backgroundColor: hasRotated ? '#17a2b8' : '#6c757d',
                borderColor: hasRotated ? '#17a2b8' : '#6c757d',
                cursor: hasRotated ? 'pointer' : 'not-allowed'
              }}
            >
              {processing ? t('Processing') + '...' : t('Save') + ' ' + t('rotated image')}
            </button>
          </div>
        </div>
      )}

      {croppedImageData && (
        <div className="mt-6">
          <h3 className="mb-2">{t('Cropped image preview')}:</h3>
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
              src={croppedImageData} 
              alt="Cropped preview" 
              style={{ 
                maxWidth: '100%',
                maxHeight: '400px',
                display: 'block',
                margin: '0 auto'
              }} 
            />
          </div>
          <button 
            onClick={downloadCroppedImage}
            className="compress-btn"
            style={{ 
              backgroundColor: '#28a745',
              borderColor: '#28a745'
            }}
          >
            {t('Save') + ' ' + t('cropped image')}
          </button>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}

export default CropAndRotateImage;
