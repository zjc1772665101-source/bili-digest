import { readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

function getJsFiles(dir) {
  const files = [];
  for (const item of readdirSync(dir)) {
    if (item === "node_modules" || item === ".git") continue;
    const full = join(dir, item);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...getJsFiles(full));
    } else if (item.endsWith(".js") || item.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

const jsFiles = getJsFiles(rootDir);
console.log(`[Syntax Check] Checking ${jsFiles.length} JavaScript files...`);

let ok = 0;
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    ok++;
  } catch (err) {
    console.error(`✗ Syntax error in ${file}:\n`, err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

console.log(`✓ All ${ok} JavaScript files passed syntax check.`);
