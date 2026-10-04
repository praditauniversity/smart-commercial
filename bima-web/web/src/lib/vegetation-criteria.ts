export const VEGETATION_CRITERIA = [
  { id: 'obstructs_object', label: 'Vegetasi menutupi atau menghalangi objek' },
  { id: 'dead_parts', label: 'Vegetasi mati: daun, batang, atau dahan' },
  { id: 'weeds', label: 'Vegetasi gulma atau rumput liar' },
  { id: 'overgrown', label: 'Vegetasi terlalu lebat (menghalangi ruang vertikal/horizontal)' },
  { id: 'overlapping', label: 'Vegetasi saling bertumpu atau terlalu rapat' },
  { id: 'forked_trunk', label: 'Batang ganda berbentuk V' },
  { id: 'diseased_or_damaged', label: 'Vegetasi sakit atau rusak, misalnya daun berlubang atau banyak ulat/hama' },
] as const;

const labelsById = new Map<string, string>(VEGETATION_CRITERIA.map(({ id, label }) => [id, label]));

export function normalizeVegetationCriteria(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && labelsById.has(item)))];
}

export function parseVegetationCriteria(raw: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return normalizeVegetationCriteria(parsed).map((id) => labelsById.get(id)!);
  } catch {
    return [];
  }
}
