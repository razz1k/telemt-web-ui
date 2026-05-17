import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AutoRefreshProvider } from "./context/AutoRefreshContext";
import { ChangeNotifyProvider } from "./context/ChangeNotifyContext";
import { ServerProvider } from "./context/ServerContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChangeNotifyProvider>
        <AutoRefreshProvider>
          <ServerProvider>
            <App />
          </ServerProvider>
        </AutoRefreshProvider>
      </ChangeNotifyProvider>
    </QueryClientProvider>
  </StrictMode>,
);
