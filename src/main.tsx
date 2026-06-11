import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { VersionToast } from './VersionToast';
import { ConfirmHost } from './confirm';
import { ToastHost } from './toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <VersionToast />
      <ConfirmHost />
      <ToastHost />
    </ErrorBoundary>
  </StrictMode>,
);
