import { VIDEO_MEDIA } from '@/common/utils/constants';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

const initialState = {
	contact: {
		supportEmail: "linhsapm@gmail.com",
		website: 'https://vidip.app',
		x: 'https://x.com/vidipapp',
		instagram: 'https://instagram.com/vidipapp'
	},
	selectedMedia: VIDEO_MEDIA,
	filesDragInputPaths: {},
	premiumTokensUsed: 0,
	maxFreePremiumTokens: 10,
	plan: 'free',
	licenseKeyObject: {},
};

const settingsSlice = createSlice({
	name: 'app',
	initialState,
	reducers: {
		setSelectedMedia: (state, action: PayloadAction<string>) => {
			state.selectedMedia = action.payload;
		},
		setFilesDragInputPaths: (state, action: PayloadAction<any>) => {
			state.filesDragInputPaths = action.payload;
		},
		setPremiumTokensUsed: (state, action: PayloadAction<number>) => {
			state.premiumTokensUsed = action.payload;
		},
		setPlan: (state, action: PayloadAction<string>) => {
			state.plan = action.payload;
		},
		setLicenseKeyObject: (state, action: PayloadAction<any>) => {
			state.licenseKeyObject = action.payload;
		},
	},
});

export const {
	setSelectedMedia,
	setFilesDragInputPaths,
	setPremiumTokensUsed,
	setPlan,
	setLicenseKeyObject,
} = settingsSlice.actions;
export default settingsSlice.reducer;