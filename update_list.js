async function getFormula(name) {
  const response = await fetch(`https://formulae.brew.sh/api/formula/${ name }.json`);
  return await response.json();
}

/// Construt a new platform record for macOS from a Homebrew Formula.
/// Returns an empty array for a diabled formula.
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
    postgres: parseInt( formula.name.slice( formula.name.indexOf("@") + 1 ) ),
    deprecated: formula.deprecated,
    devel: false,
    beta: false,
  }
}

async function macOS() {
  // Start with the known good version.
  const DEFAULT_BREW_VERSION = process.env.DEFAULT_BREW_VERSION = 'postgresql@18';
  const formula = await getFormula(DEFAULT_BREW_VERSION)

  // Create async jobs to fetch and transform the results for all versions.
  let jobs = [new Promise((resolve) => { resolve(newMac(formula)) })]
  for (const name of formula.versioned_formulae) {
    jobs.push(getFormula(name).then(newMac));
  }

  // Flatten the results.
  return Promise.all(jobs).then((values) => values.flat());
}

async function main() {
  Promise.all([macOS()]).then((values) => console.log(values.flat()));
}

main().catch(console.error);
