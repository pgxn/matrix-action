import { test } from "node:test";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { deprecate } from "node:util";

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
  delete process.env.MATRIX_SUPPORTED;
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
      supp: false,
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
    process.env.MATRIX_SUPPORTED = "t";
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
      supp: true,
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
    process.env.MATRIX_SUPPORTED = "f";
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
      supp: false,
      old: false,
      oses: "true",
      arches: "hi",
      plats: "sleep",
    });
  });

  test("basic platforms", async (t) => {
    let basic = [
      {
        emoji: "🐧",
        os: "linux",
        arch: "arm64",
        runner: "ubuntu-24.04-arm",
        postgres: 18,
        deprecated: false,
        devel: false,
        beta: false,
      },
    ];
    await using tmpDir = await fs.mkdtempDisposable(
      path.join(os.tmpdir(), "matrix-basic-"),
    );
    const file = path.join(tmpDir.path, "basic.json");
    await fs.writeFile(file, JSON.stringify(basic));
    assert.deepStrictEqual(await mod.listPlatforms({ file: file }), basic);
  });

  test("platform versions", async (t) => {
    const v9 = { os: "linux", postgres: 9.4 };
    const v16 = { os: "linux", postgres: 16 };
    const v17 = { os: "linux", postgres: 17 };
    const v18 = { os: "linux", postgres: 18 };
    const v19 = { os: "linux", postgres: 19 };
    let versions = [v9, v16, v17, v18, v19];

    // Write out platforms file.
    await using tmpDir = await fs.mkdtempDisposable(
      path.join(os.tmpdir(), "matrix-versions-"),
    );
    const file = path.join(tmpDir.path, "versions.json");
    await fs.writeFile(file, JSON.stringify(versions));

    // No version specifications.
    assert.deepStrictEqual(await mod.listPlatforms({ file: file }), versions);

    // Min version <= earliest
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 9.4 }),
      versions,
    );
    // Min version > earliest
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, min: 9.5 }),
      [v16, v17, v18, v19],
    );
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, min: 18 }),
      [v18, v19],
    );

    // Max version <= earliest
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, max: 19 }),
      versions,
    );

    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, max: 9.6 }),
      [v9],
    );

    // Min and max
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 9.6, max: 18 }),
      [v16, v17, v18],
    );
  });

  test("devel, beta, supported, deprecated", async (t) => {
    const devel = { os: "linux", postgres: 20, devel: true };
    const beta = { os: "linux", postgres: 19, beta: true };
    const ok = { os: "linux", postgres: 18 };
    const unsup = { os: "linux", postgres: 13, unsupported: true };
    const old = { os: "linux", postgres: 12, deprecated: true };

    // Write out platforms file.
    await using tmpDir = await fs.mkdtempDisposable(
      path.join(os.tmpdir(), "matrix-status-"),
    );
    const file = path.join(tmpDir.path, "status.json");
    await fs.writeFile(file, JSON.stringify([devel, beta, ok, unsup, old]));

    // No devel, beta, or deprecated by default
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 0, oses: "macos" }),
      [ok, unsup],
    );

    // Include deprecated.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 0, old: true }),
      [ok, unsup, old],
    );

    // Include supported.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 0, supp: true }),
      [ok],
    );

    // Include devel.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, min: 0, dev: true }),
      [devel, ok, unsup],
    );

    // Include beta.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true }),
      [beta, ok, unsup],
    );

    // Include beta and devel.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, dev: true }),
      [devel, beta, ok, unsup],
    );

    // Include beta and deprecated.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, old: true }),
      [beta, ok, unsup, old],
    );

    // Include all.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, beta: true, dev: true, old: true }),
      [devel, beta, ok, unsup, old],
    );

    // Exclude devel, beta, old.
    assert.deepStrictEqual(
      await mod.listPlatforms({
        file: file,
        beta: false,
        dev: false,
        old: false,
      }),
      [ok, unsup],
    );
  });

  test("platforms", async (t) => {
    const macosArm = { os: "macos", arch: "arm64", postgres: 18 };
    const macosAmd = { os: "macos", arch: "amd64", postgres: 18 };
    const linuxArm = { os: "linux", arch: "arm64", postgres: 18 };
    const linuxAmd = { os: "linux", arch: "amd64", postgres: 18 };
    const windowsArm = { os: "windows", arch: "arm64", postgres: 18 };
    const windowsAmd = { os: "windows", arch: "amd64", postgres: 18 };
    const plats = [
      macosArm,
      macosAmd,
      linuxAmd,
      linuxArm,
      windowsAmd,
      windowsArm,
    ];

    // Write out platforms file.
    await using tmpDir = await fs.mkdtempDisposable(
      path.join(os.tmpdir(), "matrix-status-"),
    );
    const file = path.join(tmpDir.path, "status.json");
    await fs.writeFile(file, JSON.stringify(plats));

    // Includes all by default.
    assert.deepStrictEqual(await mod.listPlatforms({ file: file }), plats);

    // Exclude macOS.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, oses: "macos" }),
      [linuxAmd, linuxArm, windowsAmd, windowsArm],
    );

    // Exclude macOS & windows.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, oses: "macos windows" }),
      [linuxAmd, linuxArm],
    );

    // Ignore unknown OS.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, oses: "nonesuch" }),
      plats,
    );

    // Ignore unknown OS with valid OS.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, oses: "nonesuch macos" }),
      [linuxAmd, linuxArm, windowsAmd, windowsArm],
    );

    // Exclude arm64.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, arches: "arm64" }),
      [macosAmd, linuxAmd, windowsAmd],
    );

    // Exclude amd64.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, arches: "amd64" }),
      [macosArm, linuxArm, windowsArm],
    );

    // Exclude both.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, arches: "amd64, arm64" }),
      [],
    );

    // Ignore unknown arch.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, arches: "nonesuch" }),
      plats,
    );

    // Ignore unknown arch alongside valid.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, arches: "nonesuch amd64" }),
      [macosArm, linuxArm, windowsArm],
    );

    // Exclude macos amd.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, plats: "macos/amd64" }),
      [macosArm, linuxAmd, linuxArm, windowsAmd, windowsArm],
    );

    // Exclude windows arm.
    assert.deepStrictEqual(
      await mod.listPlatforms({ file: file, plats: "windows/arm64" }),
      [macosArm, macosAmd, linuxAmd, linuxArm, windowsAmd],
    );

    // Exclude multiples.
    assert.deepStrictEqual(
      await mod.listPlatforms({
        file: file,
        plats: "windows/arm64 linux/arm64",
      }),
      [macosArm, macosAmd, linuxAmd, windowsAmd],
    );

    // Ignore unknown.
    assert.deepStrictEqual(
      await mod.listPlatforms({
        file: file,
        plats: "linux/ppc64el",
      }),
      plats,
    );

    // Ignore unknown alongside valid.
    assert.deepStrictEqual(
      await mod.listPlatforms({
        file: file,
        plats: "windows/arm64,linux/ppc64el",
      }),
      [macosArm, macosAmd, linuxAmd, linuxArm, windowsAmd],
    );
  });
});
