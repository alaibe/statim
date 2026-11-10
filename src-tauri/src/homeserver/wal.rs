//! tuwunel's RocksDB sometimes loses a run of records from a write-ahead log
//! while it runs (tuwunel issue #653). Every later record then sits off the
//! 32 KB blocks RocksDB reads the log in, and the next start either spins
//! forever replaying it or drops those records. Writing the records that are
//! there back onto proper blocks lets the server open with all of them.

use std::fs::File;
use std::io::Write;
use std::path::Path;

const BLOCK: usize = 32 * 1024;
const HEADER: usize = 7;
const FULL: u8 = 1;
const FIRST: u8 = 2;
const MIDDLE: u8 = 3;
const LAST: u8 = 4;

/// Realigns every log of the database at `db` that lost its blocks, unless a
/// process has the database open.
pub fn repair(db: &Path) {
    if !db.join("LOCK").exists() {
        return;
    }
    let Some(_lock) = unused(db) else {
        log::warn!("[homeserver] its database is still open elsewhere; logs not checked");
        return;
    };
    let Ok(entries) = std::fs::read_dir(db) else {
        return;
    };
    for path in entries.flatten().map(|entry| entry.path()) {
        if path
            .extension()
            .map_or(true, |extension| extension != "log")
        {
            continue;
        }
        let Ok(data) = std::fs::read(&path) else {
            continue;
        };
        if aligned(&data) {
            continue;
        }
        let name = path.display();
        match realign(&data).and_then(|(framed, missing)| {
            replace(&path, &framed).map_err(|e| e.to_string())?;
            Ok(missing)
        }) {
            Ok(missing) => log::warn!(
                "[homeserver] realigned {name}; {missing} writes were already missing from it"
            ),
            Err(error) => {
                log::warn!("[homeserver] {name} lost its blocks and stays as it is: {error}")
            }
        }
    }
}

/// Whether the log reads as RocksDB writes it. A record cut short by the end
/// of the file counts: RocksDB drops it itself.
fn aligned(data: &[u8]) -> bool {
    let mut at = 0;
    while at < data.len() {
        let left = BLOCK - at % BLOCK;
        if left < HEADER {
            if data[at..data.len().min(at + left)].iter().any(|&b| b != 0) {
                return false;
            }
            at += left;
            continue;
        }
        let Some(header) = data.get(at..at + HEADER) else {
            return true;
        };
        let length = HEADER + u16::from_le_bytes([header[4], header[5]]) as usize;
        match header[6] {
            0 => return data[at..].iter().all(|&b| b == 0),
            FULL..=LAST if at + length > data.len() => return true,
            FULL..=LAST if length <= left => at += length,
            _ => return false,
        }
    }
    true
}

/// The log's write batches framed again, and how many sequence numbers were
/// already missing between them. Refuses what it cannot account for.
fn realign(data: &[u8]) -> Result<(Vec<u8>, u64), String> {
    let mut batches = Vec::new();
    let mut partial: Option<Vec<u8>> = None;
    let mut at = 0;
    while at < data.len() {
        let Some((kind, payload)) = record_at(data, at) else {
            if data[at] != 0 {
                return Err(format!("unreadable bytes at {at}"));
            }
            at += 1;
            continue;
        };
        partial = match (kind, partial.take()) {
            (FULL, None) => {
                batches.push(payload.to_vec());
                None
            }
            (FIRST, None) => Some(payload.to_vec()),
            (MIDDLE, Some(mut batch)) => {
                batch.extend_from_slice(payload);
                Some(batch)
            }
            (LAST, Some(mut batch)) => {
                batch.extend_from_slice(payload);
                batches.push(batch);
                None
            }
            _ => return Err(format!("a record out of order at {at}")),
        };
        at += HEADER + payload.len();
    }
    if partial.is_some() {
        return Err("it ends inside a record".into());
    }

    let mut missing = 0;
    let mut next = None;
    for batch in &batches {
        let header = batch.get(..12).ok_or("a write batch is too short")?;
        let sequence = u64::from_le_bytes(header[..8].try_into().unwrap());
        let count = u32::from_le_bytes(header[8..].try_into().unwrap());
        if let Some(next) = next {
            if sequence < next {
                return Err(format!("sequence {sequence} comes after {next}"));
            }
            missing += sequence - next;
        }
        next = Some(sequence + u64::from(count));
    }

    let mut framed = Vec::with_capacity(data.len());
    for batch in &batches {
        frame(&mut framed, batch);
    }
    if framed.len() < data.len() {
        framed.resize(data.len(), 0);
    }
    Ok((framed, missing))
}

