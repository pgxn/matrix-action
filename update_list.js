async function getFormula(name) {
  const response = await fetch(
    `https://formulae.brew.sh/api/formula/${name}.json`,
  );
  return await response.json();
}

/// Construct a new platform record for macOS from a Homebrew Formula.
/// Returns an empty array for a disabled formula.
function newMac(formula) {
  // Ignore disabled formulae. Empty array will be flattened away.
  if (formula.disabled) return [];

  /*
   * No amd64 because Homebrew reports:
   * > Apple have dropped Intel x86_64 support in macOS Golden Gate (27).
   * > GitHub Actions are dropping macOS Intel x86_64 runners in 2027.
   */
  return {
    platform: "macos/arm64",
    emoji: "🍎",
    runner: "macos-default",
    postgres: parseInt(formula.name.slice(formula.name.indexOf("@") + 1)),
    deprecated: formula.deprecated,
    devel: false,
    beta: false,
  };
}

async function macOS() {
  // Start with the known good version.
  const DEFAULT_BREW_VERSION = (process.env.DEFAULT_BREW_VERSION =
    "postgresql@18");
  const formula = await getFormula(DEFAULT_BREW_VERSION);

  // Create async jobs to fetch and transform the results for all versions.
  let jobs = [
    new Promise((resolve) => {
      resolve(newMac(formula));
    }),
  ];
  for (const name of formula.versioned_formulae) {
    jobs.push(getFormula(name).then(newMac));
  }

  // Flatten the results.
  return Promise.all(jobs).then((values) => values.flat());
}

async function windows() {
  const response = await fetch(
    "https://raw.githubusercontent.com/mkevenaar/chocolatey-packages/refs/heads/master/automatic/postgresql/postgresql.json",
  );
  const versions = await response.json();
  let plats = [];
  let seen = {};
  const base = {
    emoji: "🪟",
    deprecated: false,
    devel: false,
    beta: false,
  };
  for (const key in versions) {
    let version = Number(key);
    if (Number.isNaN(version)) continue;
    if (version >= 10) {
      version = Math.trunc(version);
    }
    if (seen.hasOwnProperty(version)) continue;
    seen[version] = true;
    plats.push(
      {
        postgres: version,
        platform: "windows/amd64",
        runner: "windows-default",
        ...base,
      },
      {
        postgres: version,
        platform: "windows/arm64",
        runner: "windows-11-arm64",
        ...base,
      },
    );
  }
  return plats;
}

async function linux() {
  const response = await fetch(
    "https://salsa.debian.org/postgresql/apt.postgresql.org/-/raw/master/pgapt.conf",
  );
  const data = await response.text();

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

  // Beta?
  for (const line of data.split("\n")) {
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
    pushLinux(plats, false, v, v == beta, v == dev);
  }

  for (const v of deprecated.reverse()) {
    pushLinux(plats, true, v, false, false);
  }

  return plats;
}

function pushLinux(plats, deprecated, v, beta, devel) {
  plats.push(
    {
      platform: "linux/amd64",
      emoji: "🐧",
      runner: "ubuntu-default",
      postgres: v,
      deprecated: deprecated,
      devel: devel,
      beta: beta,
    },
    {
      platform: "linux/arm64",
      emoji: "🐧",
      runner: "ubuntu-24.04-arm",
      postgres: v,
      deprecated: deprecated,
      devel: devel,
      beta: beta,
    },
  );
}

Promise.all([linux(), macOS(), windows()]).then((values) =>
  console.log(values.flat()),
);
