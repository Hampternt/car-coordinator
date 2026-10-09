//! Rooms and auth: the token's hash, and the create code. PROTOCOL.md §1, §4.1.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// Characters in a token: 32 bytes, base64url without padding.
const TOKEN_CHARS: usize = 43;
/// Characters in a room id: 16 bytes, base64url without padding.
const ROOM_ID_CHARS: usize = 22;

/// `[A-Za-z0-9_-]`, the base64url alphabet without padding.
pub fn is_base64url(text: &str) -> bool {
    text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Decodes a 43-character base64url token (no padding) to its 32 bytes and
/// returns `sha256` of those bytes. `None` when the token is malformed.
pub fn hash_token(token: &str) -> Option<[u8; 32]> {
    if token.len() != TOKEN_CHARS || !is_base64url(token) {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(token).ok()?;
    if bytes.len() != 32 {
        return None;
    }
    Some(Sha256::digest(&bytes).into())
}

/// Constant-time comparison of a stored hash with a presented one.
pub fn hash_matches(stored: &[u8; 32], presented: &[u8; 32]) -> bool {
    stored.ct_eq(presented).into()
}

/// Constant-time; always false when the relay has no create code. Both sides
/// are hashed first so the comparison does not leak the code's length.
pub fn create_code_matches(expected: Option<&str>, given: &str) -> bool {
    let Some(expected) = expected.filter(|code| !code.is_empty()) else {
        return false;
    };
    let expected: [u8; 32] = Sha256::digest(expected.as_bytes()).into();
    let given: [u8; 32] = Sha256::digest(given.as_bytes()).into();
    hash_matches(&expected, &given)
}

/// `^[A-Za-z0-9_-]{22}$`
pub fn valid_room_id(room: &str) -> bool {
    room.len() == ROOM_ID_CHARS && is_base64url(room)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// PROTOCOL.md §1's test vector, shared with the browser client.
    #[test]
    fn the_protocols_token_vector_hashes_as_documented() {
        let hash = hash_token("oLAfzK7Ly0MaXxZIV1VTNuD4uhKZtKKZ75X47f2mYdQ").unwrap();
        let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "e4ae2254a6c8b354cf887032d5c3214092b59c9877ad361f8e330fd97b559dbb");
    }

    #[test]
    fn a_token_must_be_43_base64url_characters_of_32_bytes() {
        let good = "oLAfzK7Ly0MaXxZIV1VTNuD4uhKZtKKZ75X47f2mYdQ";
        assert!(hash_token(good).is_some());
        assert!(hash_token(&good[..42]).is_none());
        assert!(hash_token(&format!("{good}A")).is_none());
        assert!(hash_token(&format!("{}=", &good[..42])).is_none());
        assert!(hash_token(&format!("{}+", &good[..42])).is_none());
    }

    #[test]
    fn the_create_code_needs_an_exact_match_and_a_configured_code() {
        assert!(create_code_matches(Some("s3cret"), "s3cret"));
        assert!(!create_code_matches(Some("s3cret"), "s3cre"));
        assert!(!create_code_matches(Some("s3cret"), "s3cret "));
        assert!(!create_code_matches(None, ""));
        assert!(!create_code_matches(Some(""), ""));
    }

    #[test]
    fn room_ids_are_22_base64url_characters() {
        assert!(valid_room_id("WC4euC74o8kDhATEpCnxOA"));
        assert!(!valid_room_id("WC4euC74o8kDhATEpCnxO"));
        assert!(!valid_room_id("WC4euC74o8kDhATEpCnxO="));
        assert!(!valid_room_id("WC4euC74o8kDhATEpCnx/A"));
    }
}
