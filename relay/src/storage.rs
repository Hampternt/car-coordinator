//! SQLite storage: per room the token hash, the snapshot, the ops after it,
//! and the newest versions. PROTOCOL.md §4.2-4.4. Presence never comes here.

use std::path::Path;
use std::sync::Mutex;

use crate::protocol::{OpOut, SnapshotOut, VersionMeta};

pub type StorageError = rusqlite::Error;
pub type Result<T> = std::result::Result<T, StorageError>;

pub const DB_FILE: &str = "carsync.db";

/// Schema, by `PRAGMA user_version`. A database is moved forward one step at a
/// time and never back; append new steps, never edit an old one.
const MIGRATIONS: &[&str] = &[
    // 1: rooms, the op log after each room's snapshot, and versions.
    "CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        token_hash BLOB NOT NULL,
        latest_seq INTEGER NOT NULL DEFAULT 0,
        next_version INTEGER NOT NULL DEFAULT 1,
        snapshot_seq INTEGER,
        snapshot_body TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE ops (
        room TEXT NOT NULL REFERENCES rooms(id),
        seq INTEGER NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (room, seq)
    );
    CREATE TABLE versions (
        room TEXT NOT NULL REFERENCES rooms(id),
        id INTEGER NOT NULL,
        at INTEGER NOT NULL,
        label TEXT NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY (room, id)
    );",
];

fn migrate(conn: &rusqlite::Connection) -> Result<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (step, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", step + 1)?;
        tx.commit()?;
    }
    Ok(())
}

pub struct Storage {
    conn: Mutex<rusqlite::Connection>,
}

pub enum CreateOutcome {
    Created,
    Exists,
}

pub struct CatchupData {
    pub seq: u64,
    pub snapshot: Option<SnapshotOut>,
    pub ops: Vec<OpOut>,
    pub versions: Vec<VersionMeta>,
}

pub struct StoredVersion {
    pub meta: VersionMeta,
    pub body: String,
}

impl Storage {
    /// Opens (creating if needed) the database in `dir`.
    pub fn open(dir: &Path) -> Result<Storage> {
        let conn = rusqlite::Connection::open(dir.join(DB_FILE))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        // WAL keeps a write to one room from blocking a read; FULL makes an
        // acked write survive a power cut, not only a crash.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        conn.pragma_update(None, "journal_size_limit", 16 * 1024 * 1024)?;
        migrate(&conn)?;
        Ok(Storage { conn: Mutex::new(conn) })
    }

    pub fn room_count(&self) -> Result<u64> {
        todo!()
    }

    pub fn create_room(&self, room: &str, token_hash: &[u8; 32]) -> Result<CreateOutcome> {
        todo!()
    }

    pub fn token_hash(&self, room: &str) -> Result<Option<[u8; 32]>> {
        todo!()
    }

    /// The room's latest op seq (0 before any op).
    pub fn latest_seq(&self, room: &str) -> Result<u64> {
        todo!()
    }

    /// Stores the snapshot unless `seq` is below the stored one, dropping ops
    /// with `seq <=` it. Returns the stored snapshot's seq afterwards. The
    /// caller has already refused a `seq` above the latest.
    pub fn put_snapshot(&self, room: &str, seq: u64, body: &str) -> Result<u64> {
        todo!()
    }

    /// Stores the op under the next seq and returns it.
    pub fn append_op(&self, room: &str, body: &str) -> Result<u64> {
        todo!()
    }

    /// Stores a version stamped `at_ms`, prunes to the newest `keep`, and
    /// returns its id and time.
    pub fn add_version(&self, room: &str, body: &str, label: &str, at_ms: u64, keep: usize) -> Result<VersionMeta> {
        todo!()
    }

    pub fn get_version(&self, room: &str, id: u64) -> Result<Option<StoredVersion>> {
        todo!()
    }

    pub fn catchup(&self, room: &str, since: u64) -> Result<CatchupData> {
        todo!()
    }
}
