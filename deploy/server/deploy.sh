#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFAULT_DEPLOY_ROOT="/srv/jd-image-web-ui"
readonly COMPOSE_PROJECT_NAME="jd-image-web-ui"
readonly READY_TIMEOUT_SECONDS=120

action=""
deploy_root="${DEFAULT_DEPLOY_ROOT}"
admin_username=""
http_port="8787"
http_port_explicit="false"
release_version=""
git_commit=""
app_image=""
postgres_image=""
nginx_image=""
package_sha256=""
requirements_sha256=""
current_release_dir=""
temporary_env=""
temporary_release=""

usage() {
  cat <<'EOF'
Usage:
  sudo ./deploy.sh install [--root DIR] [--admin-username USER] [--http-port PORT]
  sudo ./deploy.sh upgrade [--root DIR]
  sudo ./deploy.sh update [--root DIR]

Commands:
  install  Create a new deployment, generate secrets and bootstrap the first admin.
  upgrade  Reuse the existing secrets and host data with the bundled application image.
  update   Reuse all installed images and update only the Web and Worker program package.

Options:
  --root DIR             Host persistence root. Defaults to /srv/jd-image-web-ui.
  --admin-username USER  Initial administrator. Prompted when omitted during install.
  --http-port PORT       Host HTTP port bound on 0.0.0.0. Defaults to 8787.
  -h, --help             Show this help.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '[jd-image] %s\n' "$*"
}

