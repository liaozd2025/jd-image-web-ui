import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, realpathSync } from "node:fs";
import { access, copyFile, lstat, mkdir, readFile, readlink, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir, platform, arch } from "node:os";
import { dirname, join, resolve } from "node:path";

const PROJECT_NAME = "ilab-gpt-conjure";
const CACHE_ENV = "ILAB_WORKTREE_DEPS_DIR";
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const STALE_LOCK_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 250;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commandVersion(command, cwd) {
  const executable = process.platform === "win32" ? `${command}.cmd` : command;
  return execFileSync(executable, ["--version"], { cwd, encoding: "utf8" }).trim();
}

function findRepositoryRoot() {
  return realpathSync(git(["rev-parse", "--show-toplevel"], process.cwd()));
}

function inspectCheckout(root) {
  const worktreeGitDir = realpathSync(resolve(git(["rev-parse", "--absolute-git-dir"], root)));
  const commonGitDir = realpathSync(resolve(root, git(["rev-parse", "--git-common-dir"], root)));

  return {
    root,
    branch: git(["branch", "--show-current"], root) || "(detached HEAD)",
    isLinkedWorktree: worktreeGitDir !== commonGitDir,
  };
}

function defaultCacheRoot() {
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Caches", PROJECT_NAME, "deps");
  }

  const xdgCacheHome = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(xdgCacheHome, PROJECT_NAME, "deps");
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--help") || args.has("-h")) {
    console.log(`Usage: npm run worktree:deps [--status]

Run from a linked Git worktree. The command installs dependencies once in a
shared cache keyed by package.json, package-lock.json, Node and npm versions,
then links this worktree's node_modules to that immutable cache entry.

Environment:
  ${CACHE_ENV}  Override the shared dependency cache directory.
`);
    return { help: true, status: false };
  }

  const unknown = [...args].filter((arg) => arg !== "--status");
  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }

  return { help: false, status: args.has("--status") };
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function hasUsableDirectory(path) {
  try {
    const stats = await lstat(path);
    if (!stats.isDirectory()) {
      return false;
    }
    await access(path, constants.R_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function lockIsStale(lockPath) {
  try {
    const stats = await lstat(lockPath);
    return Date.now() - stats.mtimeMs > STALE_LOCK_MS;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function acquireInstallLock(lockPath) {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(lockPath);
      await writeFile(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      if (await lockIsStale(lockPath)) {
        await rm(lockPath, { recursive: true, force: true });
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for dependency installation lock: ${lockPath}`);
      }

      await delay(POLL_INTERVAL_MS);
    }
  }
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpmCi(stagingRoot) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      npmExecutable(),
      ["ci", "--include=dev", "--prefer-offline", "--no-audit", "--no-fund"],
      { cwd: stagingRoot, env: process.env, stdio: "inherit" },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`npm ci failed in ${stagingRoot} (code=${code ?? "unknown"}, signal=${signal ?? "none"})`));
    });
  });
}

async function installDependencies({ cacheRoot, targetRoot, packageJsonPath, packageLockPath }) {
  const lockPath = `${targetRoot}.installing`;
  await acquireInstallLock(lockPath);

  let stagingRoot;
  try {
    const targetNodeModules = join(targetRoot, "node_modules");
    if (await hasUsableDirectory(targetNodeModules)) {
      return false;
    }

    if (await pathExists(targetRoot)) {
      await rm(targetRoot, { recursive: true, force: true });
    }

    stagingRoot = join(cacheRoot, `.tmp-${Date.now()}-${process.pid}-${randomUUID()}`);
    await mkdir(stagingRoot);
    await copyFile(packageJsonPath, join(stagingRoot, "package.json"));
    await copyFile(packageLockPath, join(stagingRoot, "package-lock.json"));
    await runNpmCi(stagingRoot);

    await rename(stagingRoot, targetRoot);
    stagingRoot = undefined;
    return true;
  } finally {
    if (stagingRoot) {
      await rm(stagingRoot, { recursive: true, force: true });
    }
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function ensureWorktreeLink(worktreeNodeModules, targetNodeModules) {
  let existing;
  try {
    existing = await lstat(worktreeNodeModules);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existing && !existing.isSymbolicLink()) {
    throw new Error(
      `${worktreeNodeModules} already exists as a real directory or file. Move it away manually before linking; the tool will not delete it.`,
    );
  }

  if (existing?.isSymbolicLink()) {
    let pointsToTarget = false;
    try {
      const linkTarget = resolve(dirname(worktreeNodeModules), await readlink(worktreeNodeModules));
      pointsToTarget = (await realpath(linkTarget)) === (await realpath(targetNodeModules));
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (pointsToTarget) {
      return false;
    }

    await unlink(worktreeNodeModules);
  }

  await symlink(targetNodeModules, worktreeNodeModules, "dir");
  return true;
}

async function dependencyInfo(root) {
  const packageJsonPath = join(root, "package.json");
  const packageLockPath = join(root, "package-lock.json");
  const [packageJson, packageLock] = await Promise.all([readFile(packageJsonPath), readFile(packageLockPath)]);
  const npmVersion = commandVersion("npm", root);
  const fingerprint = createHash("sha256")
    .update("worktree-deps-v1\0")
    .update(packageJson)
    .update("\0")
    .update(packageLock)
    .update(`\0node=${process.version}\0npm=${npmVersion}\0platform=${platform()}\0arch=${arch()}`)
    .digest("hex")
    .slice(0, 24);

  const cacheRoot = resolve(process.env[CACHE_ENV] || defaultCacheRoot());
  const targetRoot = join(cacheRoot, fingerprint);

  return {
    cacheRoot,
    fingerprint,
    packageJsonPath,
    packageLockPath,
    targetNodeModules: join(targetRoot, "node_modules"),
    targetRoot,
  };
}

async function printStatus(checkout, info) {
  const worktreeNodeModules = join(checkout.root, "node_modules");
  let nodeModulesState = "missing";
  try {
    const stats = await lstat(worktreeNodeModules);
    nodeModulesState = stats.isSymbolicLink() ? "symlink" : stats.isDirectory() ? "directory" : "file";
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  console.log(`checkout: ${checkout.root}`);
  console.log(`branch: ${checkout.branch}`);
  console.log(`linked worktree: ${checkout.isLinkedWorktree ? "yes" : "no"}`);
  console.log(`dependency fingerprint: ${info.fingerprint}`);
  console.log(`shared node_modules: ${info.targetNodeModules}`);
  console.log(`worktree node_modules: ${nodeModulesState}`);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    return;
  }

  const checkout = inspectCheckout(findRepositoryRoot());
  const info = await dependencyInfo(checkout.root);

  if (options.status) {
    await printStatus(checkout, info);
    return;
  }

  if (!checkout.isLinkedWorktree) {
    throw new Error(
      "This command must run inside a linked Git worktree. The primary checkout is left untouched; create a worktree first, then run npm run worktree:deps there.",
    );
  }

  await mkdir(info.cacheRoot, { recursive: true });
  const installed = await installDependencies({
    cacheRoot: info.cacheRoot,
    targetRoot: info.targetRoot,
    packageJsonPath: info.packageJsonPath,
    packageLockPath: info.packageLockPath,
  });
  const linked = await ensureWorktreeLink(join(checkout.root, "node_modules"), info.targetNodeModules);

  console.log(`${installed ? "installed" : "reused"} shared dependencies: ${info.targetNodeModules}`);
  console.log(`${linked ? "linked" : "already linked"} worktree node_modules: ${join(checkout.root, "node_modules")}`);
}

main().catch((error) => {
  console.error(`[worktree:deps] ${error.message}`);
  process.exitCode = 1;
});
