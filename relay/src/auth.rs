//! Rooms and auth: the token's hash, and the create code. PROTOCOL.md §1, §4.1.

/// Decodes a 43-character base64url token (no padding) to its 32 bytes and
/// returns `sha256` of those bytes. `None` when the token is malformed.
pub fn hash_token(token: &str) -> Option<[u8; 32]> {
    todo!("pack 1: decode and hash")
}

/// Constant-time comparison of a stored hash with a presented one.
pub fn hash_matches(stored: &[u8; 32], presented: &[u8; 32]) -> bool {
    todo!("pack 1: subtle::ConstantTimeEq")
}

/// Constant-time; always false when the relay has no create code.
pub fn create_code_matches(expected: Option<&str>, given: &str) -> bool {
    todo!("pack 1: constant-time create code check")
}

/// `^[A-Za-z0-9_-]{22}$`
pub fn valid_room_id(room: &str) -> bool {
    todo!("pack 1: room id shape")
}