cleanup() {
  if [[ -n "${temporary_env}" && -f "${temporary_env}" ]]; then
    rm -f -- "${temporary_env}"
  fi
  if [[ -n "${temporary_release}" && -d "${temporary_release}" ]]; then
    rm -rf -- "${temporary_release}"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

parse_arguments() {
  (($# >= 1)) || {
    usage >&2
    exit 2
  }
  case "$1" in
    install|upgrade|update)
      action="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "first argument must be install, upgrade or update"
      ;;
  esac

  while (($#)); do
    case "$1" in
      --root)
        (($# >= 2)) || die "--root requires a value"
        deploy_root="$2"
        shift 2
        ;;
      --admin-username)
        (($# >= 2)) || die "--admin-username requires a value"
        admin_username="$2"
        shift 2
        ;;
      --http-port)
        (($# >= 2)) || die "--http-port requires a value"
        http_port="$2"
        http_port_explicit="true"
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

validate_host() {
  [[ "${EUID}" -eq 0 ]] || die "run this script as root or with sudo"
  [[ "$(uname -s)" == "Linux" ]] || die "production deployment requires Linux"
  [[ "$(uname -m)" == "x86_64" ]] || die "this release supports only linux/amd64"
  [[ -r /etc/os-release ]] || die "/etc/os-release is missing"

  local os_id os_version os_major compose_version
  os_id="$(sed -n 's/^ID=//p' /etc/os-release | head -n 1 | tr -d '"')"
  os_version="$(sed -n 's/^VERSION_ID=//p' /etc/os-release | head -n 1 | tr -d '"')"
  os_major="${os_version%%.*}"
  [[ "${os_id}" == "ubuntu" ]] || die "supported host operating system is Ubuntu 20.04 or newer"
  [[ "${os_major}" =~ ^[0-9]+$ && "${os_major}" -ge 20 ]] \
    || die "supported host operating system is Ubuntu 20.04 or newer"

  require_command docker
  require_command awk
  require_command cmp
  require_command find
  require_command grep
  require_command install
  require_command sed
  require_command tar
  if [[ "${action}" == "install" ]]; then
    require_command openssl
  fi
  if [[ "${action}" == "update" ]]; then
    require_command sha256sum
  fi
  docker info >/dev/null 2>&1 || die "Docker daemon is unavailable"
  compose_version="$(docker compose version --short 2>/dev/null || true)"
  [[ "${compose_version}" =~ ^v?2\. ]] || die "Docker Compose v2 is required"
}

validate_arguments() {
  [[ "${deploy_root}" =~ ^/[A-Za-z0-9._/-]+$ ]] \
    || die "--root must be an absolute path without spaces or special characters"
  [[ "${deploy_root}" != "/" && "${deploy_root}" != "/srv" ]] \
    || die "--root must identify a dedicated application directory"
  [[ "${http_port}" =~ ^[0-9]+$ ]] || die "--http-port must be an integer"
  ((http_port >= 1 && http_port <= 65535)) || die "--http-port must be between 1 and 65535"
  if [[ "${action}" != "install" && -n "${admin_username}" ]]; then
    die "--admin-username is valid only for install"
  fi
  if [[ "${action}" != "install" && "${http_port_explicit}" == "true" ]]; then
    die "--http-port is valid only for install; upgrades and updates preserve the installed port"
  fi
}

read_release_metadata() {
  local metadata_file="${SCRIPT_DIR}/release.env"
  [[ -f "${metadata_file}" ]] || die "release metadata is missing: ${metadata_file}"

  local key value
  while IFS='=' read -r key value; do
    case "${key}" in
      JD_IMAGE_RELEASE_VERSION) release_version="${value}" ;;
      JD_IMAGE_GIT_COMMIT) git_commit="${value}" ;;
      JD_IMAGE_APP_IMAGE) app_image="${value}" ;;
      JD_IMAGE_POSTGRES_IMAGE) postgres_image="${value}" ;;
      JD_IMAGE_NGINX_IMAGE) nginx_image="${value}" ;;
      "") ;;
      *) die "unexpected key in release metadata: ${key}" ;;
    esac
  done <"${metadata_file}"

  [[ "${release_version}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid release version"
  [[ "${git_commit}" =~ ^[0-9a-f]{40}$ ]] || die "invalid Git commit in release metadata"
  [[ "${app_image}" == "jd-image-web-ui:${release_version}" ]] || die "invalid application image tag"
  [[ "${postgres_image}" =~ ^jd-image-web-ui/postgres:[A-Za-z0-9._-]+$ ]] \
    || die "invalid bundled PostgreSQL image tag"
  [[ "${nginx_image}" =~ ^jd-image-web-ui/nginx:[A-Za-z0-9._-]+$ ]] \
    || die "invalid bundled Nginx image tag"

  for required_file in app-image.tar base-images.tar compose.production.yml nginx.conf manifest.txt; do
    [[ -f "${SCRIPT_DIR}/${required_file}" ]] || die "release file is missing: ${required_file}"
  done
}

validate_application_archive() {
  local archive="${SCRIPT_DIR}/app-package.tar.gz"
  local entry line entry_count=0
  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    ((entry_count += 1))
    [[ "${entry}" == "codex_image" || "${entry}" == "codex_image/" || "${entry}" == codex_image/* ]] \
      || die "program package contains an unexpected path: ${entry}"
    [[ "${entry}" != /* \
      && "${entry}" != *"/../"* \
      && "${entry}" != "../"* \
      && "${entry}" != */.. ]] \
      || die "program package contains an unsafe path: ${entry}"
  done < <(tar -tzf "${archive}")
  ((entry_count > 0)) || die "program package is empty"

  while IFS= read -r line; do
    case "${line:0:1}" in
      -|d) ;;
      *) die "program package may contain only regular files and directories" ;;
    esac
  done < <(tar -tvzf "${archive}")
}

