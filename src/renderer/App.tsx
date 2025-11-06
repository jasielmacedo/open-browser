import React, { useEffect, useState } from 'react';
import { BrowserLayout } from './components/Browser/BrowserLayout';
import { DownloadManager } from './components/Downloads/DownloadManager';
import { UserAgreement } from './components/UserAgreement/UserAgreement';

function App() {
  const [route, setRoute] = useState(window.location.hash);
  const [agreementAccepted, setAgreementAccepted] = useState<boolean | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);

  // Check if user has accepted the agreement
  useEffect(() => {
    const checkAgreement = async () => {
      try {
        const accepted = await window.electron.invoke('agreement:check');
        setAgreementAccepted(accepted);
        setShowAgreement(!accepted);
      } catch (error) {
        console.error('Failed to check user agreement:', error);
        // On error, assume agreement not accepted for safety
        setAgreementAccepted(false);
        setShowAgreement(true);
      }
    };

    checkAgreement();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleAcceptAgreement = async () => {
    try {
      await window.electron.invoke('agreement:accept');
      setAgreementAccepted(true);
      setShowAgreement(false);
    } catch (error) {
      console.error('Failed to save agreement acceptance:', error);
    }
  };

  const handleDeclineAgreement = async () => {
    try {
      // Close the application if user declines
      await window.electron.invoke('app:quit');
    } catch (error) {
      console.error('Failed to quit application:', error);
    }
  };

  // Show loading state while checking agreement
  if (agreementAccepted === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show agreement modal if not accepted
  if (!agreementAccepted) {
    return (
      <UserAgreement
        isOpen={showAgreement}
        onAccept={handleAcceptAgreement}
        onDecline={handleDeclineAgreement}
      />
    );
  }

  // Route to download manager if hash is #downloads
  if (route === '#downloads' || route === '#/downloads') {
    return <DownloadManager />;
  }

  return <BrowserLayout />;
}

export default App;
