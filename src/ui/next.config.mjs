import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({
  path: path.resolve(process.cwd(), "..", ".env"),
  override: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
