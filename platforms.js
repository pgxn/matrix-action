import { readFileSync } from "fs";

export async function listPlatforms(p) {
  const list = JSON.parse(readFileSync(p.file, "utf8"));

  var plats = [];
  for (const cfg of list) {
    if (cfg.postgres > p.max || cfg.postgres < p.min) continue;
    if (cfg.devel && !p.dev) continue;
    if (cfg.beta && !p.beta) continue;
    if (cfg.deprecated && !p.old) continue;
    if (p.oses && new RegExp(`\\b${cfg.os}\\b`).test(p.oses)) continue;
    if (p.arches && new RegExp(`\\b${cfg.arch}\\b`).test(p.arches)) continue;
    if (p.plats && new RegExp(`\\b${cfg.os}/${cfg.arch}\\b`).test(p.plats))
      continue;
    plats.push(cfg);
  }
  return plats;
}

function bool(v) {
  if (!v) return Boolean(v);
  v = String(v).toLowerCase();
  return v !== "0" && v !== "f" && v !== "false";
}

export function params() {
  return {
    file: process.env.MATRIX_PLATFORMS_FILE,
    min: Number(process.env.MATRIX_MIN_VERSION) || 0,
    max: Number(process.env.MATRIX_MAX_VERSION) || Number.MAX_SAFE_INTEGER,
    dev: bool(process.env.MATRIX_DEVELOPMENT),
    beta: bool(process.env.MATRIX_BETA),
    old: bool(process.env.MATRIX_DEPRECATED),
    oses: process.env.MATRIX_EXCLUDE_OS,
    arches: process.env.MATRIX_EXCLUDE_ARCH,
    plats: process.env.MATRIX_EXCLUDE_PLATFORM,
  };
}

async function main() {
  console.log(JSON.stringify(await listPlatforms(params())));
}

if (!process.env.MATRIX_TESTING) await main();
