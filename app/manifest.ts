import type { MetadataRoute } from "next";

// Web app manifest. Next 16 serves this at `/manifest.webmanifest` and
// emits the corresponding `<link rel="manifest">` automatically — no
// extra wiring needed in the layout.
//
// `start_url` is the page launched when the PWA opens from the home
// screen. The proxy redirects unauthenticated requests to `/unlock`,
// so authed users land in the gallery and unauthed users get the gate.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bits Image",
    short_name: "Bits",
    description: "Keep collecting, stay inspired.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
