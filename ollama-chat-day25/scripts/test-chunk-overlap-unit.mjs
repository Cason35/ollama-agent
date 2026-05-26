import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chunkText, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } = await import(
  pathToFileURL(path.join(ROOT, "lib/knowledge-chunking.ts")).href
);

const text = "A".repeat(1200);
const chunks = chunkText(text, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);
const noOv = Math.ceil(1200 / 500);
let overlapOk = false;
if (chunks.length >= 2) {
  overlapOk = chunks[1].startsWith(chunks[0].slice(-DEFAULT_CHUNK_OVERLAP).slice(0, 20)) || chunks[0].slice(-50) === chunks[1].slice(0, 50).slice(0, chunks[0].slice(-50).length);
  const tail = chunks[0].slice(-DEFAULT_CHUNK_OVERLAP);
  overlapOk = chunks[1].includes(tail.slice(0, 20));
}
console.log(
  JSON.stringify({
    pass: chunks.length > noOv && overlapOk,
    chunkCount: chunks.length,
    noOverlapEstimate: noOv,
    lengths: chunks.map((c) => c.length),
    overlapOk,
  }, null, 2)
);
