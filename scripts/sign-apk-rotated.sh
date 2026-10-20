#!/usr/bin/env bash
# Signs a release APK with the key rotation old CodeForge key -> new FancyCode key.
#
# The old key was public in this repository, so releases are signed with a new key. Android
# only installs an update over an existing app when the signature matches, so the APK carries
# the rotation proof (android/app/signing-lineage.bin, APK Signature Scheme v3): devices on
# Android 9+ switch to the new key, older devices keep verifying the v1/v2 signature of the
# old key.
#
# Usage: scripts/sign-apk-rotated.sh <apk>
# Env:   OLD_KEYSTORE_FILE OLD_KEYSTORE_PASSWORD OLD_KEY_ALIAS
#        FANCYCODE_KEYSTORE_FILE FANCYCODE_KEYSTORE_PASSWORD FANCYCODE_KEY_ALIAS FANCYCODE_KEY_PASSWORD
set -euo pipefail

APK="${1:?APK-Pfad fehlt}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LINEAGE="$ROOT/android/app/signing-lineage.bin"

APKSIGNER="${APKSIGNER:-}"
if [ -z "$APKSIGNER" ]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"
  APKSIGNER="$(ls -d "$SDK"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -n 1)"
fi
[ -x "$APKSIGNER" ] || { echo "apksigner nicht gefunden (ANDROID_HOME setzen)." >&2; exit 1; }

"$APKSIGNER" sign \
  --ks "$OLD_KEYSTORE_FILE" --ks-pass env:OLD_KEYSTORE_PASSWORD --ks-key-alias "${OLD_KEY_ALIAS:-codeforge}" \
  --next-signer \
  --ks "$FANCYCODE_KEYSTORE_FILE" --ks-pass env:FANCYCODE_KEYSTORE_PASSWORD \
  --ks-key-alias "$FANCYCODE_KEY_ALIAS" --key-pass env:FANCYCODE_KEY_PASSWORD \
  --lineage "$LINEAGE" \
  "$APK"

"$APKSIGNER" verify --verbose --print-certs "$APK" | grep -E 'Verified using|Signer #' || true