fn record_at(data: &[u8], at: usize) -> Option<(u8, &[u8])> {
    let header = data.get(at..at + HEADER)?;
    let kind = header[6];
    let length = u16::from_le_bytes([header[4], header[5]]) as usize;
    let payload = data.get(at + HEADER..at + HEADER + length)?;
    let stored = u32::from_le_bytes(header[..4].try_into().unwrap());
    ((FULL..=LAST).contains(&kind) && checksum(kind, payload) == stored).then_some((kind, payload))
}

/// Appends one write batch as RocksDB's log writer would.
fn frame(out: &mut Vec<u8>, batch: &[u8]) {
    let mut rest = batch;
    let mut first = true;
    loop {
        let left = BLOCK - out.len() % BLOCK;
        if left < HEADER {
            out.resize(out.len() + left, 0);
            continue;
        }
        let (piece, after) = rest.split_at(rest.len().min(left - HEADER));
        let kind = match (first, after.is_empty()) {
            (true, true) => FULL,
            (true, false) => FIRST,
            (false, false) => MIDDLE,
            (false, true) => LAST,
        };
        out.extend_from_slice(&checksum(kind, piece).to_le_bytes());
        out.extend_from_slice(&(piece.len() as u16).to_le_bytes());
        out.push(kind);
        out.extend_from_slice(piece);
        if after.is_empty() {
            return;
        }
        rest = after;
        first = false;
    }
}

/// RocksDB's masked CRC-32C of a record's type and payload.
fn checksum(kind: u8, payload: &[u8]) -> u32 {
    const TABLE: [u32; 256] = {
        let mut table = [0; 256];
        let mut i = 0;
        while i < 256 {
            let mut crc = i as u32;
            let mut bit = 0;
            while bit < 8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0x82f6_3b78
                } else {
                    crc >> 1
                };
                bit += 1;
            }
            table[i] = crc;
            i += 1;
        }
        table
    };
    let crc = !std::iter::once(&kind)
        .chain(payload)
        .fold(!0u32, |crc, &byte| {
            TABLE[((crc ^ u32::from(byte)) & 0xff) as usize] ^ (crc >> 8)
        });
    crc.rotate_right(15).wrapping_add(0xa282_ead8)
}

fn replace(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let realigned = path.with_extension("log.realigned");
    let mut file = File::create(&realigned)?;
    file.write_all(data)?;
    file.sync_all()?;
    std::fs::rename(&realigned, path)
}

/// RocksDB's own lock on the database, held until it is dropped, if no
/// process has the database open.
#[cfg(unix)]
fn unused(db: &Path) -> Option<File> {
    use std::os::fd::AsRawFd;
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .open(db.join("LOCK"))
        .ok()?;
    let mut range: libc::flock = unsafe { std::mem::zeroed() };
    range.l_type = libc::F_WRLCK as _;
    range.l_whence = libc::SEEK_SET as _;
    (unsafe { libc::fcntl(lock.as_raw_fd(), libc::F_SETLK, &range) } == 0).then_some(lock)
}

