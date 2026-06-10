const STORAGE_KEY = 'consultation:medication-history';
const MAX_ITEMS = 60;
const MAX_HISTORY_AGE_DAYS = 180;
const MAX_HISTORY_AGE_MS = MAX_HISTORY_AGE_DAYS * 24 * 60 * 60 * 1000;

interface MedicationHistoryEntry {
  name: string;
  updatedAt: number;
}

const DEFAULT_MEDICATIONS = [
  'Paracetamol',
  'Amoxicilline',
  'Ibuprofene',
  'Metformine',
  'Amlodipine',
  'Omeprazole',
  'Azithromycine',
  'Cefixime',
  'Losartan',
  'Atorvastatine',
  'Vitamine D3',
  'Fer sulfate',
];

function normalizeMedicationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeEntries(entries: MedicationHistoryEntry[]): MedicationHistoryEntry[] {
  const now = Date.now();
  const minAllowed = now - MAX_HISTORY_AGE_MS;
  const deduped = new Map<string, MedicationHistoryEntry>();

  for (const entry of entries) {
    const name = normalizeMedicationName(entry.name);
    if (!name) continue;

    const updatedAt = Number.isFinite(entry.updatedAt) ? entry.updatedAt : now;
    if (updatedAt < minAllowed) continue;

    const key = name.toLowerCase();
    const current = deduped.get(key);
    if (!current || current.updatedAt < updatedAt) {
      deduped.set(key, { name, updatedAt });
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITEMS);
}

function defaultEntries(): MedicationHistoryEntry[] {
  const now = Date.now();
  return DEFAULT_MEDICATIONS.map((name) => ({
    name,
    updatedAt: now,
  }));
}

function readStoredMedicationHistoryEntries(): MedicationHistoryEntry[] {
  if (typeof window === 'undefined') return defaultEntries();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEntries();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultEntries();

    const parsedEntries: MedicationHistoryEntry[] = parsed
      .map((item) => {
        if (typeof item === 'string') {
          return { name: item, updatedAt: Date.now() };
        }

        if (
          item &&
          typeof item === 'object' &&
          typeof (item as { name?: unknown }).name === 'string' &&
          typeof (item as { updatedAt?: unknown }).updatedAt === 'number'
        ) {
          return {
            name: (item as { name: string }).name,
            updatedAt: (item as { updatedAt: number }).updatedAt,
          };
        }

        return null;
      })
      .filter((item): item is MedicationHistoryEntry => item !== null);

    const cleaned = normalizeEntries(parsedEntries);

    if (cleaned.length === 0) return defaultEntries();
    return cleaned;
  } catch {
    return defaultEntries();
  }
}

function readStoredMedicationHistory(): string[] {
  return readStoredMedicationHistoryEntries().map((entry) => entry.name);
}

function writeStoredMedicationHistory(entries: MedicationHistoryEntry[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeEntries(entries)));
  } catch {
    // Ignore storage errors in private mode or restricted environments.
  }
}

export function saveMedicationHistory(names: string[]): void {
  const now = Date.now();
  const existing = readStoredMedicationHistoryEntries();
  const incoming = names
    .map(normalizeMedicationName)
    .filter(Boolean)
    .map((name) => ({
      name,
      updatedAt: now,
    }));
  const merged = [...incoming, ...existing];

  writeStoredMedicationHistory(merged);
}

export function getMedicationSuggestions(query: string, limit: number = 8): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  const source = readStoredMedicationHistory();

  if (!normalizedQuery) {
    return source.slice(0, limit);
  }

  return source
    .filter((item) => item.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);
}
