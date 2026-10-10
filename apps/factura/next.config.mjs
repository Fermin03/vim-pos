/** @type {import('next').NextConfig} */
import { cabecerasSeguridad } from "@vim/config/cabeceras-seguridad.mjs";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@vim/ui", "@vim/config"],
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad() }];
  },
};
export default nextConfig;
