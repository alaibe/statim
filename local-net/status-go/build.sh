#!/usr/bin/env bash
#
# Builds the status-go harness behind src/protocols/status/testing/*.json.
#
#   ./local-net/status-go/build.sh
#   ./local-net/.run/interop vectors > src/protocols/status/testing/status-go-vectors.json
#   ./local-net/.run/interop ratchet > src/protocols/status/testing/status-go-ratchet.json
#   ./local-net/.run/interop segments > src/protocols/status/testing/status-go-segments.json
#   ./local-net/.run/interop decode <recipient private key> <payload hex> '' <waku time in ms>
#   ./local-net/.run/interop reassemble <recipient private key> <waku time in ms> <payload hex>...
#
# Needs Go and protoc (brew install go protobuf).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../common.sh"

STATUS_GO=6fbaa6af0ee90100c93380f3b04fdd57433cd273
SRC="$RUN/status-go"

if [ ! -d "$SRC" ]; then
  git init -q "$SRC"
  git -C "$SRC" remote add origin https://github.com/status-im/status-go
fi
git -C "$SRC" fetch -q --depth 1 origin "$STATUS_GO"
git -C "$SRC" checkout -q FETCH_HEAD

cd "$SRC"
mkdir -p cmd/interop
cp "$HERE/main.go" cmd/interop/main.go

echo 0.0.0 > pkg/version/VERSION
echo interop > pkg/version/GIT_COMMIT
for file in SENTRY_CONTEXT_NAME SENTRY_CONTEXT_VERSION SENTRY_PRODUCTION; do
  echo interop > "pkg/sentry/$file"
done

(cd pkg/messaging/layers/encryption/migrations/sqlite && go generate .)
(cd pkg/messaging/layers/segmentation/migrations/sqlite && go generate .)
GEN=$(go tool -n protoc-gen-go)
(cd internal/protocol/protobuf &&
  protoc --plugin=protoc-gen-go="$GEN" --go_out=. $(grep -o '\./[a-z_]*\.proto' service.go))
(cd pkg/messaging/layers/encryption &&
  protoc --plugin=protoc-gen-go="$GEN" --go_out=. ./protocol_message.proto)
(cd pkg/messaging/layers/segmentation/protobuf &&
  protoc --plugin=protoc-gen-go="$GEN" --go_out=. ./segment_message.proto)

go build -o "$RUN/interop" ./cmd/interop
say "Built $RUN/interop"
