"use client";

// Registers the phone-warning service worker (public/sw.js). It is mounted only
// inside the signed-in app layout, so signed-out visitors never get one. It does
// not ask for any permission: that only happens when the trader presses
// "Enable alerts" in Settings. Renders nothing.

import * as React from "react";

export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* no worker, no phone warnings: nothing else depends on it */
    });
  }, []);
  return null;
}
