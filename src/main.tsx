import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from 'react-redux';
import { Toaster } from "sonner";

import App from "./app/App";
import './i18n';
import { store } from './app/store'; // Import your store

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Provider store={store}>
    <React.StrictMode>
      <App />
      <Toaster />
    </React.StrictMode>
  </Provider>,
);
