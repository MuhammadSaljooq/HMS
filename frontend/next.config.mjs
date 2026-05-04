/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target =
      process.env.API_PROXY_TARGET?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
      "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;
