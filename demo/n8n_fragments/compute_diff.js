// === Diff: which chunk IDs are new, which are stale + carry ingest metadata to run record ===
const newChunks = $('Chunk + Hash').all().map((it) => it.json);
const scroll = $input.first().json;

const existingPoints = (scroll && scroll.result && scroll.result.points) || [];
const existingIds = new Set(existingPoints.map((p) => String(p.id)));
const newIdSet = new Set(newChunks.map((c) => c.pointId));

const toInsert = newChunks.filter((c) => !existingIds.has(c.pointId));
const toDeleteIds = existingPoints.filter((p) => !newIdSet.has(String(p.id))).map((p) => p.id);

const f = newChunks[0] || {};
const sourceIngest = {
  httpStatus: f.ingestHttpStatus ?? null,
  fetchedAt: f.ingestFetchedAt || null,
  etag: f.ingestEtag ?? null,
  lastModified: f.ingestLastModified ?? null,
  contentLength: f.ingestContentLength ?? null,
  bytes: f.ingestBytes ?? null,
  productLine: f.productLine ?? null,
  jurisdiction: f.jurisdiction ?? null,
  effectiveDate: f.effectiveDate ?? null,
  error: f.ingestError ?? null,
};

return [
  {
    json: {
      summary: {
        totalChunks: newChunks.length,
        newChunks: toInsert.length,
        removedChunks: toDeleteIds.length,
        unchangedChunks: newChunks.length - toInsert.length,
      },
      toInsert,
      toDeleteIds,
      versionId: f.versionId || null,
      documentUrl: f.documentUrl || null,
      documentHash: f.documentHash || null,
      pdfPageCount: f.pdfPageCount,
      pdfPageCountSource: f.pdfPageCountSource,
      sourceIngest,
      pdfArtifact: f.pdfArtifact || null,
      urlHash: f.urlHash || null,
    },
  },
];
