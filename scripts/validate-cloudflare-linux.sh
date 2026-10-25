#!/usr/bin/env bash
set -euo pipefail
export NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false

if [[ "$(uname -s)" != Linux ]]; then
  printf '%s\n' 'Cette validation nécessite Linux ou une distribution WSL.' >&2
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])!==24)throw Error("Node.js 24 requis")'
source_root="$(git rev-parse --show-toplevel)"
build_dir="$(mktemp -d -t chibasko-cloudflare-linux.XXXXXXXX)"
trap 'rm -rf -- "$build_dir"' EXIT

# Le checkout courant est copié sans dépendances Windows ni identifiants locaux.
cd "$source_root"
git ls-files --cached --others --exclude-standard -z |
  tar --null --verbatim-files-from --exclude='.env*' --exclude='*/.env*' \
    --exclude='.dev.vars*' --exclude='*/.dev.vars*' --exclude='node_modules/*' \
    --exclude='.next/*' --exclude='.open-next/*' --exclude='.distribution/*' \
    -T - -cf - | tar -xf - -C "$build_dir"
cd "$build_dir"
npm ci
node --input-type=module <<'NODE'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import ts from 'typescript'
const parsed=ts.parseConfigFileTextToJson('wrangler.jsonc',readFileSync('wrangler.jsonc','utf8'))
if(parsed.error)throw Error('Configuration Wrangler invalide')
const publicValues=Object.fromEntries(Object.entries(parsed.config.vars).filter(([name])=>name.startsWith('NEXT_PUBLIC_')))
for(const name of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SITE_URL'])if(!publicValues[name])throw Error('Configuration publique manquante : '+name)
const result=spawnSync('npm',['run','build:cloudflare'],{stdio:'inherit',env:{...process.env,...publicValues}})
if(result.error)throw result.error
process.exit(result.status??1)
NODE
printf '%s\n' 'Validation Linux terminée : build OpenNext, dry-run et démarrage local du Worker réussis.'
