import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = join(root, "packages", "nyx-windows");
const assets = ["index.html", "logo.svg", "ui.css", "ui.js"];
const argumentsAfterEntry = process.argv.slice(2);
const check = argumentsAfterEntry.includes("--check");
if (argumentsAfterEntry.some((argument) => argument !== "--check")) {
  throw new Error("usage: node scripts/omega/package-nyx.mjs [--check]");
}

const bundle = await build({
  entryPoints: [join(root, "scripts", "omega", "nyx-ui.ts")],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  write: false,
  metafile: true,
  logLevel: "silent",
});
const imports = Object.values(bundle.metafile.outputs).flatMap((output) => output.imports);
const unexpected = imports.filter((item) => item.external && !item.path.startsWith("node:"));
if (unexpected.length) {
  throw new Error(`NYX package has unbundled dependencies: ${unexpected.map((item) => item.path).join(", ")}`);
}
if (bundle.outputFiles.length !== 1) throw new Error("expected exactly one bundled runtime");

const files = new Map([["nyx.mjs", Buffer.from(bundle.outputFiles[0].contents)]]);
for (const asset of assets) {
  files.set(
    `nyx-ui/${asset}`,
    await readFile(join(root, "scripts", "omega", "nyx-ui", asset)),
  );
}
const hashes = Object.fromEntries(
  [...files].map(([name, contents]) => [name, createHash("sha256").update(contents).digest("hex")]),
);
files.set(
  "manifest.json",
  Buffer.from(`${JSON.stringify({ schemaVersion: 1, name: "nyx-local", nodeMajorMinimum: 24, files: hashes }, null, 2)}\n`),
);

for (const [name, contents] of files) {
  const destination = join(outputRoot, name);
  if (check) {
    const existing = await readFile(destination);
    if (!existing.equals(contents)) throw new Error(`NYX package is stale: ${name}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
}
process.stdout.write(
  `NYX package ${check ? "verified" : "built"}: ${[...files].length} files, ${[...files.values()].reduce((sum, item) => sum + item.length, 0)} bytes\n`,
);
