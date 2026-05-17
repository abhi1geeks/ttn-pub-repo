/**
 * Smart Regulatory Source Library (CSV 1.1) — demo catalogue.
 * region > country > jurisdiction > regulatory body → canonical documentUrl
 */

export type SourceLeaf = {
  /** Stable id for keys */
  id: string;
  regulatoryBody: string;
  /** Canonical URL used by UC1 ingest + Qdrant */
  documentUrl: string;
  gameTypes?: string[];
  notes?: string;
};

export type SourceJurisdiction = {
  name: string;
  sources: SourceLeaf[];
};

export type SourceCountry = {
  name: string;
  jurisdictions: SourceJurisdiction[];
};

export type SourceRegion = {
  id: string;
  name: string;
  countries: SourceCountry[];
};

import { DEMO_CANONICAL_PDF } from "../lib/document_url";

/** Re-export for catalogue consumers (same URL as n8n ingest). */
export { DEMO_CANONICAL_PDF };

export const SOURCES_CATALOG: SourceRegion[] = [
  {
    id: "americas",
    name: "Americas",
    countries: [
      {
        name: "United States",
        jurisdictions: [
          {
            name: "Nevada",
            sources: [
              {
                id: "nv-ngcb-tech-stand",
                regulatoryBody: "Nevada Gaming Control Board — technical standards (illustrative)",
                documentUrl: DEMO_CANONICAL_PDF,
                gameTypes: ["slots", "systems"],
                notes: "POC: live PDF used for ingest demos in this repository.",
              },
              {
                id: "nv-resp-gaming-guide",
                regulatoryBody: "Nevada — responsible gaming advisory (placeholder URL)",
                documentUrl: "https://demo.gli-intelligence.example/us-nv/responsible-gaming-advisory.pdf",
                gameTypes: ["all"],
                notes: "Placeholder — wire in n8n when a stable public PDF is chosen.",
              },
            ],
          },
          {
            name: "New Jersey — Division of Gaming Enforcement",
            sources: [
              {
                id: "nj-dge-cyber",
                regulatoryBody: "NJ DGE — cybersecurity & logging (placeholder)",
                documentUrl: "https://demo.gli-intelligence.example/us-nj/dge-cyber-logging.pdf",
                gameTypes: ["online", "systems"],
              },
            ],
          },
        ],
      },
      {
        name: "Canada",
        jurisdictions: [
          {
            name: "Ontario",
            sources: [
              {
                id: "on-agco-standards",
                regulatoryBody: "AGCO — standards extract (placeholder)",
                documentUrl: "https://demo.gli-intelligence.example/ca-on/agco-standards.pdf",
                gameTypes: ["online"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "emea",
    name: "EMEA",
    countries: [
      {
        name: "Malta",
        jurisdictions: [
          {
            name: "Malta Gaming Authority",
            sources: [
              {
                id: "mga-player-protection",
                regulatoryBody: "MGA — player protection technical direction (placeholder)",
                documentUrl: "https://demo.gli-intelligence.example/mt/mga/player-protection.pdf",
                gameTypes: ["online", "rng"],
              },
            ],
          },
        ],
      },
      {
        name: "United Kingdom",
        jurisdictions: [
          {
            name: "UK Gambling Commission",
            sources: [
              {
                id: "ukgc-lts",
                regulatoryBody: "UKGC — licence conditions & codes (placeholder)",
                documentUrl: "https://demo.gli-intelligence.example/gb/ukgc/lts-excerpt.pdf",
                gameTypes: ["online", "land-based"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "apac",
    name: "Asia-Pacific",
    countries: [
      {
        name: "Australia",
        jurisdictions: [
          {
            name: "Victoria",
            sources: [
              {
                id: "vic-vcglr-standards",
                regulatoryBody: "VCGLR — technical standards snapshot (placeholder)",
                documentUrl: "https://demo.gli-intelligence.example/au-vic/vcglr-technical.pdf",
                gameTypes: ["electronic"],
              },
            ],
          },
        ],
      },
    ],
  },
];

export type FlatSourceEntry = SourceLeaf & {
  region: string;
  country: string;
  jurisdiction: string;
};

export function flattenSourcesCatalog(catalog: SourceRegion[]): FlatSourceEntry[] {
  const out: FlatSourceEntry[] = [];
  for (const region of catalog) {
    for (const country of region.countries) {
      for (const jur of country.jurisdictions) {
        for (const leaf of jur.sources) {
          out.push({
            ...leaf,
            region: region.name,
            country: country.name,
            jurisdiction: jur.name,
          });
        }
      }
    }
  }
  return out;
}

export function countCatalogLeaves(catalog: SourceRegion[]): number {
  return flattenSourcesCatalog(catalog).length;
}

/** All canonical URLs declared in the demo catalogue (deduped). */
export const CATALOG_DOCUMENT_URLS: string[] = (() => {
  const s = new Set<string>();
  for (const row of flattenSourcesCatalog(SOURCES_CATALOG)) {
    s.add(row.documentUrl);
  }
  return [...s].sort();
})();
