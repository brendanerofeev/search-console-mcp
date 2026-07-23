import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import readline from "readline";

const CACHE_PATH = join(homedir(), ".search-console-mcp-update-cache.json");
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export interface UpdateInfo {
  latestVersion: string;
  updateAvailable: boolean;
}

export async function checkVersionCached(currentVersion: string, force = false): Promise<UpdateInfo> {
  const now = Date.now();
  let cached: { lastCheck: number; latestVersion: string } | null = null;

  if (!force && existsSync(CACHE_PATH)) {
    try {
      cached = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    } catch {
      // Ignore cache read failures.
    }
  }

  if (cached && now - cached.lastCheck < CHECK_INTERVAL) {
    return {
      latestVersion: cached.latestVersion,
      updateAvailable: isNewerVersion(currentVersion, cached.latestVersion),
    };
  }

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);

    const res = await fetch("https://registry.npmjs.org/search-console-mcp/latest", {
      signal: controller.signal,
    });
    clearTimeout(id);

    if (res.ok) {
      const data = await res.json() as any;
      const latestVersion = data.version;

      try {
        writeFileSync(CACHE_PATH, JSON.stringify({ lastCheck: now, latestVersion }), "utf8");
      } catch {
        // Ignore cache write failures.
      }

      return {
        latestVersion,
        updateAvailable: isNewerVersion(currentVersion, latestVersion),
      };
    }
  } catch {
    // Fail silently on timeout/network issues.
  }

  return {
    latestVersion: currentVersion,
    updateAvailable: false,
  };
}

function isNewerVersion(current: string, latest: string): boolean {
  const cParts = current.split(".").map(Number);
  const lParts = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const cNum = cParts[i] ?? 0;
    const lNum = lParts[i] ?? 0;
    if (lNum > cNum) return true;
    if (cNum > lNum) return false;
  }
  return false;
}

export async function runUpdateCommand(): Promise<void> {
  console.log("\nUpdating search-console-mcp to the latest version...");
  try {
    execSync("npm install -g search-console-mcp", { stdio: "inherit" });
    console.log("Update completed successfully! Please restart the tool.");
  } catch (error) {
    console.error("Update failed. Please run manually: npm install -g search-console-mcp");
  }
}

export async function promptUpdateInteractive(latestVersion: string, currentVersion: string): Promise<void> {
  console.log(`\n⚠️  A new version of search-console-mcp is available: v${latestVersion} (current: v${currentVersion})`);
  console.log("Press Enter to update automatically, or any other key to continue...");

  return new Promise<void>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("", (answer) => {
      rl.close();
      if (answer === "") {
        runUpdateCommand().then(() => resolve());
      } else {
        resolve();
      }
    });
  });
}

export async function getAgentUpdateNotice(currentVersion: string): Promise<string | null> {
  const info = await checkVersionCached(currentVersion);
  if (info.updateAvailable) {
    return `\n\n[SYSTEM NOTICE: A newer version v${info.latestVersion} of search-console-mcp is available (current: v${currentVersion}). Please inform the user they can update by running: npx search-console-mcp update]`;
  }
  return null;
}
