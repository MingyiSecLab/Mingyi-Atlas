export interface CveReference {
  id: string;
  url?: string;
  summary?: string;
}

export function normalizeCveId(value: string): string | null {
  const match = value.trim().match(/^CVE-\d{4}-\d{4,}$/i);
  return match ? match[0].toUpperCase() : null;
}

export function cveUrl(id: string): string | null {
  const normalized = normalizeCveId(id);
  return normalized ? `https://www.cve.org/CVERecord?id=${normalized}` : null;
}
