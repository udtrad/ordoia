/**
 * Planted workflows for check 19's controls test.
 *
 * In the manner of check 0 and check 16: a scanner that has never been shown a violation
 * it must catch, and a near-miss it must not, is a scanner nobody has reason to believe.
 * These are the cases the real `.github/workflows/` cannot demonstrate, because the point
 * of the check is that the real ones are clean.
 *
 * They live in a fixture file rather than inline in the check, following check 16's
 * precedent. Check 16 scans every file in `tests/checks/` for test declarations, and a
 * template literal full of workflow YAML sitting in a check file is one more thing for a
 * lexical scanner to mis-read. Fixtures cost one import and remove the question.
 */

/** A hardcoded domain in a code position. Must be caught. */
export const HARDCODED_DOMAIN = `
name: bad
jobs:
  x:
    steps:
      - run: npm test
        env:
          ORDOIA_LIVE: https://ordoia.com
`;

/**
 * The same string, in a full-line comment. Must be permitted.
 *
 * Workflows have to be able to explain themselves, and the explanation for "the domain is
 * not written here" is very hard to write without writing the domain.
 */
export const DOMAIN_IN_COMMENT = `
name: fine
# The origin is read from src/_data/site.json rather than written here, because
# ordoia.com was previously ordoia.co.uk and both lines had to be found by hand.
jobs:
  x:
    steps:
      - run: node tools/site-origin.mjs
`;

/** A former domain, in a code position. Must be caught: it is the exact drift lesson 8 is. */
export const FORMER_DOMAIN = `
name: bad
jobs:
  x:
    steps:
      - run: curl https://ordoia.co.uk/oal/v1.0
`;

/** A floating major tag. Must be caught. */
export const FLOATING_TAG = `
name: bad
jobs:
  x:
    steps:
      - uses: actions/checkout@v4
`;

/**
 * A commit SHA with the tag it stood for in a trailing comment. Must be permitted.
 *
 * The trailing comment is how a human renews the pin, so a rule that forbade it would
 * make the pins unmaintainable and they would rot back to tags within a year.
 */
export const PINNED_WITH_NOTE = `
name: fine
jobs:
  x:
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
`;

/** A local action. Must be permitted — it is in this repository, so it is pinned by being here. */
export const LOCAL_ACTION = `
name: fine
jobs:
  x:
    steps:
      - uses: ./.github/actions/build
`;

/** A branchless Pages deploy. Must be caught — this is the one that silently deploys nowhere. */
export const DEPLOY_WITHOUT_BRANCH = `
name: bad
jobs:
  x:
    steps:
      - uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
        with:
          wranglerVersion: '4.120.0'
          command: pages deploy _site --project-name=ordoia
`;

/** The same deploy, naming its branch. Must be permitted. */
export const DEPLOY_WITH_BRANCH = `
name: fine
jobs:
  x:
    steps:
      - uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
        with:
          wranglerVersion: '4.120.0'
          command: pages deploy _site --project-name=ordoia --branch=main
`;

/** wrangler-action with no version pinned. Must be caught. */
export const UNPINNED_WRANGLER = `
name: bad
jobs:
  x:
    steps:
      - uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
        with:
          command: pages deploy _site --project-name=ordoia --branch=main
`;