#[cfg(not(unix))]
fn unused(_db: &Path) -> Option<File> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn batch(sequence: u64, count: u32, size: usize) -> Vec<u8> {
        let mut batch = sequence.to_le_bytes().to_vec();
        batch.extend_from_slice(&count.to_le_bytes());
        batch.extend((0..size).map(|i| (i % 251) as u8 + 1));
        batch
    }

    fn batches(from: u64, sizes: &[usize]) -> Vec<Vec<u8>> {
        let mut sequence = from;
        sizes
            .iter()
            .map(|&size| {
                let made = batch(sequence, 2, size);
                sequence += 2;
                made
            })
            .collect()
    }

    fn framed(batches: &[Vec<u8>]) -> Vec<u8> {
        let mut out = Vec::new();
        for batch in batches {
            frame(&mut out, batch);
        }
        out
    }

    /// A log whose writer counted `lost` bytes after `kept` that never reached
    /// the file: the batches after it are framed out of phase.
    fn losing(kept: &[Vec<u8>], lost: usize, after: &[Vec<u8>]) -> Vec<u8> {
        let mut log = framed(kept);
        let mut shifted = vec![0; log.len() + lost];
        for batch in after {
            frame(&mut shifted, batch);
        }
        log.extend_from_slice(&shifted[log.len() + lost..]);
        log
    }

    const SIZES: [usize; 12] = [
        150, 40_000, 9, 32_700, 155, 70_000, 3, 1_200, 155, 20_000, 0, 5,
    ];

    #[test]
    fn leaves_a_log_as_rocksdb_writes_it() {
        let log = framed(&batches(100, &SIZES));
        assert!(aligned(&log));
        assert_eq!(realign(&log).unwrap(), (log, 0));
    }

    #[test]
    fn frames_again_what_follows_lost_bytes() {
        let all = batches(100, &SIZES);
        let (kept, rest) = all.split_at(4);
        let log = losing(kept, 9709, &rest[1..]);
        assert!(!aligned(&log));

        let (realigned, missing) = realign(&log).unwrap();
        assert_eq!(missing, 2);
        assert!(realigned.len() >= log.len());
        let expected = framed(&[kept, &rest[1..]].concat());
        assert_eq!(&realigned[..expected.len()], expected.as_slice());
        assert!(realigned[expected.len()..].iter().all(|&b| b == 0));
        assert!(aligned(&realigned));
    }

    #[test]
    fn notices_the_loss_whatever_the_shift() {
        let all = batches(100, &SIZES);
        for lost in [1, 4, 7, 160, 9709, 32_761] {
            let log = losing(&all[..2], lost, &all[2..]);
            assert!(!aligned(&log), "lost {lost}");
            assert!(realign(&log).is_ok(), "lost {lost}");
        }
    }

    #[test]
    fn leaves_a_log_cut_short_by_a_crash() {
        let log = framed(&batches(100, &SIZES));
        for cut in [3, HEADER + 2, 40] {
            assert!(aligned(&log[..log.len() - cut]), "cut {cut}");
        }
    }

    #[test]
    fn refuses_what_it_cannot_account_for() {
        let all = batches(100, &SIZES);
        let shifted = losing(&all[..2], 100, &all[2..]);

        let mut garbled = shifted.clone();
        garbled[50_000] ^= 0xff;
        assert!(realign(&garbled).is_err());

        let backwards = losing(&batches(100, &[150, 150]), 100, &batches(101, &[40_000]));
        assert!(!aligned(&backwards));
        assert!(realign(&backwards).unwrap_err().contains("comes after"));

        let orphan = framed(&batches(100, &[40_000]))[BLOCK..].to_vec();
        assert!(realign(&orphan).unwrap_err().contains("out of order"));

        let unfinished = &shifted[..shifted.len() - 10];
        assert!(realign(unfinished).is_err());
    }

    fn database(name: &str) -> std::path::PathBuf {
        let db = std::env::temp_dir().join(name);
        let _ = std::fs::remove_dir_all(&db);
        std::fs::create_dir_all(db.join("archive")).unwrap();
        std::fs::write(db.join("LOCK"), "").unwrap();
        db
    }

    #[test]
    fn repairs_only_the_logs_that_lost_their_blocks() {
        let db = database("statim-wal-repair-test");
        let all = batches(100, &SIZES);
        let healthy = framed(&all);
        let broken = losing(&all[..5], 300, &all[5..]);
        std::fs::write(db.join("000010.log"), &broken).unwrap();
        std::fs::write(db.join("000011.log"), &healthy).unwrap();
        std::fs::write(db.join("archive/000009.log"), &broken).unwrap();
        std::fs::write(db.join("LOG"), &broken).unwrap();

        repair(&db);

        let repaired = std::fs::read(db.join("000010.log")).unwrap();
        assert_eq!(repaired, realign(&broken).unwrap().0);
        assert_eq!(std::fs::read(db.join("000011.log")).unwrap(), healthy);
        assert_eq!(
            std::fs::read(db.join("archive/000009.log")).unwrap(),
            broken
        );
        assert_eq!(std::fs::read(db.join("LOG")).unwrap(), broken);
        assert!(!db.join("000010.log.realigned").exists());
    }

    #[cfg(unix)]
    #[test]
    fn leaves_a_database_another_process_has_open() {
        let db = database("statim-wal-locked-test");
        let all = batches(100, &SIZES);
        let broken = losing(&all[..5], 300, &all[5..]);
        std::fs::write(db.join("000010.log"), &broken).unwrap();
        let mut holder = std::process::Command::new("python3")
            .args([
                "-c",
                "import fcntl, sys, time; f = open(sys.argv[1], 'r+'); fcntl.lockf(f, fcntl.LOCK_EX); print(flush=True); time.sleep(30)",
            ])
            .arg(db.join("LOCK"))
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let mut ready = [0u8; 1];
        std::io::Read::read_exact(holder.stdout.as_mut().unwrap(), &mut ready).unwrap();

        repair(&db);

        holder.kill().unwrap();
        holder.wait().unwrap();
        assert_eq!(std::fs::read(db.join("000010.log")).unwrap(), broken);
        repair(&db);
        assert_ne!(std::fs::read(db.join("000010.log")).unwrap(), broken);
    }
}
