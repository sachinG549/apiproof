import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/gallery": ["./src/data/gallery/**/*"],
    "/new": ["./src/data/gallery/**/*"],
    "/api/examples/petstore": ["./src/data/gallery/**/*"],
    "/r/**/*": ["./src/data/gallery/**/*"],
  },
};

export default nextConfig;
