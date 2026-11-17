// Sets the saved light/dark choice before the page paints, so it doesn't flash the wrong theme.
// Mantine's ColorSchemeScript does this inline, which the Content-Security-Policy forbids.
// Keep the key and default in step with MantineProvider in src/main.tsx.
try {
  var saved = localStorage.getItem("mantine-color-scheme-value");
  var scheme = saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-mantine-color-scheme", scheme);
} catch (e) {}
