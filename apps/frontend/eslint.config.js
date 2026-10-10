import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const serverOnly = {
  name: "server-only",
  message:
    "Este proyecto es una SPA de React sin código de servidor propio. El paquete `server-only` es de Next.js y no aplica aquí; la lógica de servidor vivirá en el backend Django/DRF de apps/backend.",
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", { paths: [serverOnly] }],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // La interfaz obtiene los datos solo mediante src/features/<dominio>/api.ts,
    // el único lugar que cambia al conectar Django (ver src/features/README.md).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/*/api.ts", "src/mocks/**", "src/components/layout/site-layout.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [serverOnly],
          patterns: [
            {
              group: ["@/mocks", "@/mocks/*", "**/mocks", "**/mocks/*"],
              message:
                "Importa desde src/features/<dominio>/api.ts; el servidor simulado no se usa directamente desde la interfaz.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
