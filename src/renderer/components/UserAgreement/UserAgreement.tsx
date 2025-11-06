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
              Effective Date: November 2025 - Please read and accept the terms to continue
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="space-y-4 text-sm">
            <p className="text-foreground font-medium">
              Welcome to this open-source browser application. Before you continue, please read and
              understand the following terms. By using this software, you acknowledge and accept all
              risks associated with its use.
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

              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  📖 Open Source Software
                </h3>
                <p className="text-muted-foreground mb-2">
                  This is an open-source browser project. Anyone can view, fork, modify, and create
                  their own versions of this software. While this promotes transparency and
                  community contributions, it also means:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>
                    Modified or forked versions may contain different code, additional features, or
                    security vulnerabilities
                  </li>
                  <li>
                    We cannot verify or vouch for the safety of unofficial or modified versions
                  </li>
                  <li>
                    <span className="font-semibold">
                      We strongly recommend using only official releases from trusted sources
                    </span>
                  </li>
                  <li>
                    Third-party distributions may have been altered in ways that compromise your
                    security or privacy
                  </li>
                </ul>
                <p className="text-muted-foreground mt-2">
                  If you obtained this browser from an unofficial source, proceed with extreme
                  caution and verify the code before use.
                </p>
              </div>

              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                  ⚠️ Limitation of Liability - Use at Your Own Risk
                </h3>
                <p className="text-muted-foreground mb-2">
                  <span className="font-semibold">
                    This software is provided "AS IS" without warranty of any kind.
                  </span>{' '}
                  We are not responsible for any misuse, damage, or harm that may result from using
                  this browser. This includes but is not limited to:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Damage from visiting dangerous, suspicious, or malicious websites</li>
                  <li>Malware infections, viruses, or other security compromises</li>
                  <li>Data loss, corruption, or theft</li>
                  <li>Privacy breaches or unauthorized access to your information</li>
                  <li>Financial losses or identity theft</li>
                  <li>System instability or hardware damage</li>
                  <li>Legal consequences from your browsing activities</li>
                  <li>Any other direct, indirect, incidental, or consequential damages</li>
                </ul>
                <p className="text-muted-foreground mt-2 font-semibold">
                  YOU USE THIS BROWSER ENTIRELY AT YOUR OWN RISK. By accepting these terms, you
                  acknowledge that you understand and accept these risks.
                </p>
              </div>

              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                  🚨 Critical Security Warning
                </h3>
                <p className="text-muted-foreground mb-2">
                  This browser is experimental software. Navigating to dangerous, suspicious, or
                  malicious websites can compromise your system security, steal your personal
                  information, or cause permanent damage to your system.
                </p>
                <p className="text-muted-foreground mb-2">
                  <span className="font-semibold">We provide NO warranties or guarantees</span>{' '}
                  regarding the security of this browser or its ability to protect you from online
                  threats. The browser may have undiscovered vulnerabilities or security flaws.
                </p>
                <p className="text-muted-foreground">
                  Exercise extreme caution and good judgment when browsing the internet. Never enter
                  sensitive information (passwords, credit cards, personal data) on untrusted
                  websites. The developers assume no responsibility for any security incidents.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-foreground font-bold text-base mb-3">
                BY CLICKING "ACCEPT AND CONTINUE", YOU ACKNOWLEDGE AND AGREE:
              </p>
              <ul className="list-disc list-inside space-y-2 text-foreground ml-2">
                <li>You have read, understood, and agree to all terms stated above</li>
                <li>
                  You understand this is experimental open-source software provided "AS IS" without
                  warranties
                </li>
                <li>
                  You accept FULL RESPONSIBILITY for your use of this browser and any consequences
                </li>
                <li>You use this software ENTIRELY AT YOUR OWN RISK</li>
                <li>
                  The developers are NOT LIABLE for any damages, losses, or harm resulting from your
                  use
                </li>
              </ul>
              <p className="text-muted-foreground mt-3 text-xs italic">
                If you do not agree to these terms, click "Decline and Exit" to close the
                application.
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
