import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClinicResourceAvailability } from "@/services/queue";
import { QueueRepository } from "@/services/queue/repositories/QueueRepository";
import { logger } from "@/services/shared/logging/Logger";

export function useClinicResources(clinicId?: string) {
  const repository = useMemo(() => new QueueRepository(), []);
  const [resources, setResources] = useState<ClinicResourceAvailability[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!clinicId) {
      setResources([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await repository.getAvailableClinicResources(clinicId);
      setResources(data);
    } catch (error) {
      logger.error("Failed to load clinic resources", error as Error, { clinicId });
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [clinicId, repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { resources, loading, refresh };
}
