#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly DEFAULT_OUTPUT_DIR="${REPOSITORY_ROOT}/dist"

release_version=""
output_dir="${DEFAULT_OUTPUT_DIR}"
temporary_root=""

usage() {
  cat <<'EOF'
Usage:
  scripts/build-update-package.sh --version VERSION [--output DIR]

Build a versioned production program update from the current Git commit.
The Git worktree must be clean and server dependency declarations must remain
compatible with the application image already installed in production.

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

create_portable_tar_gz() {
  local source_directory="$1"
  local archive_path="$2"
  local entry="$3"
  COPYFILE_DISABLE=1 tar --no-xattrs \
    -C "${source_directory}" \
    -czf "${archive_path}" \
    "${entry}"
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

  require_command git
  require_command install
  require_command mktemp
  require_command sha256sum
  require_command tar

  git -C "${REPOSITORY_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "repository metadata is unavailable"
  [[ -z "$(git -C "${REPOSITORY_ROOT}" status --porcelain)" ]] \
    || die "Git worktree is not clean; commit or stash all changes before building an update"

  for required_file in \
    codex_image/server/web.py \
    codex_image/webui/static/index.html \
    requirements-server.txt \
    deploy/server/compose.update.yml \
    deploy/server/deploy.sh \
    deploy/server/PRODUCTION_DEPLOY.md; do
    [[ -f "${REPOSITORY_ROOT}/${required_file}" ]] \
      || die "required update file is missing: ${required_file}"
  done

  local tracked_symlinks
  tracked_symlinks="$(
    git -C "${REPOSITORY_ROOT}" ls-files -s codex_image \
      | awk '$1 == "120000" { print $4 }'
  )"
  [[ -z "${tracked_symlinks}" ]] \
    || die "program updates do not support tracked symbolic links: ${tracked_symlinks}"
}

build_bundle() {
  local git_commit bundle_name bundle_dir archive_path package_root
  local package_sha256 requirements_sha256
  git_commit="$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)"
  bundle_name="jd-image-web-ui-${release_version}-program-update"

  mkdir -p -- "${output_dir}"
  output_dir="$(cd -- "${output_dir}" && pwd)"
  archive_path="${output_dir}/${bundle_name}.tar.gz"
  [[ ! -e "${archive_path}" ]] || die "update archive already exists: ${archive_path}"

  temporary_root="$(mktemp -d "${output_dir}/.build-update-package.XXXXXX")"
  bundle_dir="${temporary_root}/${bundle_name}"
  package_root="${temporary_root}/application"
  mkdir -p -- "${bundle_dir}" "${package_root}"

  git -C "${REPOSITORY_ROOT}" archive --format=tar HEAD codex_image \
    | tar -xf - -C "${package_root}"
  rm -f -- \
    "${package_root}/codex_image/__main__.py" \
    "${package_root}/codex_image/auth.py" \
    "${package_root}/codex_image/cli.py"

  create_portable_tar_gz \
    "${package_root}" \
    "${bundle_dir}/app-package.tar.gz" \
    codex_image
  package_sha256="$(sha256sum "${bundle_dir}/app-package.tar.gz" | awk '{print $1}')"
  requirements_sha256="$(sha256sum "${REPOSITORY_ROOT}/requirements-server.txt" | awk '{print $1}')"

  install -m 0755 "${REPOSITORY_ROOT}/deploy/server/deploy.sh" "${bundle_dir}/deploy.sh"
  install -m 0644 "${REPOSITORY_ROOT}/deploy/server/compose.update.yml" "${bundle_dir}/compose.update.yml"
  install -m 0644 "${REPOSITORY_ROOT}/deploy/server/PRODUCTION_DEPLOY.md" "${bundle_dir}/README.md"
  install -m 0644 "${REPOSITORY_ROOT}/requirements-server.txt" "${bundle_dir}/requirements-server.txt"

  cat >"${bundle_dir}/update.env" <<EOF
JD_IMAGE_RELEASE_VERSION=${release_version}
JD_IMAGE_GIT_COMMIT=${git_commit}
JD_IMAGE_PACKAGE_SHA256=${package_sha256}
JD_IMAGE_REQUIREMENTS_SHA256=${requirements_sha256}
EOF
  cat >"${bundle_dir}/manifest.txt" <<EOF
product=jd-image-web-ui
release_kind=program-update
release_version=${release_version}
git_commit=${git_commit}
package_format=source-overlay-v1
package_sha256=${package_sha256}
requirements_sha256=${requirements_sha256}
images_included=false
created_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
EOF

  create_portable_tar_gz \
    "${temporary_root}" \
    "${temporary_root}/${bundle_name}.tar.gz" \
    "${bundle_name}"
  mv -- "${temporary_root}/${bundle_name}.tar.gz" "${archive_path}"
  printf 'Program update created: %s\n' "${archive_path}"
}

main() {
  trap cleanup EXIT
  parse_arguments "$@"
  validate_inputs
  build_bundle
}

main "$@"
