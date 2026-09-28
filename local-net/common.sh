# Shared by setup.sh and start.sh. Not executable on its own.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.run"          # binaries, logs and pids; gitignored
NWAKU="$RUN/build/wakunode2"

# nwaku publishes macOS binaries only under the rolling `nightly` tag; the
# versioned releases carry source and Linux artefacts. Pin a downloaded copy if
# you need the same node twice.
NWAKU_URL="https://github.com/waku-org/nwaku/releases/download/nightly/nwaku-arm64-macos-nightly.tar.gz"

# The Status network's cluster, and the shard its DMs and groups use. Status
# shards statically, so the nodes are told the shard rather than deriving one.
CLUSTER=16
SHARD=32

LIBPQ=/opt/homebrew/opt/libpq/lib/libpq.dylib

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }

lan_ip() {
  ipconfig getifaddr "$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')" 2>/dev/null \
    || echo 127.0.0.1
}
