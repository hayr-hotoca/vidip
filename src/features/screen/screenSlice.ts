import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type Screen = "compress videos" | "merge videos" | "split videos" | "trim video";
export type ImageScreen = "resize image" | "crop & rotate image";

const initialState = {
  currentScreen: "compress videos",
  currentImageScreen: "resize image",
};

const screenSlice = createSlice({
  name: 'screen',
  initialState,
  reducers: {
    setCurrentScreen: (state, action: PayloadAction<Screen>) => {
      state.currentScreen = action.payload;
    },
    setCurrentImageScreen: (state, action: PayloadAction<ImageScreen>) => {
      state.currentImageScreen = action.payload;
    },
  },
});

export const { 
  setCurrentScreen,
  setCurrentImageScreen
} = screenSlice.actions;
export default screenSlice.reducer;
