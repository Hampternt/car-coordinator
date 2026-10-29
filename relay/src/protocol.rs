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
    let value: serde_json::Value = serde_json::from_str(text).map_err(|_| close::BAD_FRAME)?;
    // serde would read `["catchup", 0]` as a catchup frame; only objects are frames.
    if !value.is_object() {
        return Err(close::BAD_FRAME);
    }
    let frame: ClientFrame = serde_json::from_value(value).map_err(|_| close::BAD_FRAME)?;
    match &frame {
        ClientFrame::Hello { .. } | ClientFrame::Create { .. } => {}
        ClientFrame::Snapshot { seq, body } => {
            check_integer(*seq)?;
            check_ciphertext(body, limits.max_body)?;
        }
        ClientFrame::Op { body } | ClientFrame::Presence { body } => check_ciphertext(body, limits.max_body)?,
        ClientFrame::Version { body, label } => {
            check_ciphertext(body, limits.max_body)?;
            check_ciphertext(label, limits.max_label)?;
        }
        ClientFrame::GetVersion { id } => check_integer(*id)?,
        ClientFrame::Catchup { since } => check_integer(*since)?,
    }
    Ok(frame)
}

/// Integers on the wire stay below 2^53, so JavaScript reads them exactly.
const MAX_INTEGER: u64 = (1 << 53) - 1;

fn check_integer(n: u64) -> Result<(), u16> {
    if n > MAX_INTEGER { Err(close::BAD_FRAME) } else { Ok(()) }
}

/// A `body` or `label`: non-empty base64url, at most `max` characters.
fn check_ciphertext(text: &str, max: usize) -> Result<(), u16> {
    if text.len() > max {
        Err(close::TOO_LARGE)
    } else if text.is_empty() || !crate::auth::is_base64url(text) {
        Err(close::BAD_FRAME)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Limits;

    fn small() -> Limits {
        Limits { max_body: 8, max_label: 4, ..Limits::default() }
    }

    #[test]
    fn frames_parse_with_unknown_fields_ignored() {
        let frame = parse(r#"{"type":"create","token":"t","createCode":"c","client":"0.15"}"#, &small()).unwrap();
        assert_eq!(frame, ClientFrame::Create { token: "t".into(), create_code: "c".into() });
        assert_eq!(parse(r#"{"type":"getVersion","id":3}"#, &small()), Ok(ClientFrame::GetVersion { id: 3 }));
    }

    #[test]
    fn sizes_are_4413_and_shapes_4400() {
        let l = small();
        assert_eq!(parse(r#"{"type":"op","body":"AAAAAAAA"}"#, &l), Ok(ClientFrame::Op { body: "AAAAAAAA".into() }));
        assert_eq!(parse(r#"{"type":"op","body":"AAAAAAAAA"}"#, &l), Err(close::TOO_LARGE));
        assert_eq!(parse(r#"{"type":"version","body":"AA","label":"AAAAA"}"#, &l), Err(close::TOO_LARGE));
        assert_eq!(parse(r#"{"type":"op","body":"A=A"}"#, &l), Err(close::BAD_FRAME));
        assert_eq!(parse(r#"{"type":"catchup","since":9007199254740992}"#, &l), Err(close::BAD_FRAME));
        assert_eq!(parse(r#"{"type":"catchup","since":9007199254740991}"#, &l), Ok(ClientFrame::Catchup { since: MAX_INTEGER }));
        assert_eq!(parse(r#"{"type":7}"#, &l), Err(close::BAD_FRAME));
        assert_eq!(parse(r#""op""#, &l), Err(close::BAD_FRAME));
    }
}
