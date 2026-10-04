#!/bin/bash
# Apple creates the app container and Xcode project; this script never signs it.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Safari app conversion requires macOS with full Xcode selected.' >&2
  exit 1
fi
if [[ $# != 2 ]]; then
  echo 'Usage: bash convert.sh NEW_PROJECT_DIRECTORY YOUR_REVERSE_DNS_BUNDLE_ID' >&2
  exit 2
fi
project_directory=$1
bundle_identifier=$2
if [[ ! "$bundle_identifier" =~ ^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$ ]]; then
  echo 'Provide your own reverse-DNS bundle identifier, for example com.example.kicadreview.' >&2
  exit 2
fi
if [[ -e "$project_directory" ]]; then
  echo 'Choose a new project directory; this script does not overwrite projects.' >&2
  exit 2
fi
script_directory=$(cd -- "$(dirname -- "$0")" && pwd)
if [[ ! -f "$script_directory/web-extension/manifest.json" ]]; then
  echo 'Unzip the complete Safari development package first.' >&2
  exit 2
fi
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  apple_tool=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  apple_tool=safari-web-extension-converter
else
  echo 'Select full Xcode using xcode-select; no Apple Safari packaging tool was found.' >&2
  exit 1
fi
exec xcrun "$apple_tool" "$script_directory/web-extension" \
  --project-location "$project_directory" \
  --app-name 'KiCad Visual Review' \
  --bundle-identifier "$bundle_identifier" \
  --macos-only --swift --copy-resources --no-open
