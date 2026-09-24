# Generate Postgres Platform Matrix

[![⚖️ PostgreSQL]][pg] [![🎬 Action]][action] [![✅ Test]][ci]

This action creates a matrix of configurations for supported OSes (Linux,
macOS, Windows), architectures (amd64, arm64), and PostgreSQL versions
available for use in GitHub workflows. It relies on a daily inventory of
Postgres versions available for each [GitHub runner] OS.

The main use case is testing Postgres extensions using the
[pgxn/postgres-action] action. An example:

``` yaml
name: ✅ CI
on:
  push:
jobs:
  matrix:
    name: 📋 Generate Matrix
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - name: Generate Matrix
        id: matrix
        uses: pgxn/matrix-action@v0
        with:
          min-version: 12
          beta: true

  test:
    name: ${{ matrix.pg.emoji }} ${{ matrix.pg.os }}/${{ matrix.pg.arch }} 🐘 v${{ matrix.pg.version }}
    needs: matrix
    runs-on: ${{ matrix.pg.runner }}
    strategy:
      matrix:
        pg: ${{ fromJson(needs.matrix.outputs.matrix) }}
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Start Postgres ${{ matrix.pg }}
        uses: pgxn/postgres-action@v0
        with: { version: "${{ matrix.pg }}" }
      - run:  make
      - run:  sudo make install
      - id:   test
        run:  make installcheck
      - if:   failure() && steps.test.outcome == 'failure'
        run:  find . -name regression.diffs -exec cat {} +
```

The first job, `matrix`, uses the action to output a JSON array of GitHub
workflow configurations that support Postgres 12 or later, including beta
releases. The `outputs` section maps the action output to the job output named
`matrix`. This job runs on an Ubuntu runner, but it should work equally well
on any runner that supports Node.

The second job, `test`, depends on the `matrix` job, and parses its output
into the `pg` matrix value. With the matrix set, it customizes the job name
and GitHub runner and sets the version of Postgres for [pgxn/postgres-action]
to configure and start. The remaining steps carry out the usual Postgres
extension `make && make install && make installcheck` steps.

## Input Parameters

This action takes the following parameters:

| Key           | Type    | Default | Description                                                    |
| ------------- | ------- | ------- |--------------------------------------------------------------- |
| `min-version` | number  |         | Minimum Postgres major version to include                      |
| `max-version` | number  |         | Maximum Postgres major version to include                      |
| `beta`        | boolean | false   | Include the Postgres beta release when available               |
| `devel`       | boolean | false   | Include the Postgres development release when available        |
| `supported`   | boolean | false   | Include only currently [supported Postgres versions][pgv]      |
| `deprecated`  | boolean | false   | Include Postgres versions deprecated by the OS packager        |
| `no-os`       | string  |         | Exclude space-delimited list of OSes                           |
| `no-arch`     | string  |         | Exclude space-delimited list of architectures                  |
| `no-platform` | string  |         | Exclude space-delimited list of `os/architecture` combinations |

## Output Parameters

| Key      | Type | Description                    |
| -------- | ---- | ------------------------------ |
| `matrix` | JSON | JSON array of platform objects |

The [platforms.json](platforms.json) file, updated daily, contains the list of
configurations from which the action assembles the matrix. Each object has the
following keys:

| Key           | Type    | Description                                                          |
| ------------- | ------- |--------------------------------------------------------------------- |
| `os`          | string  | The OS name: `linux`, `macos`, or `windows`                          |
| `arch`        | string  | The architecture name: `amd64` or `arm64`                            |
| `version`     | number  | Postgres major version number                                        |
| `runner`      | string  | A likely GitHub runner                                               |
| `emoji`       | string  | A single emoji relevant to the OS name                               |
| `unsupported` | boolean | True if the major version is not a [supported Postgres version][pgv] |
| `deprecated`  | boolean | True if the major version has been deprecated by the packager        |
| `devel`       | boolean | True if the major version is the current developer release           |
| `beta`        | boolean | True if the major version is the current beta release                |

Example:

``` json
{
  "emoji": "🐧",
  "os": "linux",
  "arch": "arm64",
  "runner": "ubuntu-24.04-arm",
  "version": 20,
  "unsupported": false,
  "deprecated": false,
  "devel": true,
  "beta": false
}
```

## Sources

The sources for the OS and Postgres version data assembled daily in
[platforms.json](platforms.json) file include:

*   OS Versions: list of [GitHub Runner Images]
*   Supported Postgres versions: [PostgreSQL Versioning Policy][pgv] ([JSON][pvgj])
*   Linux Postgres versions: [pgapt.conf]
*   macOS Postgres versions: [Homebrew Postgres Cask] ([JSON][pgbrew])
*   Windows Postgres versions: [Chocolatey Postgres Package] ([JSON][pgchoc])

  [⚖️ PostgreSQL]: https://img.shields.io/badge/License-PostgreSQL-blue.svg "⚖️ PostgreSQL License"
  [pg]: https://opensource.org/license/postgresql "⚖️ PostgreSQL License"
  [✅ Test]: https://github.com/pgxn/matrix-action/actions/workflows/test.yml/badge.svg "🧪 Test Status"
  [ci]: https://github.com/pgxn/matrix-action/actions/workflows/test.yml "🧪 Test Status"
  [🎬 Action]: https://img.shields.io/badge/Marketplace-Action-orange.svg "🎬 Marketplace Action"
  [action]: https://github.com/marketplace/actions/pgxn-matrix-action "🎬 Marketplace Action"
  [GitHub runner]: https://github.com/actions/runner-images "GitHub Actions runner images"
  [pgxn/postgres-action]: https://github.com/pgxn/postgres-action "PGXN Postgres Action"
  [pgv]: https://www.postgresql.org/support/versioning/
    "PostgreSQL Versioning Policy"
  [GitHub Runner Images]: https://github.com/actions/runner-images#available-images
    "GitHub Actions runner images: Available Images"
  [pvgj]: https://www.postgresql.org/versions.json
  [Homebrew Postgres Cask]: https://formulae.brew.sh/formula/postgresql@18
  [pgbrew]: formulae.brew.sh/api/formula/postgresql@18.json
  [pgapt.conf]: https://salsa.debian.org/postgresql/apt.postgresql.org/-/raw/master/pgapt.conf
  [Chocolatey Postgres Package]: https://github.com/mkevenaar/chocolatey-packages/tree/master/automatic/postgresql
  [pgchoc]: https://raw.githubusercontent.com/mkevenaar/chocolatey-packages/refs/heads/master/automatic/postgresql/postgresql.json
