import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const rootRealPath = realpathSync(rootDir);

// Only these paths are release material. The final file list is additionally
// constrained to files reported by Git, so ignored local notes/backups cannot
// enter the archive even when they sit next to release files.
const RELEASE_FILES = new Set([
  "manifest.json",
  "background.js",
  "content.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "comments.css",
  "comments.js",
  "options.html",
  "options.css",
  "options.js",
  "README.md",
  "LICENSE",
  "PRIVACY.md",
  "SECURITY.md",
]);
const RELEASE_DIRECTORIES = ["fonts/", "icons/", "lib/", "prompts/", "rules/"];

function normalizeRelativePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isReleasePath(filePath) {
  return (
    RELEASE_FILES.has(filePath) ||
    RELEASE_DIRECTORIES.some((directory) => filePath.startsWith(directory))
  );
}

function listTrackedReleaseFiles() {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "buffer",
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(isReleasePath)
    .sort();

  if (tracked.length === 0) {
    throw new Error("Git tracked release file list is empty");
  }
  return tracked;
}

function collectManifestResourcePaths(manifest) {
  const resources = new Set();
  const addPath = (value) => {
    if (typeof value === "string") {
      resources.add(normalizeRelativePath(value));
    }
  };
  const addArray = (value) => {
    if (Array.isArray(value)) value.forEach(addPath);
  };
  const addObjectValues = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.values(value).forEach(addPath);
    }
  };

  addPath(manifest.background?.service_worker);
  addPath(manifest.options_ui?.page);
  addPath(manifest.side_panel?.default_path);
  addObjectValues(manifest.action?.default_icon);
  addObjectValues(manifest.icons);
  for (const contentScript of manifest.content_scripts ?? []) {
    addArray(contentScript.js);
    addArray(contentScript.css);
  }
  for (const resource of manifest.declarative_net_request?.rule_resources ?? []) {
    addPath(resource.path);
  }

  return resources;
}

function ensureManifestResourcesArePackaged(manifest, packageFiles) {
  const packageFileSet = new Set(packageFiles);
  const missing = [...collectManifestResourcePaths(manifest)].filter(
    (resourcePath) => !packageFileSet.has(resourcePath),
  );
  if (missing.length > 0) {
    throw new Error(`Manifest resource(s) missing from package allowlist: ${missing.join(", ")}`);
  }
}

function powershellQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const manifest = JSON.parse(readFileSync(join(rootDir, "manifest.json"), "utf8"));
const zipName = `bili-digest-plus-ui-v${manifest.version}.zip`;
const zipPath = join(rootDir, "..", zipName);

console.log(`[Package] Packaging extension from: ${rootDir}`);
console.log(`[Package] Creating distribution package: ${zipName}`);

let stagingDir;
try {
  const packageFiles = listTrackedReleaseFiles();
  ensureManifestResourcesArePackaged(manifest, packageFiles);
  stagingDir = mkdtempSync(join(tmpdir(), "bili-digest-package-"));

  for (const relativePath of packageFiles) {
    const sourcePath = resolve(rootDir, ...relativePath.split("/"));
    const sourceRealPath = realpathSync(sourcePath);
    const sourceRelativePath = relative(rootRealPath, sourceRealPath);
    if (isAbsolute(sourceRelativePath) || sourceRelativePath.startsWith("..")) {
      throw new Error(`Release file resolves outside the repository: ${relativePath}`);
    }

    const destinationPath = join(stagingDir, ...relativePath.split("/"));
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(sourceRealPath, destinationPath);
  }

  // Let .NET archive the staging directory directly instead of deriving entry
  // names by subtracting path-string lengths. On Windows the same directory can
  // be represented as an 8.3 short path and as a long path; string slicing then
  // leaks a random temporary-directory suffix into the ZIP root. The
  // includeBaseDirectory=false overload guarantees manifest.json stays at the
  // archive root regardless of path representation.
  const psCmd = [
    "$ErrorActionPreference = 'Stop'",
    `$stage = ${powershellQuote(stagingDir)}`,
    `$dest = ${powershellQuote(zipPath)}`,
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $dest, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
    "if (-not (Test-Path -LiteralPath $dest)) { throw 'Archive was not created' }",
    'Write-Host "Created $dest"',
  ].join("\n");
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
    stdio: "inherit",
  });
  console.log(`✓ Package created successfully at: ${zipPath}`);
  console.log(`[Package] Included ${packageFiles.length} tracked release files.`);
} catch (err) {
  console.error("Packaging failed:", err.message);
  process.exitCode = 1;
} finally {
  if (stagingDir) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
