#!/usr/bin/env bash
# Installed outside the checkout: switching Git revisions must not replace a
# script while bash is still reading it. Invoke with one full, CI-verified SHA.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
project=/home/ipmax/interview-prep-max
backup_root=/home/ipmax/backups
target=${1:-}
[[ $# == 1 && $target =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected one full commit SHA' >&2; exit 2; }
mkdir -p "$backup_root"
exec 9>"$backup_root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 3; }
cd "$project"
[[ -z $(git status --porcelain) ]] || { echo 'Checkout contains local changes' >&2; exit 4; }
git fetch origin main
[[ $(git rev-parse origin/main) == "$target" ]] || { echo 'Target is not current main' >&2; exit 5; }
previous=$(git rev-parse HEAD)
git merge-base --is-ancestor "$previous" "$target" || { echo 'Target does not descend from deployed commit' >&2; exit 6; }
app_image=$(docker inspect --format '{{.Image}}' interview-prep-max-app-1)
runner_image=$(docker inspect --format '{{.Image}}' interview-prep-max-polygon-runner-1)
task_image=$(docker image inspect --format '{{.Id}}' ipmax-polygon-linux-permissions:v1 2>/dev/null || true)
lab_image=$(docker inspect --format '{{.Image}}' interview-prep-max-polygon-lab-1 2>/dev/null || true)
backup="$backup_root/release-$(date -u +%Y%m%dT%H%M%SZ)-${target:0:12}"
mkdir "$backup"
docker cp interview-prep-max-app-1:/data/. "$backup/data"
cp .env "$backup/app.env"
printf '%s\n' "$previous" > "$backup/previous-commit"
printf '%s\n' "$app_image" > "$backup/previous-app-image"
docker tag "$app_image" "interview-prep-max-app:rollback-${previous:0:12}"
docker tag "$runner_image" "interview-prep-max-polygon-runner:rollback-${previous:0:12}"
if [[ -n $lab_image ]]; then docker tag "$lab_image" "ipmax-polygon-linux-permissions:rollback-${previous:0:12}"; fi
if [[ -f "$backup/data/snapshot.json" ]]; then
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$backup/data/snapshot.json"
fi
switched=0
services=(app)
rollback() {
  result=$?
  trap - ERR HUP INT TERM
  set +e
  echo 'Deployment failed; restoring previous code and images' >&2
  if (( switched )); then
    docker logs --tail 30 interview-prep-max-polygon-runner-1 >&2 || true
    docker inspect --format '{{range .State.Health.Log}}{{.Output}}{{end}}' interview-prep-max-polygon-runner-1 >&2 || true
    docker logs --tail 15 interview-prep-max-polygon-lab-1 >&2 || true
  fi
  docker tag "$app_image" interview-prep-max-app:latest
  docker tag "$runner_image" interview-prep-max-polygon-runner:latest
  if [[ -n $task_image ]]; then docker tag "$task_image" ipmax-polygon-linux-permissions:v1; fi
  if [[ -n $lab_image ]]; then docker tag "$lab_image" ipmax-polygon-linux-permissions:v2; fi
  git checkout --detach "$previous"
  if (( switched )); then
    if grep -q '^  polygon-lab:' docker-compose.yml; then services=(app polygon-lab polygon-runner caddy)
    else services=(app polygon-runner caddy); fi
    # Keep the live data volume: never overwrite progress saved during a deploy.
    docker compose up -d --no-build --force-recreate --wait --wait-timeout 90 "${services[@]}"
    rollback_result=$?
    if ! grep -q '^  polygon-lab:' docker-compose.yml; then
      docker rm -f interview-prep-max-polygon-lab-1 >/dev/null 2>&1 || true
    fi
    if (( rollback_result )); then echo "CRITICAL: rollback health check failed; backup: $backup" >&2; fi
  fi
  exit "${result:-1}"
}
trap rollback ERR
trap 'false' HUP INT TERM
changes=$(git diff --name-only "$previous" "$target")
git checkout --detach "$target"
version=$(tr -d '\r' < version.js | sed -n "s/^self.IPMAX_VERSION = '\([0-9][0-9.]*\)';$/\1/p")
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
# Build while the previous container keeps serving traffic. The legacy builder
# is used for this VPS's documented network restriction until BuildKit is fixed.
DOCKER_BUILDKIT=0 docker build --network=host -t "interview-prep-max-app:$target" -t interview-prep-max-app:latest .
if grep -Eq '^polygon-runner/|^package-lock.json$' <<< "$changes"; then
  DOCKER_BUILDKIT=0 docker build --network=host -f polygon-runner/Dockerfile -t "interview-prep-max-polygon-runner:$target" -t interview-prep-max-polygon-runner:latest .
  # The deploy checkout uses umask 077. Verify copied files are readable by
  # the image's unprivileged USER before replacing the live runner.
  docker run --rm --network none --read-only --entrypoint node "interview-prep-max-polygon-runner:$target" \
    -e "const fs=require('node:fs'); for(const name of ['server.js','service.js','lab-adapter.js','gateway.js']) fs.accessSync('/runner/'+name,fs.constants.R_OK); require('/runner/node_modules/ws');"
  services+=(polygon-runner)
fi
if grep -q '^polygon-runner/task-linux-permissions/' <<< "$changes"; then
  DOCKER_BUILDKIT=0 docker build --network=host -t ipmax-polygon-linux-permissions:v2 polygon-runner/task-linux-permissions
  services+=(polygon-lab)
fi
if grep -Eq '^Caddyfile$|^docker-compose.*yml$' <<< "$changes"; then
  services=(app polygon-lab polygon-runner caddy)
fi
switched=1
docker compose up -d --no-build --force-recreate --wait --wait-timeout 90 "${services[@]}"
# Inspect public HTTP endpoints, not just the Docker process health check.
node_check='const v=process.argv[1]; const base="https://prepmax.duckdns.org/";
(async()=>{for(const p of ["version.js","data-loader.js","api/sync/status","api/polygon/tasks"]){
const r=await fetch(base+p,{signal:AbortSignal.timeout(15000),headers:{"Cache-Control":"no-cache"}});
if(!r.ok)throw Error(p+": "+r.status);const t=await r.text();
if(p==="version.js"&&!t.includes("\x27"+v+"\x27"))throw Error("Public version mismatch");
if(p==="api/sync/status"&&!JSON.parse(t).enabled)throw Error("Sync disabled");
if(p==="api/polygon/tasks"&&!JSON.parse(t).tasks.length)throw Error("Polygon unavailable");
}console.log("Public smoke passed: "+v)})().catch(e=>{console.error(e.message);process.exit(1)});'
passed=0
for attempt in 1 2 3; do
  if docker exec interview-prep-max-app-1 node -e "$node_check" "$version"; then passed=1; break; fi
  sleep 2
done
[[ $passed == 1 ]]
# Install the next deploy script atomically only after successful validation.
install -m 700 scripts/deploy-production.sh /home/ipmax/bin/deploy-production.sh.next
mv /home/ipmax/bin/deploy-production.sh.next /home/ipmax/bin/deploy-production.sh
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$target" "$version" > "$backup_root/last-deployment"
trap - ERR HUP INT TERM
echo "Deployed $version ($target); backup: $backup"
