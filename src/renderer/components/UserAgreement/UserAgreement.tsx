import React from 'react';

interface UserAgreementProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const UserAgreement: React.FC<UserAgreementProps> = ({ isOpen, onAccept, onDecline }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div
        className="bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-2xl font-semibold">User Agreement</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please read and accept the terms to continue using this browser
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4 text-sm">
            <p className="text-foreground">
              Welcome to this browser application. Before you continue, please read and understand
              the following terms:
            </p>

            <div className="space-y-3">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-2">Local Data Storage</h3>
                <p className="text-muted-foreground">
                  All data in this browser is stored locally on your device. We do not collect,
                  transmit, or share any of your data. Your browsing history, bookmarks, and
                  settings remain entirely on your machine.
                </p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-2">Model Downloads & Usage</h3>
                <p className="text-muted-foreground">
                  Downloading and using AI models is entirely at your own responsibility. While we
                  suggest models for convenience, we do not guarantee their performance, accuracy,
                  or suitability for any particular purpose. You are responsible for evaluating and
                  selecting appropriate models for your needs.
                </p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-2">Model Behavior & Content</h3>
                <p className="text-muted-foreground">
                  We are not responsible for the behavior or output of AI models. Models may produce
                  inaccurate, inappropriate, or offensive content. The models may have access to
                  your browser history, bookmarks, and other local data to provide contextual
                  assistance. Use caution when interacting with AI-generated content.
                </p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-semibold text-foreground mb-2">No Data Collection</h3>
                <p className="text-muted-foreground">
                  We do not control who uses this browser and we do not collect any usage data,
                  analytics, or telemetry. Your privacy is paramount, and all operations are
                  performed locally.
                </p>
              </div>

              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                  ⚠️ Limitation of Liability
                </h3>
                <p className="text-muted-foreground">
                  We are not responsible for any misuse, damage, or harm that may result from using
                  this browser. This includes but is not limited to: damage from visiting dangerous
                  or suspicious websites, malware infections, data loss, privacy breaches, or any
                  other consequences of your browsing activities. Use this browser at your own risk.
                </p>
              </div>

              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🚨 Security Warning
                </h3>
                <p className="text-muted-foreground">
                  Navigating to dangerous, suspicious, or malicious websites can compromise your
                  system security. Exercise caution and good judgment when browsing the internet. We
                  provide no warranties or guarantees regarding the security of this browser or its
                  ability to protect you from online threats.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-foreground font-medium">
                By clicking "Accept and Continue", you acknowledge that you have read, understood,
                and agree to these terms. You accept full responsibility for your use of this
                browser and any consequences that may result.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-6 flex justify-end items-center gap-3">
          <button
            onClick={onDecline}
            className="px-6 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
          >
            Decline and Exit
          </button>
          <button
            onClick={onAccept}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Accept and Continue
          </button>
        </div>
      </div>
    </div>
  );
};
