import os from "node:os";
import { hash } from "@node-rs/argon2";

/** Measures Argon2id cost on THIS machine to choose parameters (aim for roughly 100–500 ms per login). */
async function main() {
  const configs = [
    { memoryCost: 19_456, timeCost: 2 },
    { memoryCost: 47_104, timeCost: 1 },
    { memoryCost: 65_536, timeCost: 2 },
    { memoryCost: 65_536, timeCost: 3 },
  ];
  console.log(`cpu=${os.cpus()[0]?.model} cores=${os.cpus().length} node=${process.version}`);
  for (const c of configs) {
    const runs = 5;
    const t = performance.now();
    for (let i = 0; i < runs; i++) await hash("benchmark-password-123", { algorithm: 2 /* Argon2id */, parallelism: 1, ...c });
    console.log(`m=${c.memoryCost}KiB t=${c.timeCost} p=1 -> ${((performance.now() - t) / runs).toFixed(1)} ms/hash`);
  }
}
main();