read_update_metadata() {
  local metadata_file="${SCRIPT_DIR}/update.env"
  [[ -f "${metadata_file}" ]] || die "update metadata is missing: ${metadata_file}"

  local key value
  while IFS='=' read -r key value; do
    case "${key}" in
      JD_IMAGE_RELEASE_VERSION) release_version="${value}" ;;
      JD_IMAGE_GIT_COMMIT) git_commit="${value}" ;;
      JD_IMAGE_PACKAGE_SHA256) package_sha256="${value}" ;;
      JD_IMAGE_REQUIREMENTS_SHA256) requirements_sha256="${value}" ;;
      "") ;;
      *) die "unexpected key in update metadata: ${key}" ;;
    esac
  done <"${metadata_file}"

  [[ "${release_version}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "invalid update version"
  [[ "${git_commit}" =~ ^[0-9a-f]{40}$ ]] || die "invalid Git commit in update metadata"
  [[ "${package_sha256}" =~ ^[0-9a-f]{64}$ ]] || die "invalid program package checksum"
  [[ "${requirements_sha256}" =~ ^[0-9a-f]{64}$ ]] || die "invalid dependency checksum"

  for required_file in \
    app-package.tar.gz \
    compose.update.yml \
    manifest.txt \
    README.md \
    requirements-server.txt; do
    [[ -f "${SCRIPT_DIR}/${required_file}" ]] || die "update file is missing: ${required_file}"
  done

  local actual_package_sha256 actual_requirements_sha256
  actual_package_sha256="$(sha256sum "${SCRIPT_DIR}/app-package.tar.gz" | awk '{print $1}')"
  [[ "${actual_package_sha256}" == "${package_sha256}" ]] \
    || die "program package checksum does not match update metadata"
  actual_requirements_sha256="$(sha256sum "${SCRIPT_DIR}/requirements-server.txt" | awk '{print $1}')"
  [[ "${actual_requirements_sha256}" == "${requirements_sha256}" ]] \
    || die "dependency checksum does not match update metadata"
  grep -qx 'release_kind=program-update' "${SCRIPT_DIR}/manifest.txt" \
    || die "manifest does not describe a program update"
  grep -qx 'images_included=false' "${SCRIPT_DIR}/manifest.txt" \
    || die "program update manifest must not include images"
  validate_application_archive
}

read_active_release_metadata() {
  local current_target current_env key value
  current_target="$(readlink "${deploy_root}/current")"
  [[ "${current_target}" =~ ^releases/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || die "current release link has an invalid target: ${current_target}"
  current_release_dir="${deploy_root}/${current_target}"
  current_env="${current_release_dir}/release.env"
  [[ -f "${current_env}" ]] || die "current release metadata is missing: ${current_env}"
  [[ -f "${current_release_dir}/compose.production.yml" ]] \
    || die "current production Compose file is missing"
  [[ -f "${current_release_dir}/nginx.conf" ]] || die "current Nginx configuration is missing"

  app_image=""
  postgres_image=""
  nginx_image=""
  while IFS='=' read -r key value; do
    case "${key}" in
      JD_IMAGE_APP_IMAGE) app_image="${value}" ;;
      JD_IMAGE_POSTGRES_IMAGE) postgres_image="${value}" ;;
      JD_IMAGE_NGINX_IMAGE) nginx_image="${value}" ;;
      JD_IMAGE_RELEASE_VERSION|JD_IMAGE_GIT_COMMIT|JD_IMAGE_APP_PACKAGE_DIR|"") ;;
      *) die "unexpected key in current release metadata: ${key}" ;;
    esac
  done <"${current_env}"

  [[ "${app_image}" =~ ^jd-image-web-ui:[A-Za-z0-9._-]+$ ]] \
    || die "current application image tag is invalid"
  [[ "${postgres_image}" =~ ^jd-image-web-ui/postgres:[A-Za-z0-9._-]+$ ]] \
    || die "current PostgreSQL image tag is invalid"
  [[ "${nginx_image}" =~ ^jd-image-web-ui/nginx:[A-Za-z0-9._-]+$ ]] \
    || die "current Nginx image tag is invalid"
}

