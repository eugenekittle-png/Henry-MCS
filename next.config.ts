import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
  serverExternalPackages: ["pdf-parse", "mammoth", "word-extractor", "pdfkit", "sharp", "otplib", "qrcode"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
