import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Id, toast } from 'react-toastify';
import { load } from '@tauri-apps/plugin-store';
import { PREMIUM_TOKENS_USED_STORE } from "../../common/utils/constants";
import { store } from "@/app/store";
import { setPremiumTokensUsed } from "@/features/app/appSlice";

// Create a new store or load the existing one,
// note that the options will be ignored if a `Store` with that path has already been created
const keyValueStore = await load('store.json', { autoSave: false, defaults: {} });

// Setup the server when your app starts
async function setupServer() {
  try {
    await invoke('setup_custom_server');
    console.log('Custom server started on port 34012');
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

function calculateTimeDifference(startDate: string, endDate: string) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    
    // Calculate difference in milliseconds
    const difference = end - start; // in milliseconds
    
    // Convert to hours, minutes, and seconds
    const totalSeconds = Math.floor(difference / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
        hours: hours,
        minutes: minutes,
        seconds: seconds
    };
}

function getFileNameAndExtension(fileName: string) {
	const compressedFileNameArr = fileName.split('.');
	// remove video file extension
	const fileExt = compressedFileNameArr.pop();
	const fileNameWithoutExt = compressedFileNameArr.join('');

	return { fileExt, fileNameWithoutExt };
}

function hideCenterInLongText(text: string) {
	if (!text) return "";
	return text.length > 50 ? (text.substring(0, 18) + "..." + text.substring(text.length-24)) : text;
}

function openLink(url: string) {
    open(url);
}

function getDevicePlatform() {
    if (navigator.platform.startsWith("Mac")) {
        return "MacOS";
    } else {
        return navigator.platform;
    }
}

async function getImageSize(image: any) {
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    return { width, height };
}

async function saveFile(
    resizedImageBlob: Blob | null,
    filename: string,
) {
    if (!resizedImageBlob) {
      return {
        success: false,
        e: "No data available to download",
      };
    }

    const { fileNameWithoutExt, fileExt } = getFileNameAndExtension(filename);

    try {
      // Open save dialog for user to choose save location
      const selected = await save({
        defaultPath: fileNameWithoutExt,
        filters: [{
          name: 'Image',
          extensions: [fileExt || 'jpg']
        }]
      });

      if (selected) {
        // Convert blob to buffer and write to selected path
        const arrayBuffer = await resizedImageBlob.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        
        // Use Tauri's write file API
        await invoke('write_file', {
          path: selected,
          contents: Array.from(buffer)
        });
        
        return {
            success: true,
        }
      } else {
        return {
          success: false,
          e: "Save cancelled",
        };
      }
    } catch (error) {
			return {
				success: false,
				e: `Error saving image: ${error}`,
			};
    }
}

const notify = (
	message: string,
	type: 'info' | 'success' | 'warning' | 'error',
	obj?: {
		autoClose?: number,
		hideProgressBar?: boolean,
		closeOnClick?: true,
		pauseOnHover?: true,
	}
) => {
  const id = toast(message, {
    // @ts-ignore
    type, // Can be: 'info', 'success', 'warning', 'error'
    position: "top-right",
    autoClose: obj?.autoClose || 4000,
    hideProgressBar: obj?.hideProgressBar || false,
    closeOnClick: obj?.closeOnClick || true,
    pauseOnHover: obj?.pauseOnHover || true,
    draggable: true,
    theme: "colored",
  });

  return id;
};

const updateToast = (toastId: Id) => toast.update(toastId, { type: "info", autoClose: 1000 });

async function setKeyValue(key: string, value: any) {
	await keyValueStore.set(key, { value });
  await keyValueStore.save();
  if (key === PREMIUM_TOKENS_USED_STORE) {
    store.dispatch(setPremiumTokensUsed(value));
  }
}

async function getKeyValue(key: string) {
	return await keyValueStore.get(key);
}

async function deleteKeyValue(key: string) {
	return await keyValueStore.delete(key);
}

async function updatePremiumTokensUsed() {
  const tokensUsed = await getKeyValue(PREMIUM_TOKENS_USED_STORE);
  // @ts-ignore
  await setKeyValue(PREMIUM_TOKENS_USED_STORE, tokensUsed?.value ? Number(tokensUsed.value) + 1 : 1);
}

function validateEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Format time to HH:MM:SS.mmm
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export {
	calculateTimeDifference,
	getFileNameAndExtension,
	hideCenterInLongText,
	openLink,
	getDevicePlatform,
	getImageSize,
	saveFile,
	notify,
	updateToast,
	setKeyValue,
	getKeyValue,
	updatePremiumTokensUsed,
	validateEmail,
	deleteKeyValue,
	setupServer,
	formatTime,
};