validate_runtime_dependencies() {
  local image_platform runtime_requirements_sha256
  image_platform="$(
    docker image inspect --format '{{.Os}}/{{.Architecture}}' "${app_image}" 2>/dev/null
  )" || die "installed application image is missing: ${app_image}"
  [[ "${image_platform}" == "linux/amd64" ]] \
    || die "installed application image platform is ${image_platform}, expected linux/amd64"

  runtime_requirements_sha256="$(
    docker run --pull never --rm --entrypoint python "${app_image}" -c \
      "from hashlib import sha256; from pathlib import Path; print(sha256(Path('/app/requirements-server.txt').read_bytes()).hexdigest())" \
      2>/dev/null
  )" || die "could not read dependency declaration from installed application image"
  [[ "${runtime_requirements_sha256}" == "${requirements_sha256}" ]] || die \
    "server dependencies changed; build a full release and use the upgrade command"
}

directory_has_entries() {
  [[ -d "$1" ]] && [[ -n "$(find "$1" -mindepth 1 -print -quit 2>/dev/null)" ]]
}

create_initial_configuration() {
  local config_dir="${deploy_root}/config"
  local config_env="${config_dir}/.env"
  local postgres_dir="${deploy_root}/postgres"
  local data_dir="${deploy_root}/data"
  local backup_dir="${deploy_root}/backups"

  if [[ -f "${config_env}" ]]; then
    log "Reusing existing configuration from an incomplete installation."
    return
  fi
  for path in "${postgres_dir}" "${data_dir}"; do
    if directory_has_entries "${path}"; then
      die "refusing to initialize over non-empty data directory without configuration: ${path}"
    fi
  done

  install -d -m 0700 -o root -g root "${config_dir}"
  temporary_env="$(mktemp "${config_dir}/.env.tmp.XXXXXX")"
  chmod 0600 "${temporary_env}"
  local postgres_password master_key
  postgres_password="$(openssl rand -hex 32)"
  master_key="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
  cat >"${temporary_env}" <<EOF
JD_IMAGE_POSTGRES_DB=jd_image
JD_IMAGE_POSTGRES_USER=jd_image
JD_IMAGE_POSTGRES_PASSWORD=${postgres_password}
JD_IMAGE_MASTER_KEY=${master_key}
JD_IMAGE_POSTGRES_DIR=${postgres_dir}
JD_IMAGE_DATA_DIR=${data_dir}
JD_IMAGE_BACKUP_DIR=${backup_dir}
JD_IMAGE_HTTP_BIND=0.0.0.0
JD_IMAGE_HTTP_PORT=${http_port}
EOF
  mv -- "${temporary_env}" "${config_env}"
  temporary_env=""
  chmod 0600 "${config_env}"
}

validate_existing_configuration() {
  local config_env="${deploy_root}/config/.env"
  [[ -f "${config_env}" ]] || die "existing deployment configuration is missing: ${config_env}"
  [[ -f "${deploy_root}/config/.installed" ]] \
    || die "deployment is not marked installed; resume with the install command"
  [[ -L "${deploy_root}/current" ]] || die "current release link is missing"
}

load_application_image() {
  log "Loading application image ${app_image}..."
  docker load --input "${SCRIPT_DIR}/app-image.tar" >/dev/null
  docker image inspect "${app_image}" >/dev/null 2>&1 \
    || die "application image was not loaded with the expected tag: ${app_image}"
  local image_platform
  image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${app_image}")"
  [[ "${image_platform}" == "linux/amd64" ]] \
    || die "application image platform is ${image_platform}, expected linux/amd64"
}

load_base_images() {
  log "Loading bundled PostgreSQL and Nginx images..."
  docker load --input "${SCRIPT_DIR}/base-images.tar" >/dev/null
  local base_image base_platform
  for base_image in "${postgres_image}" "${nginx_image}"; do
    docker image inspect "${base_image}" >/dev/null 2>&1 \
      || die "bundled base image is missing after load: ${base_image}"
    base_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "${base_image}")"
    [[ "${base_platform}" == "linux/amd64" ]] \
      || die "base image platform is ${base_platform}, expected linux/amd64: ${base_image}"
  done
}

