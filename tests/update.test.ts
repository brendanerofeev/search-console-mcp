import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const mockQuestion = vi.fn();
const mockClose = vi.fn();

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("readline", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: mockQuestion,
      close: mockClose,
    })),
  },
}));

// Import update utility after child_process and readline mocks are defined
import { checkVersionCached, promptUpdateInteractive, runUpdateCommand, getAgentUpdateNotice } from "../src/utils/update.js";

describe("Update Utility", () => {
  const cachePath = join(homedir(), ".search-console-mcp-update-cache.json");
  let originalConsoleLog: any;
  let originalConsoleError: any;
  let consoleLogMock: any;
  let consoleErrorMock: any;
  let fetchMock: any;

  beforeEach(() => {
    originalConsoleLog = global.console.log;
    originalConsoleError = global.console.error;
    consoleLogMock = vi.fn();
    consoleErrorMock = vi.fn();
    global.console.log = consoleLogMock;
    global.console.error = consoleErrorMock;

    vi.mocked(execSync).mockClear();
    mockQuestion.mockClear();
    mockClose.mockClear();

    if (existsSync(cachePath)) {
      try { unlinkSync(cachePath); } catch { /* ignore */ }
    }
  });

  afterEach(() => {
    global.console.log = originalConsoleLog;
    global.console.error = originalConsoleError;

    if (existsSync(cachePath)) {
      try { unlinkSync(cachePath); } catch { /* ignore */ }
    }
    vi.restoreAllMocks();
  });

  it("checks version and detects update when npm has a newer version", async () => {
    fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ version: "2.0.0" }),
    } as any);

    const info = await checkVersionCached("1.0.0", true);
    expect(fetchMock).toHaveBeenCalled();
    expect(info.latestVersion).toBe("2.0.0");
    expect(info.updateAvailable).toBe(true);

    // Verify cache file was created
    expect(existsSync(cachePath)).toBe(true);
    const cachedData = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(cachedData.latestVersion).toBe("2.0.0");
  });

  it("uses cached check results if within the interval", async () => {
    writeFileSync(cachePath, JSON.stringify({ lastCheck: Date.now(), latestVersion: "1.5.0" }), "utf8");
    fetchMock = vi.spyOn(global, "fetch");

    const info = await checkVersionCached("1.0.0");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(info.latestVersion).toBe("1.5.0");
    expect(info.updateAvailable).toBe(true);
  });

  it("handles fetch failure silently and defaults to current version", async () => {
    fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network Error"));

    const info = await checkVersionCached("1.2.0", true);
    expect(info.latestVersion).toBe("1.2.0");
    expect(info.updateAvailable).toBe(false);
  });

  it("runs the update CLI command successfully", async () => {
    await runUpdateCommand();
    expect(execSync).toHaveBeenCalledWith("npm install -g search-console-mcp", { stdio: "inherit" });
    expect(consoleLogMock).toHaveBeenCalledWith(expect.stringContaining("Update completed successfully"));
  });

  it("handles update command failure gracefully", async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("Command failed");
    });

    await runUpdateCommand();
    expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining("Update failed"));
  });

  it("handles interactive CLI update prompt - positive response", async () => {
    mockQuestion.mockImplementation((_q, callback) => callback(""));

    await promptUpdateInteractive("2.0.0", "1.0.0");
    expect(mockQuestion).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    expect(execSync).toHaveBeenCalledWith("npm install -g search-console-mcp", { stdio: "inherit" });
  });

  it("handles interactive CLI update prompt - ignored response", async () => {
    mockQuestion.mockImplementation((_q, callback) => callback("no"));

    await promptUpdateInteractive("2.0.0", "1.0.0");
    expect(mockQuestion).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("returns agent notice if newer version available", async () => {
    writeFileSync(cachePath, JSON.stringify({ lastCheck: Date.now(), latestVersion: "2.5.0" }), "utf8");
    const notice = await getAgentUpdateNotice("1.0.0");
    expect(notice).toContain("search-console-mcp update");
  });

  it("returns null notice if no updates available", async () => {
    writeFileSync(cachePath, JSON.stringify({ lastCheck: Date.now(), latestVersion: "1.0.0" }), "utf8");
    const notice = await getAgentUpdateNotice("1.0.0");
    expect(notice).toBeNull();
  });
});
