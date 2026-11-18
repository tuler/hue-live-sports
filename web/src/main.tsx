import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./brand.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { cssVariablesResolver, theme } from "./theme.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      <Notifications position="top-center" />
      <App />
    </MantineProvider>
  </StrictMode>,
);
