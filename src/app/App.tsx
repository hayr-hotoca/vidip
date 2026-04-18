// App.tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useSelector, useDispatch } from 'react-redux';
import { Settings as SettingsIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  // @ts-ignore
} from "@/common/components/ui/dialog"

import { RootState, AppDispatch, store } from './store';
import "./App.css";
import CompressVideos from "@/components/Video/CompressVideos";
import MergeVideos from "@/components/Video/MergeVideos";
import SplitVideo from "@/components/Video/SplitVideo";
import { Screen, setCurrentScreen, ImageScreen, setCurrentImageScreen } from "@/features/screen/screenSlice";
import Settings from "@/components/Settings/Settings";
import { DISPLAY_THEME_LOCALSTORAGE, LANGUAGE_LOCALSTORAGE, DARK_MODE, LIGHT_MODE, IMAGE_MEDIA, VIDEO_MEDIA, MAX_FILES } from "@/common/utils/constants";
import { setCurrentDisplayTheme, setCurrentLanguage } from "@/features/settings/settingsSlice";
import { SelectScrollable } from "@/components/Settings/SelectScrollable";
import { setSelectedMedia } from "@/features/app/appSlice";
import ResizeImage from "@/components/Image/ResizeImage";
import CropAndRotateImage from "@/components/Image/CropAndRotateImage";
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from "react-toastify";
import TrimVideo from "../components/Video/TrimVideo";
import { listen } from "@tauri-apps/api/event";
import { notify, setupServer } from "@/features/app/app";
import { saveSelectedFilesState } from "@/features/file/file";
import { checkLicenseKey, checkPremiumTokens } from "@/features/license/license";

const screens = {
	"compress videos": <CompressVideos />,
	"split videos": <SplitVideo />,
	"trim video": <TrimVideo />,
	"merge videos": <MergeVideos />,
};

const imageScreens = {
	"resize image": <ResizeImage />,
	"crop & rotate image": <CropAndRotateImage />,
};

const variants = {
	enter: (direction: "left" | "right") => ({
		x: direction === "right" ? 300 : -300,
		opacity: 0
	}),
	center: {
		x: 0,
		opacity: 1,
		transition: {
			x: { type: "spring", stiffness: 300, damping: 30 },
			opacity: { duration: 0.2 }
		}
	},
	exit: (direction: "left" | "right") => ({
		x: direction === "right" ? -300 : 300,
		opacity: 0,
		transition: {
			x: { type: "spring", stiffness: 300, damping: 30 },
			opacity: { duration: 0.2 }
		}
	})
};

