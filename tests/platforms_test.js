import { readFileSync } from "fs";
import test from "node:test";
import assert from "node:assert/strict";
import { listPlatforms } from "../platforms.js";

// Prevent platforms.js from executing.
process.env.MATRIX_TESTING = 1;

import("../platforms.js").then((mod) => {
  // Unset environment variables.
  delete process.env.MATRIX_PLATFORMS_FILE;
  delete process.env.MATRIX_MIN_VERSION;
  delete process.env.MATRIX_MAX_VERSION;
  delete process.env.MATRIX_DEVELOPMENT;
  delete process.env.MATRIX_BETA;
  delete process.env.MATRIX_DEPRECATED;
  delete process.env.MATRIX_EXCLUDE_OS;
  delete process.env.MATRIX_EXCLUDE_ARCH;
  delete process.env.MATRIX_EXCLUDE_PLATFORM;

  // Tests with environment variables must be synchronous.
  test("default params", (t) => {
    assert.deepStrictEqual(mod.params(), {
      file: undefined,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      dev: false,
      beta: false,
      old: false,
      oses: undefined,
      arches: undefined,
      plats: undefined,
    });
  });

  // Test from environment variables.
  test("environment params", (t) => {
    process.env.MATRIX_PLATFORMS_FILE = "foo.json";
    process.env.MATRIX_MIN_VERSION = 9.5;
    process.env.MATRIX_MAX_VERSION = 22;
    process.env.MATRIX_DEVELOPMENT = 1;
    process.env.MATRIX_BETA = 1;
    process.env.MATRIX_DEPRECATED = 1;
    process.env.MATRIX_EXCLUDE_OS = "macos,windows";
    process.env.MATRIX_EXCLUDE_ARCH = "amd64";
    process.env.MATRIX_EXCLUDE_PLATFORM = "windows/arm64";
    assert.deepStrictEqual(mod.params(), {
      file: "foo.json",
      min: 9.5,
      max: 22,
      dev: true,
      beta: true,
      old: true,
      oses: "macos,windows",
      arches: "amd64",
      plats: "windows/arm64",
    });
  });

  test("alternate params", (t) => {
    process.env.MATRIX_PLATFORMS_FILE = "valid.ok";
    process.env.MATRIX_MIN_VERSION = "xyz"; // invalid
    process.env.MATRIX_MAX_VERSION = "nan";
    process.env.MATRIX_DEVELOPMENT = "false";
    process.env.MATRIX_BETA = "f";
    process.env.MATRIX_DEPRECATED = "0";
    process.env.MATRIX_EXCLUDE_OS = "true";
    process.env.MATRIX_EXCLUDE_ARCH = "hi";
    process.env.MATRIX_EXCLUDE_PLATFORM = "sleep";
    assert.deepStrictEqual(mod.params(), {
      file: "valid.ok",
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      dev: false,
      beta: false,
      old: false,
      oses: "true",
      arches: "hi",
      plats: "sleep",
    });
  });
});
