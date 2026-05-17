import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useServers } from "../context/ServerContext";

/** Refetch all data when the active telemt server changes. */
export function ServerQuerySync() {
  const { activeServer } = useServers();
  const queryClient = useQueryClient();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (prevId.current === null) {
      prevId.current = activeServer.id;
      return;
    }
    if (prevId.current !== activeServer.id) {
      prevId.current = activeServer.id;
      void queryClient.invalidateQueries();
    }
  }, [activeServer.id, queryClient]);

  return null;
}