prepare_host_directories() {
  local postgres_uid postgres_gid app_uid app_gid
  postgres_uid="$(docker run --rm --entrypoint sh "${postgres_image}" -c 'id -u postgres')"
  postgres_gid="$(docker run --rm --entrypoint sh "${postgres_image}" -c 'id -g postgres')"
  app_uid="$(docker run --rm --entrypoint id "${app_image}" -u)"
  app_gid="$(docker run --rm --entrypoint id "${app_image}" -g)"
  [[ "${postgres_uid}" =~ ^[0-9]+$ && "${postgres_gid}" =~ ^[0-9]+$ ]] \
    || die "could not determine PostgreSQL container ownership"
  [[ "${app_uid}" =~ ^[0-9]+$ && "${app_gid}" =~ ^[0-9]+$ ]] \
    || die "could not determine application container ownership"

  install -d -m 0755 -o root -g root "${deploy_root}"
  install -d -m 0700 -o root -g root "${deploy_root}/config"
  install -d -m 0755 -o root -g root "${deploy_root}/releases"
  install -d -m 0700 -o "${postgres_uid}" -g "${postgres_gid}" "${deploy_root}/postgres"
  install -d -m 0750 -o "${app_uid}" -g "${app_gid}" "${deploy_root}/data"
  install -d -m 0700 -o "${app_uid}" -g "${app_gid}" "${deploy_root}/backups"
}

stage_release() {
  local releases_dir="${deploy_root}/releases"
  local target_dir="${releases_dir}/${release_version}"
  if [[ -d "${target_dir}" ]]; then
    for filename in compose.production.yml nginx.conf release.env manifest.txt deploy.sh README.md; do
      [[ -f "${target_dir}/${filename}" ]] || die "existing release directory is incomplete: ${target_dir}"
      cmp -s "${SCRIPT_DIR}/${filename}" "${target_dir}/${filename}" \
        || die "release ${release_version} already exists with different contents"
    done
    return
  fi

  temporary_release="$(mktemp -d "${releases_dir}/.${release_version}.XXXXXX")"
  install -m 0644 "${SCRIPT_DIR}/compose.production.yml" "${temporary_release}/compose.production.yml"
  install -m 0644 "${SCRIPT_DIR}/nginx.conf" "${temporary_release}/nginx.conf"
  install -m 0644 "${SCRIPT_DIR}/release.env" "${temporary_release}/release.env"
  install -m 0644 "${SCRIPT_DIR}/manifest.txt" "${temporary_release}/manifest.txt"
  install -m 0755 "${SCRIPT_DIR}/deploy.sh" "${temporary_release}/deploy.sh"
  install -m 0644 "${SCRIPT_DIR}/README.md" "${temporary_release}/README.md"
  mv -- "${temporary_release}" "${target_dir}"
  temporary_release=""
}

