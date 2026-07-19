import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { gameContentPublishBoundaryPlugin } from "./scripts/game-content-publish-boundary.mjs";

export default defineConfig({
  plugins: [react(), gameContentPublishBoundaryPlugin()],
});
