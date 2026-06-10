import { useEffect, useMemo, useRef, useState } from 'react';
import ClinicMedications from '@/pages/clinic/ClinicMedications';
import {
  medicalRecordWriteService,
  type MedicationCatalogEntry,
  type MedicationCatalogSearchInput,
  type MedicationCatalogUpdateInput,
} from '@/services/medical-records';

const E2E_USER_ID = 'doctor-e2e-medications';
const E2E_CLINIC_ID = 'clinic-e2e-medications';

interface HarnessStore {
  entries: MedicationCatalogEntry[];
}

function normalizeMedicationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeAliases(aliases: string[], canonicalName: string): string[] {
  const canonicalKey = canonicalName.toLocaleLowerCase();
  const deduped = new Map<string, string>();

  for (const alias of aliases) {
    const normalizedAlias = normalizeMedicationName(alias);
    if (!normalizedAlias) continue;

    const key = normalizedAlias.toLocaleLowerCase();
    if (key === canonicalKey) continue;

    if (!deduped.has(key)) {
      deduped.set(key, normalizedAlias);
    }
  }

  return Array.from(deduped.values());
}

function cloneEntry(entry: MedicationCatalogEntry): MedicationCatalogEntry {
  return {
    ...entry,
    aliases: [...entry.aliases],
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
    lastUsedAt: entry.lastUsedAt ? new Date(entry.lastUsedAt) : undefined,
  };
}

function createInitialEntries(now = new Date()): MedicationCatalogEntry[] {
  const oneHour = 60 * 60 * 1000;

  return [
    {
      id: 'medcat-1',
      clinicId: E2E_CLINIC_ID,
      canonicalName: 'Paracetamol',
      aliases: ['Acetaminophen', 'Tylenol'],
      usageCount: 18,
      lastUsedAt: new Date(now.getTime() - oneHour),
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 48),
      updatedAt: new Date(now.getTime() - oneHour * 2),
    },
    {
      id: 'medcat-2',
      clinicId: E2E_CLINIC_ID,
      canonicalName: 'Amoxicillin',
      aliases: ['Amox'],
      usageCount: 11,
      lastUsedAt: new Date(now.getTime() - oneHour * 3),
      isActive: true,
      createdAt: new Date(now.getTime() - oneHour * 36),
      updatedAt: new Date(now.getTime() - oneHour * 3),
    },
    {
      id: 'medcat-3',
      clinicId: E2E_CLINIC_ID,
      canonicalName: 'Ibuprofen',
      aliases: ['Advil'],
      usageCount: 6,
      lastUsedAt: new Date(now.getTime() - oneHour * 10),
      isActive: false,
      createdAt: new Date(now.getTime() - oneHour * 24),
      updatedAt: new Date(now.getTime() - oneHour * 12),
    },
  ];
}

export default function MedicationCatalogE2EHarness() {
  const [events, setEvents] = useState<string[]>([]);
  const [seed, setSeed] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const storeRef = useRef<HarnessStore>({
    entries: createInitialEntries(),
  });

  const service = useMemo(() => {
    return medicalRecordWriteService as unknown as {
      searchMedicationCatalog: (input: MedicationCatalogSearchInput) => Promise<MedicationCatalogEntry[]>;
      updateMedicationCatalogEntry: (
        entryId: string,
        clinicId: string,
        updates: MedicationCatalogUpdateInput
      ) => Promise<MedicationCatalogEntry>;
    };
  }, []);

  const appendEvent = (event: string) => {
    setEvents((current) => [event, ...current].slice(0, 20));
  };

  useEffect(() => {
    const originalSearch = service.searchMedicationCatalog;
    const originalUpdate = service.updateMedicationCatalogEntry;

    service.searchMedicationCatalog = async (input) => {
      const query = input.query?.trim().toLocaleLowerCase() ?? '';
      const limit = input.limit ?? 200;

      const filtered = storeRef.current.entries
        .filter((entry) => entry.clinicId === input.clinicId)
        .filter((entry) => (input.includeInactive ? true : entry.isActive))
        .filter((entry) => {
          if (!query) return true;
          const haystack = [entry.canonicalName, ...entry.aliases].join(' ').toLocaleLowerCase();
          return haystack.includes(query);
        })
        .sort((left, right) => {
          if (left.usageCount !== right.usageCount) return right.usageCount - left.usageCount;
          return left.canonicalName.localeCompare(right.canonicalName);
        })
        .slice(0, limit)
        .map(cloneEntry);

      appendEvent(`search:${query || 'all'}`);
      return filtered;
    };

    service.updateMedicationCatalogEntry = async (entryId, clinicId, updates) => {
      let updatedEntry: MedicationCatalogEntry | null = null;

      storeRef.current.entries = storeRef.current.entries.map((entry) => {
        if (entry.id !== entryId || entry.clinicId !== clinicId) {
          return entry;
        }

        const canonicalName =
          updates.canonicalName !== undefined
            ? normalizeMedicationName(updates.canonicalName)
            : entry.canonicalName;
        const aliases =
          updates.aliases !== undefined
            ? normalizeAliases(updates.aliases, canonicalName)
            : normalizeAliases(entry.aliases, canonicalName);

        updatedEntry = {
          ...entry,
          canonicalName,
          aliases,
          isActive: updates.isActive ?? entry.isActive,
          updatedAt: new Date(),
        };

        return updatedEntry;
      });

      if (!updatedEntry) {
        throw new Error('Medication catalog entry not found in harness store');
      }

      appendEvent(`update:${entryId}`);
      return cloneEntry(updatedEntry);
    };

    setIsReady(true);

    return () => {
      setIsReady(false);
      service.searchMedicationCatalog = originalSearch;
      service.updateMedicationCatalogEntry = originalUpdate;
    };
  }, [service]);

  return (
    <div className="space-y-4 p-4" data-testid="medication-catalog-e2e-harness">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Medication Catalog E2E Harness</h1>
            <p className="text-sm text-muted-foreground">
              In-memory medication catalog service mock for deterministic search/edit and active state tests.
            </p>
          </div>

          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={() => {
              storeRef.current = {
                entries: createInitialEntries(),
              };
              setEvents([]);
              setSeed((current) => current + 1);
            }}
            data-testid="medication-e2e-reset"
          >
            Reset harness
          </button>
        </div>

        <div className="mt-3 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Recent service events</p>
          <ul className="mt-2 space-y-1 text-xs" data-testid="medication-e2e-events">
            {events.length === 0 ? <li className="text-muted-foreground">No events yet.</li> : null}
            {events.map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ul>
        </div>
      </div>

      {isReady ? (
        <ClinicMedications key={seed} e2eClinicId={E2E_CLINIC_ID} e2eUserId={E2E_USER_ID} />
      ) : (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground" data-testid="medication-e2e-loading">
          Initializing medication catalog harness...
        </div>
      )}
    </div>
  );
}
