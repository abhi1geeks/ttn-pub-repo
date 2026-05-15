// Combine the chunk metadata with the embedding into one Qdrant point (extended metadata).
const chunk = $('Split: New Chunks').item.json;
const embed = $input.item.json;

return {
  json: {
    point: {
      id: chunk.pointId,
      vector: embed.embedding,
      payload: {
        content: chunk.chunkText,
        metadata: {
          chunkHash: chunk.chunkHash,
          chunkIndex: chunk.chunkIndex,
          documentUrl: chunk.documentUrl,
          documentHash: chunk.documentHash,
          versionId: chunk.versionId,
          productLine: chunk.productLine,
          jurisdiction: chunk.jurisdiction,
          effectiveDate: chunk.effectiveDate,
          pdfPageCount: chunk.pdfPageCount,
          pdfPageCountSource: chunk.pdfPageCountSource,
          chunkPageStart: chunk.chunkPageStart,
          chunkPageEnd: chunk.chunkPageEnd,
          ingestHttpStatus: chunk.ingestHttpStatus,
          ingestFetchedAt: chunk.ingestFetchedAt,
          ingestEtag: chunk.ingestEtag,
          ingestLastModified: chunk.ingestLastModified,
          ingestContentLength: chunk.ingestContentLength,
          ingestBytes: chunk.ingestBytes,
          ingestError: chunk.ingestError,
        },
      },
    },
  },
};
