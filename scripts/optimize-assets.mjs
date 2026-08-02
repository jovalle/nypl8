import { rename, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = ['ny-excelsior-source.png', 'ny-state-symbol.png'];

for (const asset of assets) {
  const input = fileURLToPath(new URL(`../public/${asset}`, import.meta.url));
  const output = `${input}.optimized`;
  const before = (await stat(input)).size;
  await sharp(input)
    .png({ adaptiveFiltering: true, compressionLevel: 9, effort: 10 })
    .toFile(output);
  const after = (await stat(output)).size;
  if (after < before) {
    await rename(output, input);
    console.log(`${asset}: ${before} -> ${after} bytes`);
  } else {
    await rm(output, { force: true });
    console.log(`${asset}: already optimal (${before} bytes)`);
  }
}
