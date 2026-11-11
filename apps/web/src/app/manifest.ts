import type { MetadataRoute } from "next";

/**
 * Web app manifest (installable shortcut only). There is deliberately NO
 * service worker caching: private reports and authenticated responses are
 * never stored in a shared cache. This is not a native app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AutoCare IQ — أوتوكير",
    short_name: "AutoCare",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f2eee5",
    theme_color: "#b8390a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