stage_update_release() {
  local releases_dir="${deploy_root}/releases"
  local target_dir="${releases_dir}/${release_version}"
  if [[ -d "${target_dir}" ]]; then
    for filename in \
      app-package.tar.gz \
      compose.update.yml \
      deploy.sh \
      manifest.txt \
      README.md \
      requirements-server.txt \
      update.env; do
      [[ -f "${target_dir}/${filename}" ]] \
        || die "existing update directory is incomplete: ${target_dir}"
      cmp -s "${SCRIPT_DIR}/${filename}" "${target_dir}/${filename}" \
        || die "update ${release_version} already exists with different contents"
    done
    [[ -f "${target_dir}/application/codex_image/__init__.py" ]] \
      || die "existing update directory has no extracted application package"
    return
  fi

  temporary_release="$(mktemp -d "${releases_dir}/.${release_version}.XXXXXX")"
  install -m 0644 \
    "${current_release_dir}/compose.production.yml" \
    "${temporary_release}/compose.production.yml"
  install -m 0644 "${current_release_dir}/nginx.conf" "${temporary_release}/nginx.conf"
  install -m 0644 "${SCRIPT_DIR}/app-package.tar.gz" "${temporary_release}/app-package.tar.gz"
  install -m 0644 "${SCRIPT_DIR}/compose.update.yml" "${temporary_release}/compose.update.yml"
  install -m 0755 "${SCRIPT_DIR}/deploy.sh" "${temporary_release}/deploy.sh"
  install -m 0644 "${SCRIPT_DIR}/manifest.txt" "${temporary_release}/manifest.txt"
  install -m 0644 "${SCRIPT_DIR}/README.md" "${temporary_release}/README.md"
  install -m 0644 \
    "${SCRIPT_DIR}/requirements-server.txt" \
    "${temporary_release}/requirements-server.txt"
  install -m 0644 "${SCRIPT_DIR}/update.env" "${temporary_release}/update.env"

  install -d -m 0755 "${temporary_release}/application"
  tar --no-same-owner \
    -xzf "${temporary_release}/app-package.tar.gz" \
    -C "${temporary_release}/application"
  [[ -f "${temporary_release}/application/codex_image/__init__.py" ]] \
    || die "program package does not contain codex_image/__init__.py"
  find "${temporary_release}/application" -type d -exec chmod 0755 {} +
  find "${temporary_release}/application" -type f -exec chmod 0644 {} +

  cat >"${temporary_release}/release.env" <<EOF
JD_IMAGE_RELEASE_VERSION=${release_version}
JD_IMAGE_GIT_COMMIT=${git_commit}
JD_IMAGE_APP_IMAGE=${app_image}
JD_IMAGE_POSTGRES_IMAGE=${postgres_image}
JD_IMAGE_NGINX_IMAGE=${nginx_image}
JD_IMAGE_APP_PACKAGE_DIR=${target_dir}/application/codex_image
EOF
  chmod 0644 "${temporary_release}/release.env"

  mv -- "${temporary_release}" "${target_dir}"
  temporary_release=""
}

compose_release() {
  local release_dir="$1"
  shift
  local -a compose_command=(
    docker compose
    --project-name "${COMPOSE_PROJECT_NAME}"
    --env-file "${deploy_root}/config/.env"
    --env-file "${release_dir}/release.env"
    --file "${release_dir}/compose.production.yml"
  )
  if [[ -f "${release_dir}/compose.update.yml" ]]; then
    compose_command+=(--file "${release_dir}/compose.update.yml")
  fi
  compose_command+=("$@")
  "${compose_command[@]}"
}

compose() {
  compose_release "${deploy_root}/releases/${release_version}" "$@"
}

start_release() {
  log "Starting release ${release_version}..."
  compose up --detach --no-build --pull never --remove-orphans
}

start_application_release() {
  local release_dir="$1"
  log "Starting program release $(basename "${release_dir}")..."
  compose_release "${release_dir}" \
    up --detach --no-deps --force-recreate --no-build --pull never web worker
}

read_worker_instance_id() {
  local release_dir="$1"
  local instance_id
  instance_id="$(
    compose_release "${release_dir}" exec -T web python -c \
      "import json, urllib.request; payload = json.load(urllib.request.urlopen('http://127.0.0.1:8787/health/ready', timeout=3)); print(payload['components']['worker'].get('instance_id', ''))" \
      2>/dev/null
  )" || return 1
  [[ -n "${instance_id}" ]] || return 1
  printf '%s\n' "${instance_id}"
}

release_is_ready() {
  local release_dir="$1"
  local replaced_worker_instance_id="${2:-}"
  local deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  log "Waiting for the deployment readiness check..."
  while ((SECONDS < deadline)); do
    if compose_release "${release_dir}" exec -T web python -c \
      "import json, sys, urllib.request; payload = json.load(urllib.request.urlopen('http://127.0.0.1:8787/health/ready', timeout=3)); instance_id = payload['components']['worker'].get('instance_id', ''); raise SystemExit(0 if instance_id and instance_id != sys.argv[1] else 1)" \
      "${replaced_worker_instance_id}" \
      >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  compose_release "${release_dir}" ps >&2 || true
  compose_release "${release_dir}" logs --tail=100 postgres web worker proxy >&2 || true
  return 1
}

