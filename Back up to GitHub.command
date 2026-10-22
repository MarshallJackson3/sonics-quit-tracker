#!/bin/bash
# Double-click to back up this whole folder to your private GitHub repo.
# It runs the tests first (if they're set up), then saves and uploads any changes.

cd "$(dirname "$0")" || exit 1
printf '\033]0;Sonics backup\007'
export PATH="$PATH:$HOME/bin:/usr/local/bin:/opt/homebrew/bin"

done_and_wait() {
  echo
  echo "$1"
  echo
  read -r -p "Press Return to close this window." _
  exit "$2"
}

echo "=== Sonics backup ==="
echo

if [ -d tests/node_modules ] && command -v node >/dev/null 2>&1; then
  echo "--- Running the tests ---"
  (cd tests && npm test) || done_and_wait "Some tests failed (see above). Nothing was backed up. Tell Claude what it says." 1
  echo
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "No changes since the last backup."
else
  echo "--- Saving changes ---"
  git status --short
  git add -A
  git commit -q -m "Backup $(date '+%Y-%m-%d %H:%M')" || done_and_wait "Couldn't save the changes (see above)." 1
fi

echo
echo "--- Uploading to GitHub ---"
git push -q origin main || done_and_wait "Couldn't upload. Check your internet connection and try again." 1

done_and_wait "Backed up. You can see it at $(git remote get-url origin | sed 's/\.git$//')" 0
