import { store } from "@/app/store";
import { setFilesDragInputPaths } from "@/features/app/appSlice";
import { VIDEO_MEDIA } from "@/common/utils/constants";

function saveSelectedFilesState(filePaths: string[]) {
	const newObject = {
			...store.getState().app.filesDragInputPaths,
			[store.getState().app.selectedMedia === VIDEO_MEDIA
				? store.getState().screen.currentScreen
				: store.getState().screen.currentImageScreen
			]: filePaths,
		}
		store.dispatch(setFilesDragInputPaths(newObject));
}

export {
	saveSelectedFilesState,
};
