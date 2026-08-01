/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `node:sqlite` is a Node built-in, not an npm package. Listing it here keeps
  // the bundler from trying to trace and rewrite it into the server chunks.
  serverExternalPackages: ["node:sqlite"],

  // The database is opened once per server process and held open. Turbopack's
  // default file watching would otherwise reload the module and leak handles.
  experimental: {
    serverComponentsHmrCache: true,
  },
};

export default nextConfig;
