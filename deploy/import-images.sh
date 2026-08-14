#!/bin/sh

set -eu

archive=${1:-}
[ -n "$archive" ] || {
  printf '%s\n' 'Usage: deploy/import-images.sh <scholar-images-version.tar.gz>' >&2
  exit 1
}
[ -f "$archive" ] || {
  printf 'Image bundle not found: %s\n' "$archive" >&2
  exit 1
}

checksum_file=$archive.sha256
[ -f "$checksum_file" ] || {
  printf 'Offline bundle checksum is missing: %s\n' "$checksum_file" >&2
  exit 1
}
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$(dirname -- "$archive")" && sha256sum -c "$(basename -- "$checksum_file")")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$(dirname -- "$archive")" && shasum -a 256 -c "$(basename -- "$checksum_file")")
else
  printf '%s\n' 'sha256sum or shasum is required to verify the offline bundle.' >&2
  exit 1
fi

platform_file=$archive.platform
[ -f "$platform_file" ] || {
  printf 'Offline bundle platform metadata is missing: %s\n' "$platform_file" >&2
  exit 1
}
bundle_platform=$(sed -n '1p' "$platform_file")
host_arch=$(uname -m)
case "$host_arch" in
  x86_64|amd64) host_platform=linux/amd64 ;;
  arm64|aarch64) host_platform=linux/arm64 ;;
  *)
    printf 'Unsupported host architecture: %s\n' "$host_arch" >&2
    exit 1
    ;;
esac
[ "$bundle_platform" = "$host_platform" ] || {
  printf 'Image bundle targets %s but this server is %s.\n' "$bundle_platform" "$host_platform" >&2
  exit 1
}

bundle_manifest=$archive.manifest.json
bundle_metadata=$archive.manifest.env
bundle_images=$archive.images
for required_file in "$bundle_manifest" "$bundle_metadata" "$bundle_images"; do
  [ -f "$required_file" ] || {
    printf 'Offline bundle metadata is missing: %s\n' "$required_file" >&2
    exit 1
  }
done

expected_manifest_checksum=$(sed -n 's/^SCHOLAR_RELEASE_MANIFEST_SHA256=//p' "$bundle_metadata" | head -n 1)
if command -v sha256sum >/dev/null 2>&1; then
  actual_manifest_checksum=$(sha256sum "$bundle_manifest" | awk '{ print $1 }')
else
  actual_manifest_checksum=$(shasum -a 256 "$bundle_manifest" | awk '{ print $1 }')
fi
[ "$actual_manifest_checksum" = "$expected_manifest_checksum" ] || {
  printf '%s\n' 'Offline bundle release manifest does not match its metadata.' >&2
  exit 1
}

installed_metadata=${SCHOLAR_RELEASE_METADATA_FILE:-$(dirname -- "$0")/release-manifest.env}
if [ -f "$installed_metadata" ]; then
  installed_checksum=$(sed -n 's/^SCHOLAR_RELEASE_MANIFEST_SHA256=//p' "$installed_metadata" | head -n 1)
  [ "$installed_checksum" = "$expected_manifest_checksum" ] || {
    printf '%s\n' 'Offline image bundle belongs to a different Scholar release package.' >&2
    exit 1
  }
fi

gzip -dc "$archive" | docker image load
while read -r image expected_id; do
  [ -n "$image" ] || continue
  actual_id=$(docker image inspect --format '{{.Id}}' "$image")
  [ "$actual_id" = "$expected_id" ] || {
    printf 'Imported image identity mismatch for %s.\n' "$image" >&2
    exit 1
  }
done <"$bundle_images"
printf '%s\n' 'Offline images imported and matched to the Scholar release metadata.'
printf '%s\n' 'Set SCHOLAR_OFFLINE=true in deploy/.env, then run deploy/scholarctl install.'
