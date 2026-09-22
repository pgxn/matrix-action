/*
 * https://raw.githubusercontent.com/actions/runner-images/refs/heads/main/README.md
 *
 * No amd64 because Homebrew reports:
 * > Apple have dropped Intel x86_64 support in macOS Golden Gate (27).
 * > GitHub Actions are dropping macOS Intel x86_64 runners in 2027.
 */
const ARCH = {
  macOS: { arm64: "macos-latest" },
  linux: { arm64: "ubuntu-24.04-arm", amd64: "ubuntu-latest" },
  windows: { arm64: "windows-11-arm", amd64: "windows-latest" },
};

async function getFormula(name) {
  const response = await fetch(
    `https://formulae.brew.sh/api/formula/${name}.json`,
  );
  return await response.json();
}

/// Construct platform records for macOS from a Homebrew Formula. Returns an
/// empty array for a disabled formula.
function newMac(formula, minSupported) {
  // Ignore disabled formulae. Empty array will be flattened away.
  if (formula.disabled) return [];

  const v = parseInt(formula.name.slice(formula.name.indexOf("@") + 1));
  return Object.keys(ARCH.macOS).map((arch) => ({
    emoji: "🍎",
    os: "macos",
    arch: arch,
    runner: ARCH.macOS[arch],
    postgres: v,
    unsupported: v < minSupported,
    deprecated: formula.deprecated,
    devel: false,
    beta: false,
  }));
}

async function macOS(minSupported) {
  // Start with the known good version.
  const DEFAULT_BREW_VERSION = `postgresql@${process.env.DEFAULT_BREW_VERSION || "18"}`;
  const formula = await getFormula(DEFAULT_BREW_VERSION);

  // Create async jobs to fetch and transform the results for all versions.
  let jobs = [
    new Promise((resolve) => {
      resolve(newMac(formula, minSupported));
    }),
  ];
  for (const name of formula.versioned_formulae) {
    jobs.push(getFormula(name).then((f) => newMac(f, minSupported)));
  }

  // Flatten the results.
  return Promise.all(jobs).then((values) => values.flat());
}

async function windows(minSupported) {
  const response = await fetch(
    "https://raw.githubusercontent.com/mkevenaar/chocolatey-packages/refs/heads/master/automatic/postgresql/postgresql.json",
  );
  const versions = await response.json();
  let plats = [];
  let seen = {};
  for (const key in versions) {
    let version = Number(key);
    if (Number.isNaN(version)) continue;
    if (version >= 10) {
      version = Math.trunc(version);
    }
    if (seen.hasOwnProperty(version)) continue;
    seen[version] = true;
    plats.push(
      Object.keys(ARCH.windows).map((arch) => ({
        emoji: "🪟",
        os: "windows",
        arch: arch,
        runner: ARCH.windows[arch],
        postgres: version,
        unsupported: version < minSupported,
        deprecated: false,
        devel: false,
        beta: false,
      })),
    );
  }
  return plats.flat();
}

async function linux(minSupported) {
  const response = await fetch(
    "https://salsa.debian.org/postgresql/apt.postgresql.org/-/raw/master/pgapt.conf",
  );

  // Regular expressions to match lines of interest from pgapt.conf.
  const BETA_REGEX = /^PG_BETA_VERSION=(\d+)/;
  const DEV_REGEX = /^PG_DEVEL_VERSION=(\d+)/;
  const VERSIONS_REGEX = /^PG_VERSIONS="([^"]+)"/;
  const ALL_VERSIONS_REGEX = /^PG_ALL_VERSIONS="([^$]+)/;

  // Version information to collect.
  let beta = 0;
  let dev = 0;
  let matches = [];
  let supported = [];
  let deprecated = [];

  const data = await response.text();
  for (const line of data.split("\n")) {
    // Beta?
    if ((matches = BETA_REGEX.exec(line)) !== null) {
      beta = Number(matches[1]);
      if (Number.isNaN(beta)) {
        throw new Error(`PG_BETA_VERSION is not a number: ${line}`);
      }
      continue;
    }

    // Devel?
    if ((matches = DEV_REGEX.exec(line)) !== null) {
      dev = Number(matches[1]);
      if (Number.isNaN(dev)) {
        throw new Error(`PG_DEVEL_VERSION is not a number: ${line}`);
      }
      continue;
    }

    // Supported versions?
    if ((matches = VERSIONS_REGEX.exec(line)) !== null) {
      for (const str of matches[1].split(/\s+/)) {
        const v = Number(str);
        if (Number.isNaN(v)) {
          throw new Error(`PG_VERSIONS contains invalid version: ${line}`);
        }
        supported.push(v);
      }
      continue;
    }

    // Deprecated versions?
    if ((matches = ALL_VERSIONS_REGEX.exec(line)) !== null) {
      for (const str of matches[1].trim().split(/\s+/)) {
        const v = Number(str);
        if (Number.isNaN(v)) {
          throw new Error(`PG_ALL_VERSIONS contains invalid version: ${line}`);
        }
        deprecated.push(v);
      }
      break;
    }
  }

  // Assemble the platforms.
  let plats = [];
  for (const v of supported.reverse()) {
    plats.push(
      Object.keys(ARCH.linux).map((arch) => ({
        emoji: "🐧",
        os: "linux",
        arch: arch,
        runner: ARCH.linux[arch],
        postgres: v,
        unsupported: v < minSupported,
        deprecated: false,
        devel: v == dev,
        beta: v == beta,
      })),
    );
  }

  for (const v of deprecated.reverse()) {
    plats.push(
      Object.keys(ARCH.linux).map((arch) => ({
        emoji: "🐧",
        os: "linux",
        arch: arch,
        runner: ARCH.linux[arch],
        postgres: v,
        unsupported: v < minSupported,
        deprecated: true,
        devel: v == false,
        beta: v == false,
      })),
    );
  }

  return plats.flat();
}

/// Returns the minimum Postgres version supported by the community. Read from
/// the [versioning page], and depending on the simple parsing of its HTML.
///
/// [versioning page]: https://www.postgresql.org/support/versioning/
async function minSupported() {
  const response = await fetch(
    "https://www.postgresql.org/support/versioning/",
  );

  // Regular expressions to match lines of interest from versions page.
  const HEADER_REGEX = /<h2>Releases<\/h2>/;
  const BODY_REGEX = /<tbody>/;
  const VERSION_REGEX = /<td>(\d+)<\/td>/;
  const SUPPORTED_REGEX = /<td>(Yes|No)<\/td>/;
  let supported = [];

  const data = await response.text();
  let inTable = false;
  let inBody = false;
  for (const line of data.split("\n")) {
    if (inTable) {
      // We've reached the Releases table.
      if (inBody) {
        // We've reached the body of the Releases table.
        let matches = [];
        if ((matches = VERSION_REGEX.exec(line)) !== null) {
          // Found a version cell.
          supported.push(Number(matches[1]));
        } else if ((matches = SUPPORTED_REGEX.exec(line)) !== null) {
          // Found a supported cell.
          if (matches[1] === "No") {
            // This version not supported, so previous is the last supported.
            // Pop this one off the list and stop.
            supported.pop();
            break;
          }
        }
        continue;
      }
      inBody = BODY_REGEX.test(line);
      continue;
    }
    inTable = HEADER_REGEX.test(line);
  }

  // The last version is the minimum supported version.
  return Number(supported.pop());
}

const min = await minSupported();
Promise.all([linux(min), macOS(min), windows(min)]).then((values) =>
  console.log(JSON.stringify(values.flat(), null, "  ")),
);
