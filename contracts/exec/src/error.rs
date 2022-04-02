use strum_macros::Display;

/// User-facing errors.
///
/// This maps error variants into error messages.
/// If a user makes use of some interface incorrectly,
/// this should be used with [`near_sdk::env::panic_str()`].
///
/// Otherwise, if some internal error occurred such that it would
/// indicate an internal bug, then `[panic!()]` should be used
/// as it prints line code information that would be useful for
/// debugging and fixing the problem.
#[derive(Debug, Display)]
pub enum Error {
    #[strum(serialize = "ERR_EXEC_ALREADY_INITIALIZED")]
    AlreadyInitialized,
    /// Tried to make a call for this contract itself.
    ///
    /// It's safer to disallow this since this could
    /// bypass some private function protection.
    ///
    /// Otherwise if it's necessary to call a private function,
    /// a specific interface with the correct checking should be
    /// added instead.
    #[strum(serialize = "ERR_EXEC_CALL_CURRENT")]
    CallCurrentAccount,
}

impl Error {
    /// Calls [`near_sdk::env::panic_str()`] with this error's message.
    pub fn panic(&self) -> ! {
        near_sdk::env::panic_str(&self.to_string())
    }
}
