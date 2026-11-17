import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const theme = createTheme({
  primaryColor: "orange",
  defaultRadius: "md",
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: "700" },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="top-center" />
      <App />
    </MantineProvider>
  </StrictMode>,
);
