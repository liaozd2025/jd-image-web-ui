#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly DEFAULT_OUTPUT_DIR="${REPOSITORY_ROOT}/dist"
readonly TARGET_PLATFORM="linux/amd64"
readonly PYTHON_BASE_IMAGE="docker.io/library/python:3.13.14-slim-trixie@sha256:afe189875f1d2f9b45e287834fb9f2c273a5d59d354ae4050ab9affbf0a6ba06"
readonly POSTGRES_SOURCE_IMAGE="docker.io/library/postgres:16.10-alpine@sha256:ab8380566c3ea09690a9ecaa85a59d82bfc6eb86744151a2a54335866c83a3e9"
readonly NGINX_SOURCE_IMAGE="docker.io/library/nginx:1.27.5-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8"
readonly POSTGRES_BUNDLED_IMAGE="jd-image-web-ui/postgres:16.10-alpine-amd64"
readonly NGINX_BUNDLED_IMAGE="jd-image-web-ui/nginx:1.27.5-alpine-amd64"

release_version=""
output_dir="${DEFAULT_OUTPUT_DIR}"
temporary_root=""

usage() {
  cat <<'EOF'
Usage:
  scripts/build-release.sh --version VERSION [--output DIR]

Build a versioned linux/amd64 production bundle. The Git worktree must be clean.
The bundle includes the application, PostgreSQL and Nginx images.

Options:
  --version VERSION  Required release version, for example v1.2.0.
  --output DIR       Output directory. Defaults to ./dist.
  -h, --help         Show this help.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${temporary_root}" && -d "${temporary_root}" ]]; then
    rm -rf -- "${temporary_root}"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

parse_arguments() {
  while (($#)); do
    case "$1" in
      --version)
        (($# >= 2)) || die "--version requires a value"
        release_version="$2"
        shift 2
        ;;
      --output)
        (($# >= 2)) || die "--output requires a value"
        output_dir="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done
}

validate_inputs() {
  [[ -n "${release_version}" ]] || die "--version is required"
  [[ "${release_version}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || die "version may contain only letters, numbers, dot, underscore and hyphen"
  require_command docker
  require_command git
  require_command tar
  docker info >/dev/null 2>&1 || die "Docker daemon is unavailable"
  docker buildx version >/dev/null 2>&1 || die "Docker Buildx is required"
  git -C "${REPOSITORY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "repository metadata is unavailable"
  [[ -z "$(git -C "${REPOSITORY_ROOT}" status --porcelain)" ]] \
    || die "Git worktree is not clean; commit or stash all changes before building a release"
  for required_file in \
    Dockerfile.server \
    deploy/server/compose.production.yml \
    deploy/server/deploy.sh \
    deploy/server/nginx.conf \
    deploy/server/PRODUCTION_DEPLOY.md; do
    [[ -f "${REPOSITORY_ROOT}/${required_file}" ]] || die "required release file is missing: ${required_file}"
  done
}

write_release_metadata() {
  local bundle_dir="$1"
  local git_commit="$2"
  local app_image="$3"
  cat >"${bundle_dir}/release.env" <<EOF
JD_IMAGE_RELEASE_VERSION=${release_version}
JD_IMAGE_GIT_COMMIT=${git_commit}
JD_IMAGE_APP_IMAGE=${app_image}
JD_IMAGE_POSTGRES_IMAGE=${POSTGRES_BUNDLED_IMAGE}
JD_IMAGE_NGINX_IMAGE=${NGINX_BUNDLED_IMAGE}
EOF
  cat >"${bundle_dir}/manifest.txt" <<EOF
product=jd-image-web-ui
release_version=${release_version}
git_commit=${git_commit}
target_platform=${TARGET_PLATFORM}
application_image=${app_image}
application_base_image=${PYTHON_BASE_IMAGE}
postgres_image=${POSTGRES_BUNDLED_IMAGE}
postgres_source_image=${POSTGRES_SOURCE_IMAGE}
nginx_image=${NGINX_BUNDLED_IMAGE}
nginx_source_image=${NGINX_SOURCE_IMAGE}
base_images_included=true
created_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF
}

build_bundle() {
  local git_commit app_image bundle_name bundle_dir archive_path
  git_commit="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
  app_image="jd-image-web-ui:${release_version}"
  bundle_name="jd-image-web-ui-${release_version}-linux-amd64"

  mkdir -p -- "${output_dir}"
  output_dir="$(cd -- "${output_dir}" && pwd)"
  archive_path="${output_dir}/${bundle_name}.tar.gz"
  [[ ! -e "${archive_path}" ]] || die "release archive already exists: ${archive_path}"

  temporary_root="$(mktemp -d "${output_dir}/.build-release.XXXXXX")"
  bundle_dir="${temporary_root}/${bundle_name}"
  mkdir -p -- "${bundle_dir}"

  printf 'Building %s for %s...\n' "${app_image}" "${TARGET_PLATFORM}"
  docker buildx build \
    --platform "${TARGET_PLATFORM}" \
    --file "${REPOSITORY_ROOT}/Dockerfile.server" \
    --tag "${app_image}" \
    --build-arg "PYTHON_BASE_IMAGE=${PYTHON_BASE_IMAGE}" \
    --label "org.opencontainers.image.version=${release_version}" \
    --label "org.opencontainers.image.revision=${git_commit}" \
    --load \
    "${REPOSITORY_ROOT}"
  local image_platform
  image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${app_image}")"
  [[ "${image_platform}" == "${TARGET_PLATFORM}" ]] \
    || die "built application image platform is ${image_platform}, expected ${TARGET_PLATFORM}"
  docker save --output "${bundle_dir}/app-image.tar" "${app_image}"

  printf 'Collecting pinned PostgreSQL and Nginx images for offline loading...\n'
  docker pull --platform "${TARGET_PLATFORM}" "${POSTGRES_SOURCE_IMAGE}"
  docker pull --platform "${TARGET_PLATFORM}" "${NGINX_SOURCE_IMAGE}"
  local base_image base_platform
  for base_image in "${POSTGRES_SOURCE_IMAGE}" "${NGINX_SOURCE_IMAGE}"; do
    base_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${base_image}")"
    [[ "${base_platform}" == "${TARGET_PLATFORM}" ]] \
      || die "base image ${base_image} platform is ${base_platform}, expected ${TARGET_PLATFORM}"
  done
  docker tag "${POSTGRES_SOURCE_IMAGE}" "${POSTGRES_BUNDLED_IMAGE}"
  docker tag "${NGINX_SOURCE_IMAGE}" "${NGINX_BUNDLED_IMAGE}"
  docker save \
    --output "${bundle_dir}/base-images.tar" \
    "${POSTGRES_BUNDLED_IMAGE}" \
    "${NGINX_BUNDLED_IMAGE}"

  install -m 0755 "${REPOSITORY_ROOT}/deploy/server/deploy.sh" "${bundle_dir}/deploy.sh"
  install -m 0644 "${REPOSITORY_ROOT}/deploy/server/compose.production.yml" "${bundle_dir}/compose.production.yml"
  install -m 0644 "${REPOSITORY_ROOT}/deploy/server/nginx.conf" "${bundle_dir}/nginx.conf"
  install -m 0644 "${REPOSITORY_ROOT}/deploy/server/PRODUCTION_DEPLOY.md" "${bundle_dir}/README.md"
  write_release_metadata "${bundle_dir}" "${git_commit}" "${app_image}"

  tar -C "${temporary_root}" -czf "${temporary_root}/${bundle_name}.tar.gz" "${bundle_name}"
  mv -- "${temporary_root}/${bundle_name}.tar.gz" "${archive_path}"
  printf 'Release bundle created: %s\n' "${archive_path}"
}

main() {
  trap cleanup EXIT
  parse_arguments "$@"
  validate_inputs
  build_bundle
}

main "$@"
