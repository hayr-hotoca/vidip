import { SYSTEM_BASED } from '@/common/utils/constants';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

const initialState = {
	currentLanguage: "en",
	currentDisplayTheme: SYSTEM_BASED,
};

const settingsSlice = createSlice({
	name: 'setting',
	initialState,
	reducers: {
		setCurrentLanguage: (state, action: PayloadAction<string>) => {
			state.currentLanguage = action.payload;
		},
		setCurrentDisplayTheme: (state, action: PayloadAction<string>) => {
			state.currentDisplayTheme = action.payload;
		},
	},
});

export const {
	setCurrentLanguage,
	setCurrentDisplayTheme,
} = settingsSlice.actions;
export default settingsSlice.reducer;