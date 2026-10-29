//! SQLite storage: per room the token hash, the snapshot, the ops after it,
//! and the newest versions. PROTOCOL.md §4.2-4.4. Presence never comes here.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{OptionalExtension, params};

use crate::protocol::{OpOut, SnapshotOut, VersionMeta};

pub type StorageError = rusqlite::Error;
pub type Result<T> = std::result::Result<T, StorageError>;

pub const DB_FILE: &str = "carsync.db";

/// One schema step. Most run in a transaction; `Alone` is for what cannot,
/// VACUUM among them, and must be safe to run again if cut short.
enum Step {
    InTransaction(&'static str),
    Alone(&'static str),
}

/// Schema, by `PRAGMA user_version`. A database is moved forward one step at a
/// time and never back; append new steps, never edit an old one.
const MIGRATIONS: &[Step] = &[
    // 1: rooms, the op log after each room's snapshot, and versions.
    Step::InTransaction(
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
    ),
    // 2: pages freed by a snapshot's dropped ops go back to the disk
    // (`reclaim`), so a room that reached the disk cap can get under it again.
    // An existing database takes the setting only through a VACUUM.
    Step::Alone("PRAGMA auto_vacuum = INCREMENTAL; VACUUM;"),
];

pub fn now_ms() -> u64 {
    let since_epoch = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    since_epoch.as_millis() as u64
}

fn migrate(conn: &rusqlite::Connection) -> Result<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (step, migration) in MIGRATIONS.iter().enumerate().skip(current) {
        match migration {
            Step::InTransaction(sql) => {
                let tx = conn.unchecked_transaction()?;
                tx.execute_batch(sql)?;
                tx.pragma_update(None, "user_version", step + 1)?;
                tx.commit()?;
            }
            Step::Alone(sql) => {
                conn.execute_batch(sql)?;
                conn.pragma_update(None, "user_version", step + 1)?;
            }
        }
    }
    Ok(())
}

/// Moves the database's free pages to its end and cuts them off, then
/// checkpoints the WAL into it and empties the WAL: until then the freed pages
/// and the vacuum itself are still in `-wal`, which the disk cap counts too.
fn reclaim(conn: &rusqlite::Connection) -> Result<()> {
    // Stepped until done: a single step (all execute_batch gives it) frees
    // one page, not all of them.
    let mut freeing = conn.prepare("PRAGMA incremental_vacuum")?;
    let mut rows = freeing.query([])?;
    while rows.next()?.is_some() {}
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
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

    fn conn(&self) -> std::sync::MutexGuard<'_, rusqlite::Connection> {
        // A panic while the lock was held cannot leave a transaction half
        // done (rusqlite rolls back on drop), so a poisoned lock is safe to use.
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn room_count(&self) -> Result<u64> {
        self.conn().query_row("SELECT COUNT(*) FROM rooms", [], |row| row.get(0))
    }

    pub fn create_room(&self, room: &str, token_hash: &[u8; 32]) -> Result<CreateOutcome> {
        let inserted = self.conn().execute(
            "INSERT INTO rooms (id, token_hash, created_at) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO NOTHING",
            params![room, &token_hash[..], now_ms()],
        )?;
        Ok(if inserted == 1 { CreateOutcome::Created } else { CreateOutcome::Exists })
    }

    pub fn token_hash(&self, room: &str) -> Result<Option<[u8; 32]>> {
        let blob: Option<Vec<u8>> = self
            .conn()
            .query_row("SELECT token_hash FROM rooms WHERE id = ?1", [room], |row| row.get(0))
            .optional()?;
        // A stored hash of the wrong length matches nothing.
        Ok(blob.and_then(|b| b.try_into().ok()))
    }

    /// The room's latest op seq (0 before any op).
    pub fn latest_seq(&self, room: &str) -> Result<u64> {
        let seq: Option<u64> =
            self.conn().query_row("SELECT latest_seq FROM rooms WHERE id = ?1", [room], |row| row.get(0)).optional()?;
        Ok(seq.unwrap_or(0))
    }

    /// Stores the snapshot unless `seq` is below the stored one, dropping ops
    /// with `seq <=` it, and gives the space they held back to the disk.
    /// Returns the stored snapshot's seq afterwards. The caller has already
    /// refused a `seq` above the latest.
    pub fn put_snapshot(&self, room: &str, seq: u64, body: &str) -> Result<u64> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let stored: Option<u64> =
            tx.query_row("SELECT snapshot_seq FROM rooms WHERE id = ?1", [room], |row| row.get(0))?;
        if let Some(stored) = stored.filter(|&stored| seq < stored) {
            return Ok(stored);
        }
        tx.execute("UPDATE rooms SET snapshot_seq = ?2, snapshot_body = ?3 WHERE id = ?1", params![room, seq, body])?;
        tx.execute("DELETE FROM ops WHERE room = ?1 AND seq <= ?2", params![room, seq])?;
        tx.commit()?;
        // The snapshot is stored either way: a failure here costs disk, not data.
        if let Err(error) = reclaim(&conn) {
            eprintln!("carsync-relay: could not give freed space back: {error}");
        }
        Ok(seq)
    }

