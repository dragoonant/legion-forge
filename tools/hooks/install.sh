#!/bin/sh
# Installs the privacy pre-commit hook into the shared git dir. The patterns file must be created by hand (never tracked).
dir="$(git rev-parse --git-common-dir)"
cp "$(dirname "$0")/pre-commit" "$dir/hooks/pre-commit" && chmod +x "$dir/hooks/pre-commit"
[ -s "$dir/privacy-patterns.txt" ] || echo "Now write $dir/privacy-patterns.txt (one regex per line: real name, email, home path)."
