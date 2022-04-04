# NEAR-TPS-Testing-Tool

# Utility to perform TPS load testing on NEAR Protocol

## About

### Why (is this needed):

- With the primary performance bottleneck being experienced within the NEAR ecosystem being reliable communication with RPC nodes, the most important step to solve the issue is being able to reliably re-create the problem utilizing a method that produces easily quantifiable results.

### Who (would this benefit):

- Engineers are able to benchmark the performance of the contract based protocols
- Engineers are able to utilize the library to fish out any bottlenecks within their current implementation
- Engineers working on the underlying protocol have a reproducible integration test case when working on the node communication & transaction processing layers of NEAR

### How (does this achieve a solution):

1. The first steps taken by this utility involve instantiating a collection of contracts and user accounts
    1. There will be a base contract that houses the underlying method being tested (the default contract is the counter contract)
    2. There will also be an executor contract that will be in charge of proxying the calls to the underlying contract utilizing the created sub-accounts
    3. The utility will also create a number of accounts that will be signing the transactions being sent to the underlying contract. You can modify these values within the `config.json` file
2. The remaining steps of this utility involve the process of actually sending the transactions into a queue to be put on chain
    1. While the utility awaits responses from the RPC node it inserts any failed transactions into an array to be returned back to user once it has completed it’s current iterations

## Prerequisites

- The current version of [Node.js](https://nodejs.org/). >=v14.0.0 with NPM installed
- Assumes developer has previous experience with NEAR & has the [NEAR CLI](https://github.com/near/near-cli#setup) installed

## File Tree

```
├── config.js          // Contains configuration settings for running the utility
├── contracts          // Directory that contains the code for the smart contracts
│   ├── exec           // Source code for the executor contract
│   │  ├── Cargo.lock
│   │  ├── Cargo.toml
│   │  └── src
│   │      ├── error.rs
│   │      └── lib.rs
│   ├── user_factory   // Source code for the user_factory contract
│   │   ├── Cargo.lock
│   │   ├── Cargo.toml
│   │   └── src
│   │       ├── error.rs
│   │       └── lib.rs
│   └── res            // Directory containing the compiled .wasm contracts
│       ├── counter.wasm
│       ├── exec.wasm
│       └── user_factory.wasm
├── sleep.js           // Helper promise timeout function
├── tx.js              // Helper class to handle transactions
├── user.js            // Helper class to handle user account management
├── main.js            // Contains the root function utilized in the utility
├── package.json
├── package-lock.json
├── README.md
└── LICENSE.md

```

## Setup

- The contract being utilized:
    - `user_factory`: Used to create the necessary sub-accounts for the contracts to be deployed and the mock users sending out transactions. ([related NEAR documentation](https://www.near-sdk.io/promises/deploy-contract))
    - `exec`: Used to proxy calls to the contract being called.
    - `counter`: The contract that will be utilized to receive transactions. (e.g. [NEAR's Rust counter contract](https://github.com/near-examples/rust-counter/tree/master/contract))
1. Install node dependencies by running:

    ```bash
    npm i
    ```

2. Before we start we need to deploy the `user_factory` contract. Use [NEAR CLI](https://github.com/near/near-cli#setup) to run the `dev-deploy` command to deploy a clean/new `user_factory.wasm` contract.
   In case of any failure, you can pass the `--force` flag to the `dev-deploy` command.

    ```bash
    near dev-deploy --wasmFile=contracts/res/user_factory.wasm
    ```

3. Update the values on `config.js`.
    - `CONTRACT_USER_FACTORY` is the deployed account ID from step 2 (`dev-deploy`, e.g. `dev-1648940480026-11312641307000` ).
    - `MUST_DEPLOY` should be `true` for the first run ([initialization run](https://www.notion.so/TPS-Testing-Tool-b628a07d69f7413ea5e545cf53c48258)), and `false` otherwise ([broadcast run](https://www.notion.so/TPS-Testing-Tool-b628a07d69f7413ea5e545cf53c48258)).
    - `USER_LEN` is how many users will be deployed/used to create transactions.
    - `TOTAL_TX_LEN` is how many transactions, in total, will be made.
    - Please check other options in that file that can still be configured.

## Run

### Initialization Run

The first run is used only for the initialization of the users and contracts. This is implied when `MUST_DEPLOY` is `true` within the `config.js` file.

```bash
node main.js
```

Suggestion: You can create a large number of users (e.g. `USER_LEN` set to `10`), even if you're not intending to use all of them. Then after this "init" step, you can decrease `USER_LEN` to a lower value (e.g. `1`) and later on you can increase that number up to `10`, as they all were already configured.

After this, you should set `MUST_DEPLOY` to `false`.

### Broadcast Run

This is for when the users are already configured, and you now can broadcast transactions.

```bash
node main.js
```

Suggestion: You can still edit how the delay and queue values are set up in `config.js`.

If you need to change some configuration, it's generally easier to redeploy the user_factory contract and go back to the `Setup` step.

## Output

Suggestion: You can append  `2>&1 | tee out.js` to also output into a file.

On "Broadcast" runs, each user will start creating transactions to broadcast and then await for their result.

A transaction is considered "alive" when it has been broadcasted, and when the user is awaiting for it's "status" (eg. Success, etc).

Note that the RPC call used for this "status" waiting will also wait for *every other* call created by that transaction, so if the method called creates yet other external contract calls (eg. logging, transfers, etc.) then the RPC will only respond when *all* of those created calls are finished.

When preparing a transaction to be sent, each user will have a small delay to increase the chance that the messages will reach the RPC in an ordered manner, and to decrease the chances of flooding the RPC.

Transactions that arrive at the RPC/validators out-of-order can prevent other transactions from being accepted because their order sets their n-once value and this matters for their acceptance.
e.g.

- If 10 transactions get received in the opposite order that they were sent, then only the last one will be accepted and all others will be ignored, since the last one sent (that arrived first) has a higher n-once value and thus this will prevent the others transactions, of lower n-once values, to be accepted.

Each user has a queue that limits how many in-flight transactions it can have. If the queue is relatively full, the user will wait before trying to broadcast new transactions.

When waiting for the transaction results, the user will apply heuristics for deciding if it will retry waiting, or if it will give it up, and so on.

Failed transactions are inserted in a list, which is collected at the end and the quantity of those is shown.

When a successful result is received, information such as its value, and its explorer link are shown. After this, such transaction is no longer living and that user's queue is decreased.

The main program will wait for all users to finish broadcasting and for all of their transaction results.

With the standard settings, it's expected that around *20 tx/s* at a *90% tx success rate* will happen.
