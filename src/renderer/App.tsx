import React, { useEffect, useState } from 'react';
import { BrowserLayout } from './components/Browser/BrowserLayout';
import { DownloadManager } from './components/Downloads/DownloadManager';

function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Route to download manager if hash is #downloads
  if (route === '#downloads' || route === '#/downloads') {
    return <DownloadManager />;
  }

  return <BrowserLayout />;
}

export default App;
