#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${REDIS_URL:?REDIS_URL is required}"

IMAGE_TAG="${IMAGE_TAG:-kokoro-system:release-smoke}"
CONTAINER_NAME="kokoro-system-release-smoke-${RANDOM}-${RANDOM}"
SERVICE_TOKEN="${KOKORO_SYSTEM_BFF_SERVICE_TOKEN:-release-smoke-token}"
HOST_PORT="${KOKORO_SYSTEM_SMOKE_HOST_PORT:-4240}"

container_dependency_url() {
  node --input-type=module -e '
    const url = new URL(process.argv[1]);
    if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      url.hostname = "host.docker.internal";
    process.stdout.write(url.toString());
  ' "$1"
}

CONTAINER_DATABASE_URL="$(container_dependency_url "${DATABASE_URL}")"
CONTAINER_REDIS_URL="$(container_dependency_url "${REDIS_URL}")"

cleanup() {
  docker rm --force "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "${SKIP_IMAGE_BUILD:-false}" != "true" ]]; then
  docker build --tag "${IMAGE_TAG}" .
fi
docker run --detach \
  --name "${CONTAINER_NAME}" \
  --add-host host.docker.internal:host-gateway \
  --publish "127.0.0.1:${HOST_PORT}:4240" \
  --env DATABASE_URL="${CONTAINER_DATABASE_URL}" \
  --env REDIS_URL="${CONTAINER_REDIS_URL}" \
  --env KOKORO_SYSTEM_HOST=0.0.0.0 \
  --env KOKORO_SYSTEM_PORT=4240 \
  --env KOKORO_SYSTEM_BFF_SERVICE_TOKEN="${SERVICE_TOKEN}" \
  "${IMAGE_TAG}" >/dev/null

for _attempt in $(seq 1 60); do
  state="$(docker inspect --format '{{.State.Status}}' "${CONTAINER_NAME}")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${CONTAINER_NAME}")"
  if [[ "${health}" == "healthy" ]]; then
    break
  fi
  if [[ "${state}" == "exited" || "${state}" == "dead" ]]; then
    docker logs "${CONTAINER_NAME}"
    exit 1
  fi
  sleep 1
done

if [[ "$(docker inspect --format '{{.State.Health.Status}}' "${CONTAINER_NAME}")" != "healthy" ]]; then
  docker logs "${CONTAINER_NAME}"
  exit 1
fi

KOKORO_SYSTEM_SMOKE_HOST_PORT="${HOST_PORT}" node --input-type=module <<'NODE'
const port = process.env.KOKORO_SYSTEM_SMOKE_HOST_PORT;
for (const [path, expected] of [["/healthz", "ok"], ["/readyz", "ready"]]) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const payload = await response.json();
  if (!response.ok || payload?.data?.status !== expected || typeof payload?.meta?.request_id !== "string") {
    throw new Error(`production image ${path} smoke failed`);
  }
}
NODE

printf '%s\n' '{"status":"PASS","image":"production","health":"ok","ready":"ready"}'
