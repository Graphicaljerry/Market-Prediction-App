#!/bin/bash
# Regenerates the entry-file twins. CLAUDE.md is the only hand-edited one.
# Invariant 9: generated files are rebuilt by script, never hand-edited.
set -e
cd "$(dirname "$0")/.."
cp CLAUDE.md AGENTS.md
cp CLAUDE.md routing.md
echo "twins regenerated from CLAUDE.md ($(wc -l < CLAUDE.md) lines)"