function App() {
  const { t, i18n } = useTranslation();
  const {
    currentScreen,
    currentImageScreen,
  } = useSelector((state: RootState) => state.screen);
  const {
    selectedMedia,
    premiumTokensUsed,
    maxFreePremiumTokens,
    plan,
  } = useSelector((state: RootState) => state.app);
  const currentDisplayTheme = useSelector((state: RootState) => state.settings.currentDisplayTheme);
  const dispatch = useDispatch<AppDispatch>();
  const [direction, setDirection] = useState<"left" | "right">("right");

  useEffect(() => {
    (async () => {
      await setupServer();
      await checkLicenseKey();
      await checkPremiumTokens();
    })();

    const storedLanguage = localStorage.getItem(LANGUAGE_LOCALSTORAGE);
    if (storedLanguage) {
      i18n.changeLanguage(storedLanguage);
      dispatch(setCurrentLanguage(storedLanguage));
    }

    const storedDisplayTheme = localStorage.getItem(DISPLAY_THEME_LOCALSTORAGE);
    if (storedDisplayTheme) {
      dispatch(setCurrentDisplayTheme(storedDisplayTheme));
    }

    const dragUnlisten = listen('tauri://drag-drop', async (event) => {
      const filePaths = event.payload as { paths: string[] };
      if (filePaths && filePaths?.paths?.length) {
        const limited = filePaths.paths.slice(0, MAX_FILES);

        if (store.getState().app.plan === 'free') {
          if (store.getState().app.premiumTokensUsed
            + ((store.getState().screen.currentScreen === 'merge videos'
                || store.getState().app.selectedMedia === IMAGE_MEDIA
              )
              ? 1
              : limited.length)
            > maxFreePremiumTokens
          ) {
            notify(`${t('You have used')} ${store.getState().app.premiumTokensUsed} ${t('free premium daily usage limit. Only')} ${maxFreePremiumTokens - store.getState().app.premiumTokensUsed} ${t('more videos can be processed')}.`, "error");
            return;
          }
        }

        if (filePaths.paths.length > MAX_FILES
          && store.getState().screen.currentScreen !== 'merge videos'
        ) {
          notify(t('You can select up to 5 videos'), "error");
        }

        if (store.getState().app.selectedMedia === VIDEO_MEDIA
          && store.getState().screen.currentScreen === 'merge videos'
        ) {
          saveSelectedFilesState(filePaths.paths);
        } else {
          saveSelectedFilesState(limited);
        }
      }
    });
    return () => {
      dragUnlisten.then((fn) => fn());
    };
  }, []);

  // Apply theme based on user selection or system preference
  useEffect(() => {
    const rootElement = document.documentElement;

    function applyThemeByPreference(preferDark: boolean) {
      if (preferDark) {
        rootElement.classList.add("dark");
      } else {
        rootElement.classList.remove("dark");
      }
    }

    if (currentDisplayTheme === DARK_MODE) {
      applyThemeByPreference(true);
      return; // no listener needed
    }

    if (currentDisplayTheme === LIGHT_MODE) {
      applyThemeByPreference(false);
      return; // no listener needed
    }

    // System based
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    applyThemeByPreference(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      applyThemeByPreference(e.matches);
    };

    // Modern browsers support addEventListener on MediaQueryList
    try {
      mediaQuery.addEventListener("change", handleChange);
    } catch (_) {
      // Fallback for older implementations
      // @ts-ignore
      mediaQuery.addListener && mediaQuery.addListener(handleChange);
    }

    return () => {
      try {
        mediaQuery.removeEventListener("change", handleChange);
      } catch (_) {
        // @ts-ignore
        mediaQuery.removeListener && mediaQuery.removeListener(handleChange);
      }
    };
  }, [currentDisplayTheme]);

  return (
    <div className="app-container">
      <ToastContainer />
      <div className="header-selector shadcn-button">
        {plan === 'free' && <div className="mr-3 text-sm font-medium">
          Daily usage limit: {premiumTokensUsed}/{maxFreePremiumTokens}
        </div>}
        <SelectScrollable
          width={80}
          placeholder="option"
          defaultValue={selectedMedia}
          items={[
            {name: t(VIDEO_MEDIA), value: VIDEO_MEDIA},
            {name: t(IMAGE_MEDIA), value: IMAGE_MEDIA},
          ]}
          onValueChange={(text: string) => {
            dispatch(setSelectedMedia(text));
          }}
        />
        <Dialog>
          <DialogTrigger asChild style={{ width: 24, height: 24, marginLeft: 8 }}>
          	<SettingsIcon className="h-4 w-4 mr-3 cursor-pointer" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex">
                <SettingsIcon className="h-4 w-4 mr-2" />
                {t('Settings')}
              </DialogTitle>
              <DialogDescription>
              </DialogDescription>
            </DialogHeader>
            <Settings />
          </DialogContent>
        </Dialog>
      </div>

      <div className="screen-container">
        {renderAppContent()}
      </div>

      {renderNavButtons()}
    </div>
  );

  function renderAppContent() {
    return <AnimatePresence custom={direction} initial={false}>
      <motion.div
        key={currentImageScreen}
        custom={direction}
        // @ts-ignore
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        className="screen-content"
        style={{ display: selectedMedia === IMAGE_MEDIA ? 'block': 'none' }}
      >
        {/* @ts-ignore */}
        {imageScreens[currentImageScreen]}
      </motion.div>
      <motion.div
        key={currentScreen}
        custom={direction}
        // @ts-ignore
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        className="screen-content"
        style={{ display: selectedMedia === VIDEO_MEDIA ? 'block': 'none' }}
      >
        {/* @ts-ignore */}
        {screens[currentScreen]}
      </motion.div>
    </AnimatePresence>
  }

  function renderNavButtons() {
    if (selectedMedia === VIDEO_MEDIA) {
      return <nav className="navigation-bar">
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentScreen === "compress videos" ? '' : "nav-button"}`}
          onClick={() => handleVideoScreensNavigation("compress videos")}
        >
          {t('Compress Videos')}
        </button>
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentScreen === "split videos" ? '' : "nav-button"}`}
          onClick={() => handleVideoScreensNavigation("split videos")}
        >
          {t('Split Videos')}
        </button>
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentScreen === "trim video" ? '' : "nav-button"}`}
          onClick={() => handleVideoScreensNavigation("trim video")}
        >
          {t('Trim video')}
        </button>
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentScreen === "merge videos" ? '' : "nav-button"}`}
          onClick={() => handleVideoScreensNavigation("merge videos")}
        >
          {t('Merge Videos')}
        </button>
      </nav>
    }

    if (selectedMedia === IMAGE_MEDIA) {
      return <nav className="navigation-bar" style={{ width: 550 }}>
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentImageScreen === "resize image" ? '' : "nav-button"}`}
          onClick={() => handleImageScreensNavigation("resize image")}
        >
          {t('Resize') + ' ' + t('image')}
        </button>
        <button
          style={{ marginRight: 8, marginLeft: 8 }}
          className={`${currentImageScreen === "crop & rotate image" ? '' : "nav-button"}`}
          onClick={() => handleImageScreensNavigation("crop & rotate image")}
        >
          {t('Crop') + ' & ' + t('rotate') + ' ' + t('image')}
        </button>
      </nav>
    }
  }

  function handleVideoScreensNavigation(videoScreen: Screen) {
    const screensOrder: String[] = ["compress videos", "split videos", "trim video", "merge videos"];
    const currentIndex = screensOrder.indexOf(currentScreen);
    const newIndex = screensOrder.indexOf(videoScreen);
    
    setDirection(newIndex > currentIndex ? "right" : "left");
    dispatch(setCurrentScreen(videoScreen));
  }

  function handleImageScreensNavigation(imageScreen: ImageScreen) {
    const screensOrder: String[] = ["resize image", "crop & rotate image", "grayscale image"];
    const currentIndex = screensOrder.indexOf(currentImageScreen);
    const newIndex = screensOrder.indexOf(imageScreen);
    setDirection(newIndex > currentIndex ? "right" : "left");
    dispatch(setCurrentImageScreen(imageScreen));
  };
}

export default App;