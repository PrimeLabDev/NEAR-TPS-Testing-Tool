use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedSet;
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise};

pub mod error;

use error::Error;

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Executor {}


#[near_bindgen]
impl Executor {
    /// Executes an external contract's function
    #[payable]
    pub fn execute(
        &mut self,
        contract_id: AccountId,
        method_name: String,
        args: String,
    ) -> Promise {
        // makes sure it won't call an internal private function
        match contract_id != env::current_account_id() {
            true => (),
            false => near_sdk::env::panic_str(&Error::CallCurrentAccount.to_string()),
        }

        Promise::new(contract_id).function_call(
            method_name,
            args.as_bytes().to_vec(),
            env::attached_deposit(),
            env::prepaid_gas() / 3,
        )
    }
}
