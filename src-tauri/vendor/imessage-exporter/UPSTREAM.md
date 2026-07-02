# Vendored imessage-exporter Source

The vendored crates in this directory are derived from:

- Repository: <https://github.com/ReagentX/imessage-exporter>
- Baseline tag: `4.1.0`
- Baseline commit: `d6a4b005e3c364c2e29d936557c2085e4ca7be5a`

This tree is not an unmodified copy of the upstream `4.1.0` tag. It includes
local changes needed by iMessage Exporter GUI, including the in-process library
entrypoint, log sink integration, JSONL export support, attachment/exporter
compatibility updates, and additional parser/export test data.

When refreshing the vendored source, compare the new upstream tag against this
directory, keep GUI-specific integration points intentional, and update this file
with the new upstream tag or commit.
