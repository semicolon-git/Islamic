"use client";
import { useState } from "react";
import { InstallBanner } from "./install-banner";
import { IosInstallSheet } from "./ios-install-sheet";
import { OfflinePill, UpdateToast } from "./status-pills";
import { useInstallPrompt } from "./use-install-prompt";
import { useServiceWorker } from "./use-service-worker";

/** Everything PWA on the client: SW registration + update flow, install offer, offline indicator. */
export function PwaClient() {
  const sw = useServiceWorker();
  const install = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  return (
    <>
      <OfflinePill />
      {sw.updateReady ? (
        <UpdateToast onRefresh={sw.applyUpdate} onLater={sw.dismissUpdate} />
      ) : (
        install.offer &&
        !hidden &&
        !iosOpen && (
          <InstallBanner
            ios={install.ios}
            onDismiss={install.dismiss}
            onInstall={async () => {
              const r = await install.install();
              if (r === "ios") setIosOpen(true);
              else if (r === "accepted") setHidden(true);
            }}
          />
        )
      )}
      <IosInstallSheet
        open={iosOpen}
        onClose={() => {
          setIosOpen(false);
          install.dismiss();
        }}
      />
    </>
  );
}
