import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals.map(config => Object.keys(config).every(key => key === "ignores")
    ? config
    : { ...config, ignores: [...(config.ignores || []), "game-server/**"] }),
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".open-next/**",
    ".wrangler/**",
    "game-server/node_modules/**",
    "game-server/dist/**",
  ]),
]);

export default eslintConfig;
