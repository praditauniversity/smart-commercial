import type { NextConfig } from "next";

// Origins allowed to load the dev server (comma-separated hosts/IPs in ALLOWED_DEV_ORIGINS). Unset = none.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
