import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const useEmulators = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
const emulators = useEmulators ? " http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:9199 ws://127.0.0.1:8080" : "";

const firebaseConnect = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
  "https://firebasestorage.googleapis.com",
  "https://*.googleapis.com",
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.tile.openstreetmap.org${useEmulators ? " http://127.0.0.1:9199" : ""}`,
  `connect-src 'self' ${firebaseConnect} https://nominatim.openstreetmap.org${emulators}`,
  "frame-src https://*.firebaseapp.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Private areas: never indexed, never leak the secret token via Referer.
const privateHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "firebase-admin", "sharp"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "firebasestorage.googleapis.com" }],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/g/:path*", headers: privateHeaders },
      { source: "/superadmin/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
