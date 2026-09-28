# Nostr and Status, on this machine

```bash
./local-net/setup.sh          # once: install nak and libpq, download nwaku
./local-net/start.sh          # every time: start them
./local-net/start.sh status   # what is running, and the values to paste
./local-net/start.sh stop
```

`setup.sh` installs, `start.sh` runs. Both are safe to re-run, and `start.sh`
refuses with a pointer to `setup.sh` rather than failing halfway through if the
binaries are not there. The constants they share (where nwaku lives, which
cluster and shard it runs on) are in `common.sh`, so the two cannot drift apart.

Then open **Settings → Protocols** in the app and paste what `status` prints.

Native binaries, no containers: `nak` for Nostr, `nwaku` for Status, and nothing
at all for XMTP, whose public `dev` network is already separate from production.
Two simulators pointed there reach each other and nobody else.

## Why this exists

The app reaches Status through an nwaku node's REST API, and the Status fleet
speaks libp2p, so there is no public endpoint to point it at. You need a node
either way, and this one stays off the real network.

Nostr is testable in production, which is the problem: it means testing a
messenger by sending real messages to a real network.

## What the scripts know that is not obvious

Each of these cost an hour to find, and each one fails in a way that looks like
a bug in the app rather than in the setup.

- `libpq`. `wakunode2` links against it and exits with `could not load:
  libpq.dylib`, mentioning nothing about Postgres, which it does not otherwise
  need.
- Cluster 16, shard 32, named outright. That is where status-go puts every DM
  and group, and it shards statically: a node left to autosharding derives a
  shard from each content topic, and no Status client listens there.
- `--max-msg-size=1024KiB`. status-go sends up to 1 MiB, images inline, and
  nwaku drops anything over its 150 KiB default without saying so.
- Two nwaku nodes. A relay with no peers cannot publish. It answers
  `NoPeersToPublish` while subscribe succeeds, so the app appears to receive but
  never send. The second node exists purely to give the first a mesh.
- `--nat=none`, discovery off. Cluster 16 is the real Status network, so a node
  allowed to look for peers finds the fleet and starts relaying strangers'
  messages.

## Two clients, one machine

The point of a local network is talking to yourself from two installs. Boot two
simulators, run the app on both, give each its own account.

```bash
xcrun simctl list devices available | grep iPhone
xcrun simctl boot <first-udid> && xcrun simctl boot <second-udid>
```

## status-go, for the wire format

`src/protocols/status/testing/*.json` are messages status-go itself built and
signed. `status-go/build.sh` fetches status-go at the commit they came from,
drops `status-go/main.go` in as a command and builds it into `.run/interop`
(it needs Go and `protoc`):

```bash
./local-net/status-go/build.sh
./local-net/.run/interop vectors > src/protocols/status/testing/status-go-vectors.json
./local-net/.run/interop ratchet > src/protocols/status/testing/status-go-ratchet.json
./local-net/.run/interop segments > src/protocols/status/testing/status-go-segments.json
./local-net/.run/interop decode <recipient private key> <payload hex> '' <waku time in ms>
./local-net/.run/interop reassemble <recipient private key> <waku time in ms> <payload hex>...
```

`decode` goes the other way. It opens a payload this app published with
status-go's own encryption layer and checks what is inside against status-go's
rules for messages and group events. It then builds the reply status-go would
send, encrypted to this app's installation once status-go has accepted its
bundle. `reassemble` does the same for a message this app split into
segments, through status-go's segmenter.

## Caveats

- **nwaku is a nightly build.** macOS binaries ship only under the rolling
  `nightly` tag; versioned releases carry source and Linux artefacts. Pin a
  downloaded copy if you need the same node twice.
- Apple silicon only. The download is `arm64-macos`.
- `nak serve` is in-memory. Stopping it loses every event, which is usually
  what you want and occasionally is not.
