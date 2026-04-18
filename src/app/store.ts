// src/app/store.js
import { configureStore } from '@reduxjs/toolkit';
import screenReducer from '../features/screen/screenSlice';
import settingsReducer from '../features/settings/settingsSlice';
import appReducer from '../features/app/appSlice';

export const store = configureStore({
  reducer: {
    // Add your reducers here
    screen: screenReducer,
    settings: settingsReducer,
    app: appReducer,
  },
});


export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;