    /// Stores the op under the next seq and returns it.
    pub fn append_op(&self, room: &str, body: &str) -> Result<u64> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let seq: u64 = tx.query_row(
            "UPDATE rooms SET latest_seq = latest_seq + 1 WHERE id = ?1 RETURNING latest_seq",
            [room],
            |row| row.get(0),
        )?;
        tx.execute("INSERT INTO ops (room, seq, body) VALUES (?1, ?2, ?3)", params![room, seq, body])?;
        tx.commit()?;
        Ok(seq)
    }

    /// Stores a version stamped `at_ms`, prunes to the newest `keep`, and
    /// returns its id and time.
    pub fn add_version(&self, room: &str, body: &str, label: &str, at_ms: u64, keep: usize) -> Result<VersionMeta> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        // The counter lives on the room, so a pruned id is never handed out again.
        let id: u64 = tx.query_row(
            "UPDATE rooms SET next_version = next_version + 1 WHERE id = ?1 RETURNING next_version - 1",
            [room],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT INTO versions (room, id, at, label, body) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![room, id, at_ms, label, body],
        )?;
        tx.execute(
            "DELETE FROM versions WHERE room = ?1 AND id NOT IN
                (SELECT id FROM versions WHERE room = ?1 ORDER BY id DESC LIMIT ?2)",
            params![room, keep],
        )?;
        tx.commit()?;
        Ok(VersionMeta { id, at: at_ms, label: label.to_string() })
    }

    pub fn get_version(&self, room: &str, id: u64) -> Result<Option<StoredVersion>> {
        self.conn()
            .query_row("SELECT at, label, body FROM versions WHERE room = ?1 AND id = ?2", params![room, id], |row| {
                Ok(StoredVersion { meta: VersionMeta { id, at: row.get(0)?, label: row.get(1)? }, body: row.get(2)? })
            })
            .optional()
    }

    pub fn catchup(&self, room: &str, since: u64) -> Result<CatchupData> {
        let mut conn = self.conn();
        // One read transaction, so the parts agree with each other.
        let tx = conn.transaction()?;
        let (seq, snapshot_seq, snapshot_body): (u64, Option<u64>, Option<String>) = tx.query_row(
            "SELECT latest_seq, snapshot_seq, snapshot_body FROM rooms WHERE id = ?1",
            [room],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        let snapshot = snapshot_seq.zip(snapshot_body).map(|(seq, body)| SnapshotOut { seq, body });
        let ops = tx
            .prepare("SELECT seq, body FROM ops WHERE room = ?1 AND seq > ?2 ORDER BY seq")?
            .query_map(params![room, since], |row| Ok(OpOut { seq: row.get(0)?, body: row.get(1)? }))?
            .collect::<Result<Vec<_>>>()?;
        let versions = tx
            .prepare("SELECT id, at, label FROM versions WHERE room = ?1 ORDER BY id")?
            .query_map([room], |row| Ok(VersionMeta { id: row.get(0)?, at: row.get(1)?, label: row.get(2)? }))?
            .collect::<Result<Vec<_>>>()?;
        tx.commit()?;
        Ok(CatchupData { seq, snapshot, ops, versions })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOM: &str = "WC4euC74o8kDhATEpCnxOA";

    fn ops(storage: &Storage, since: u64) -> Vec<(u64, String)> {
        storage.catchup(ROOM, since).unwrap().ops.into_iter().map(|op| (op.seq, op.body)).collect()
    }

    #[test]
    fn a_snapshot_drops_the_ops_it_covers_and_the_seq_stays() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::open(dir.path()).unwrap();
        assert!(matches!(storage.create_room(ROOM, &[7; 32]).unwrap(), CreateOutcome::Created));
        for body in ["one", "two", "three"] {
            storage.append_op(ROOM, body).unwrap();
        }
        assert_eq!(storage.put_snapshot(ROOM, 2, "snap").unwrap(), 2);
        assert_eq!(ops(&storage, 0), vec![(3, "three".to_string())]);
        assert_eq!(storage.put_snapshot(ROOM, 1, "stale").unwrap(), 2, "a stale snapshot is not stored");
        assert_eq!(storage.put_snapshot(ROOM, 3, "all").unwrap(), 3);
        assert_eq!(ops(&storage, 0), vec![]);
        assert_eq!(storage.latest_seq(ROOM).unwrap(), 3);
        assert_eq!(storage.append_op(ROOM, "four").unwrap(), 4);
    }

    fn auto_vacuum(storage: &Storage) -> i64 {
        storage.conn().query_row("PRAGMA auto_vacuum", [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn auto_vacuum_is_incremental_in_a_new_database_and_an_upgraded_one() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(auto_vacuum(&Storage::open(dir.path()).unwrap()), 2, "new");
        let dir = tempfile::tempdir().unwrap();
        {
            // A database as the first release left it: step 1 only.
            let conn = rusqlite::Connection::open(dir.path().join(DB_FILE)).unwrap();
            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            let Step::InTransaction(first) = &MIGRATIONS[0] else { panic!("step 1 runs in a transaction") };
            conn.execute_batch(first).unwrap();
            conn.pragma_update(None, "user_version", 1).unwrap();
            conn.execute("INSERT INTO rooms (id, token_hash, created_at) VALUES (?1, ?2, 0)", params![ROOM, &[7u8; 32][..]])
                .unwrap();
        }
        let storage = Storage::open(dir.path()).unwrap();
        assert_eq!(auto_vacuum(&storage), 2, "upgraded");
        assert_eq!(storage.token_hash(ROOM).unwrap(), Some([7; 32]), "and kept its rooms");
        let version: usize = storage.conn().query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(version, MIGRATIONS.len());
    }

    #[test]
    fn a_snapshot_gives_the_space_its_ops_held_back_to_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::open(dir.path()).unwrap();
        storage.create_room(ROOM, &[7; 32]).unwrap();
        let empty = crate::limits::disk_usage(dir.path()).unwrap();
        for _ in 0..10 {
            storage.append_op(ROOM, &"A".repeat(100_000)).unwrap();
        }
        assert!(crate::limits::disk_usage(dir.path()).unwrap() > empty + 900_000);
        storage.put_snapshot(ROOM, 10, "snap").unwrap();
        let after = crate::limits::disk_usage(dir.path()).unwrap();
        assert!(after < empty + 100_000, "{after} bytes left after the snapshot, {empty} when empty");
    }

    #[test]
    fn a_reopened_database_keeps_everything() {
        let dir = tempfile::tempdir().unwrap();
        {
            let storage = Storage::open(dir.path()).unwrap();
            storage.create_room(ROOM, &[7; 32]).unwrap();
            storage.put_snapshot(ROOM, 0, "seed").unwrap();
            storage.append_op(ROOM, "op").unwrap();
            for n in 1..=3 {
                storage.add_version(ROOM, &format!("body{n}"), &format!("label{n}"), 1000 + n, 2).unwrap();
            }
        }
        let storage = Storage::open(dir.path()).unwrap();
        assert_eq!(storage.room_count().unwrap(), 1);
        assert_eq!(storage.token_hash(ROOM).unwrap(), Some([7; 32]));
        assert!(matches!(storage.create_room(ROOM, &[8; 32]).unwrap(), CreateOutcome::Exists));
        let caught = storage.catchup(ROOM, 0).unwrap();
        assert_eq!(caught.seq, 1);
        assert_eq!(caught.snapshot, Some(SnapshotOut { seq: 0, body: "seed".into() }));
        assert_eq!(caught.ops, vec![OpOut { seq: 1, body: "op".into() }]);
        assert_eq!(caught.versions.iter().map(|v| v.id).collect::<Vec<_>>(), vec![2, 3], "pruned to the newest 2");
        assert!(storage.get_version(ROOM, 1).unwrap().is_none());
        assert_eq!(storage.get_version(ROOM, 3).unwrap().unwrap().body, "body3");
        assert_eq!(storage.add_version(ROOM, "b", "l", 2000, 2).unwrap().id, 4, "ids are never reused");
    }
}
