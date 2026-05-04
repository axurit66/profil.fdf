/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__/auth/:path*",
          destination:
            "https://feuxdeforet-20250.firebaseapp.com/__/auth/:path*",
        },
        {
          source: "/__/firebase/init.json",
          destination: "/api/firebase/init",
        },
      ],
    };
  },
};

export default nextConfig;
