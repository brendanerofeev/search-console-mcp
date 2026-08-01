import { describe, it, expect } from "vitest";
import { formatError } from "../src/common/errors.js";

describe("Error Formatting Utilities (src/common/errors.ts)", () => {
  it("formats 429 rate limit errors with user-friendly resolution", () => {
    const err = Object.assign(new Error("Too Many Requests"), { code: 429 });
    const res = formatError(err);

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Rate limit exceeded");
    expect(res.errorCode).toBe(429);
  });

  it("formats 401 authentication errors correctly", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    const res = formatError(err);

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Authentication failed");
  });

  it("formats 403 permission errors correctly", () => {
    const err = Object.assign(new Error("Forbidden"), { code: 403 });
    const res = formatError(err);

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Permission denied");
    expect(res.errorCode).toBe(403);
  });

  it("formats 404 not found errors correctly", () => {
    const err = Object.assign(new Error("Not Found"), { status: 404 });
    const res = formatError(err);

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Resource not found");
  });

  it("extracts nested Google API error array messages", () => {
    const err = Object.assign(new Error("Generic Error"), {
      errors: [{ message: "Specific Google API error message" }],
      resolution: "Check API Console permissions",
    });
    const res = formatError(err);

    expect(res.content[0].text).toBe("Error: Specific Google API error message");
    expect(res.resolution).toBe("Check API Console permissions");
  });

  it("falls back to error.message if errors array element lacks message property", () => {
    const err = Object.assign(new Error("Fallback error message"), {
      errors: [{}],
    });
    const res = formatError(err);

    expect(res.content[0].text).toBe("Error: Fallback error message");
  });

  it("handles standard Error instances without status code", () => {
    const err = new Error("Standard error message");
    const res = formatError(err);

    expect(res.content[0].text).toBe("Error: Standard error message");
  });

  it("handles primitive string/number error objects", () => {
    const resString = formatError("Plain string error");
    expect(resString.content[0].text).toBe("Error: Plain string error");

    const resNum = formatError(500);
    expect(resNum.content[0].text).toBe("Error: 500");
  });
});