wait_until_ready() {
  local release_dir="${deploy_root}/releases/${release_version}"
  release_is_ready "${release_dir}" \
    || die "deployment did not become ready within ${READY_TIMEOUT_SECONDS} seconds"
}

prompt_for_admin_username() {
  if [[ -n "${admin_username}" ]]; then
    return
  fi
  [[ -t 0 ]] || die "--admin-username is required when install is not interactive"
  read -r -p "Initial administrator username: " admin_username
}

bootstrap_admin() {
  [[ "${admin_username}" =~ ^[A-Za-z0-9_.-]{2,64}$ ]] \
    || die "administrator username must be 2-64 letters, numbers, dot, underscore or hyphen"
  log "Creating the initial administrator. The temporary password is shown once."
  compose exec -T web python -m codex_image.server.ops bootstrap-admin --username "${admin_username}"
  : >"${deploy_root}/config/.installed"
  chmod 0600 "${deploy_root}/config/.installed"
}

activate_release() {
  ln -sfn "releases/${release_version}" "${deploy_root}/current"
}

run_install() {
  local marker="${deploy_root}/config/.installed"
  if [[ -f "${marker}" ]]; then
    if [[ -L "${deploy_root}/current" ]] \
      && [[ "$(readlink "${deploy_root}/current")" == "releases/${release_version}" ]]; then
      log "Release ${release_version} is already installed; verifying services."
      prepare_host_directories
      stage_release
      start_release
      wait_until_ready
      compose ps
      return
    fi
    die "a deployment is already installed; use the upgrade command"
  fi

  prompt_for_admin_username
  create_initial_configuration
  prepare_host_directories
  stage_release
  start_release
  wait_until_ready
  bootstrap_admin
  activate_release
  compose ps
  log "Installation complete. The proxy is listening on 0.0.0.0:${http_port}."
}

run_upgrade() {
  validate_existing_configuration
  local current_target
  current_target="$(readlink "${deploy_root}/current")"
  if [[ "${current_target}" == "releases/${release_version}" ]]; then
    log "Release ${release_version} is already active; verifying services."
  else
    log "Upgrading ${current_target#releases/} to ${release_version}."
  fi
  prepare_host_directories
  stage_release
  start_release
  wait_until_ready
  activate_release
  compose ps
  log "Upgrade complete. Persistent database and resource directories were preserved."
}

run_update() {
  read_update_metadata
  validate_existing_configuration
  read_active_release_metadata
  validate_runtime_dependencies

  local previous_release_dir="${current_release_dir}"
  local update_release_dir="${deploy_root}/releases/${release_version}"
  local previous_version previous_worker_instance_id
  previous_version="$(basename "${previous_release_dir}")"
  previous_worker_instance_id="$(read_worker_instance_id "${previous_release_dir}")" \
    || die "current Worker is not ready; repair the deployment before updating"
  if [[ "${previous_release_dir}" == "${update_release_dir}" ]]; then
    log "Program update ${release_version} is already active; verifying services."
  else
    log "Updating program package ${previous_version} to ${release_version}."
  fi

  stage_update_release
  if start_application_release "${update_release_dir}" \
    && release_is_ready "${update_release_dir}" "${previous_worker_instance_id}" \
    && activate_release; then
    compose_release "${update_release_dir}" ps
    log "Program update complete. Installed images, database and resource directories were preserved."
    return
  fi

  log "Program update ${release_version} failed."
  log "Restoring the previous application release ${previous_version}..."
  if start_application_release "${previous_release_dir}" \
    && release_is_ready "${previous_release_dir}"; then
    die "program update failed; the previous Web and Worker release was restored"
  fi
  die "program update failed and the previous Web and Worker release could not be restored"
}

main() {
  trap cleanup EXIT
  parse_arguments "$@"
  validate_arguments
  validate_host
  case "${action}" in
    install|upgrade)
      read_release_metadata
      load_application_image
      load_base_images
      if [[ "${action}" == "install" ]]; then
        run_install
      else
        run_upgrade
      fi
      ;;
    update) run_update ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
