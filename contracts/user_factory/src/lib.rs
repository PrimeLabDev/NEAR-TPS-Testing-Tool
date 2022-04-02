use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, AccountId, Promise};

pub mod error;

pub use error::Error;

#[near_bindgen]
#[derive(Default, BorshDeserialize, BorshSerialize)]
pub struct UserFactory {}


#[near_bindgen]
impl UserFactory {

    /// Creates a new user sub-account on the current contract account.
    /// The account name will be automatically postfixed with the current
    /// contract account name.
    ///
    #[payable]
    pub fn create_subaccount(
        &mut self,
        prefix: AccountId,
        yocto: Option<U128>,
    ) -> Promise {
        let amount = yocto.unwrap_or(U128(1000000000000000000000000)).0;

        match env::attached_deposit() >= amount {
            true => (),
            false => near_sdk::env::panic_str(&Error::NotEnoughtDeposit.to_string()),
        }

        let owner_pk = env::signer_account_pk();
        let new_account = format!("{}.{}", &prefix, env::current_account_id());

        Promise::new(new_account.parse().unwrap())
            .create_account()
            .add_full_access_key(owner_pk)
            .transfer(amount)
    }
}
