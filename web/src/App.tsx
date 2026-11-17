import { Alert, Center, Container, Loader } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type Me } from "./api.ts";
import { Footer } from "./components/Footer.tsx";
import { Header } from "./components/Header.tsx";
import { SettingsScreen } from "./components/SettingsScreen.tsx";
import { SignedOut } from "./components/SignedOut.tsx";
import { errorMessage, type Load } from "./load.ts";

export function App() {
  const [me, setMe] = useState<Load<Me | null>>({ state: "loading" });

  useEffect(() => {
    api
      .me()
      .then((value) => setMe({ state: "ready", value }))
      .catch((err) =>
        setMe(err instanceof ApiError && err.status === 401 ? { state: "ready", value: null } : { state: "error", message: errorMessage(err) }),
      );
  }, []);

  const signInError = useMemo(() => new URLSearchParams(location.search).get("error"), []);
  useEffect(() => {
    if (signInError) history.replaceState(null, "", "/");
  }, [signInError]);

  return (
    <Container size={640} py="xl" px="md">
      <Header me={me.state === "ready" ? me.value : null} />
      {signInError && (
        <Alert color="red" mb="md" title="Sign-in did not finish">
          {signInError}
        </Alert>
      )}
      {me.state === "loading" && (
        <Center py={80}>
          <Loader />
        </Center>
      )}
      {me.state === "error" && <Alert color="red">{me.message}</Alert>}
      {me.state === "ready" && (me.value ? <SettingsScreen me={me.value} /> : <SignedOut />)}
      <Footer />
    </Container>
  );
}
