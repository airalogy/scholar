#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=$(sed -n 's/^SCHOLAR_VERSION=//p' "${SCHOLAR_ENV_FILE:-$script_dir/.env}" | head -n 1)
version=${version:-unknown}
target_platform=${SCHOLAR_TARGET_PLATFORM:-linux/amd64}
case "$target_platform" in
  linux/amd64|linux/arm64) ;;
  *)
    printf '%s\n' 'SCHOLAR_TARGET_PLATFORM must be linux/amd64 or linux/arm64' >&2
    exit 1
    ;;
esac
platform_slug=$(printf '%s' "$target_platform" | tr '/' '-')
output=${1:-$script_dir/scholar-images-$version-$platform_slug.tar.gz}
output_dir=$(dirname -- "$output")
output_name=$(basename -- "$output")
mkdir -p "$output_dir"
manifest_json=${SCHOLAR_RELEASE_MANIFEST_FILE:-$script_dir/release-manifest.json}
manifest_env=${SCHOLAR_RELEASE_METADATA_FILE:-$script_dir/release-manifest.env}
[ -f "$manifest_json" ] || {
  printf 'Release manifest not found: %s\n' "$manifest_json" >&2
  exit 1
}
[ -f "$manifest_env" ] || {
  printf 'Release metadata not found: %s\n' "$manifest_env" >&2
  exit 1
}

images=$(SCHOLAR_OFFLINE=false $script_dir/scholarctl images)
[ -n "$images" ] || {
  printf '%s\n' 'No images resolved from the deployment configuration.' >&2
  exit 1
}

save_images=
: >"$output.images"
for image in $images; do
  docker pull --platform "$target_platform" "$image"
  tagged_image=${image%@*}
  image_id=$(docker image inspect --format '{{.Id}}' "$tagged_image")
  printf '%s %s\n' "$tagged_image" "$image_id" >>"$output.images"
  save_images="$save_images $tagged_image"
done

# Image references contain no spaces, so intentional word splitting is safe here.
docker image save $save_images | gzip -9 >"$output"

cp "$manifest_json" "$output.manifest.json"
cp "$manifest_env" "$output.manifest.env"
printf '%s\n' "$target_platform" >"$output.platform"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$output_dir" && sha256sum "$output_name" "$output_name.manifest.json" "$output_name.manifest.env" "$output_name.images" "$output_name.platform" >"$output_name.sha256")
else
  (cd "$output_dir" && shasum -a 256 "$output_name" "$output_name.manifest.json" "$output_name.manifest.env" "$output_name.images" "$output_name.platform" >"$output_name.sha256")
fi

printf 'Offline image bundle created: %s\n' "$output"
printf 'Checksum created: %s.sha256\n' "$output"
printf 'Release metadata copied: %s.manifest.json\n' "$output"
printf 'Image inventory created: %s.images\n' "$output"
printf 'Target platform metadata created: %s.platform (%s)\n' "$output" "$target_platform"
