//! The frames of PROTOCOL.md §4 and the close codes of §5.

use serde::{Deserialize, Serialize};

pub mod close {
    pub const BAD_FRAME: u16 = 4400;
    pub const NOT_ALLOWED: u16 = 4401;
    pub const WRONG_CREATE_CODE: u16 = 4403;
    pub const HELLO_TIMEOUT: u16 = 4408;
    pub const ROOM_EXISTS: u16 = 4409;
    pub const TOO_LARGE: u16 = 4413;
    pub const RATE_LIMITED: u16 = 4429;
    pub const FULL: u16 = 4507;
    pub const GOING_AWAY: u16 = 1001;
}

/// What a client may send. Unknown fields are ignored.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ClientFrame {
    Hello { token: String },
    Create { token: String, create_code: String },
    Snapshot { seq: u64, body: String },
    Op { body: String },
    Version { body: String, label: String },
    GetVersion { id: u64 },
    Catchup { since: u64 },
    Presence { body: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SnapshotOut {
    pub seq: u64,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct OpOut {
    pub seq: u64,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VersionMeta {
    pub id: u64,
    /// Unix milliseconds, relay clock.
    pub at: u64,
    pub label: String,
}

/// What the relay sends.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerFrame {
    Created,
    Welcome { seq: u64 },
    /// The ack of a snapshot or an op.
    #[serde(rename = "ack")]
    AckSeq { seq: u64 },
    /// The ack of a version.
    #[serde(rename = "ack")]
    AckVersion { id: u64, at: u64 },
    Op { seq: u64, body: String },
    /// Announced to the others without `body`; the `getVersion` reply has it.
    Version {
        id: u64,
        at: u64,
        label: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        body: Option<String>,
    },
    NoVersion { id: u64 },
    Catchup {
        seq: u64,
        snapshot: Option<SnapshotOut>,
        ops: Vec<OpOut>,
        versions: Vec<VersionMeta>,
    },
    Presence { body: String },
}

/// Parses one text frame. `Err` carries the close code: 4400 for bad JSON,
/// an unknown type, a wrong-typed field, or a `body`/`label` that is empty or
/// not base64url; 4413 for a `body`/`label` over its limit.
pub fn parse(text: &str, limits: &crate::Limits) -> Result<ClientFrame, u16> {
    todo!("pack 1: parse and validate a frame")
}
