// Prüft, dass die Animation „Atem“ (JS + CSS) gzip-komprimiert höchstens 8 KB groß ist.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 8 * 1024;
const files = ["packages/brand/src/atem.js", "packages/brand/src/atem.css"];
const total = files.reduce((sum, f) => sum + gzipSync(readFileSync(new URL("../" + f, import.meta.url)), { level: 9 }).length, 0);
console.log(`Atem: ${total} Byte gzip (Grenze ${LIMIT} Byte).`);
if (total > LIMIT) process.exit(1);
