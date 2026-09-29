import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  agentRules: false,
  // Preview tunnels and local browsers may present as either loopback or a
  // forwarded host; keep both forms and the common Cursor preview alias.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.cursor.sh",
    "*.cursorusercontent.com",
  ],
};

export default nextConfig;
