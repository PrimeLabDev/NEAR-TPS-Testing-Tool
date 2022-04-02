const CONTRACT_USER_FACTORY = '';
const NETWORK_ID = 'testnet';
const MUST_DEPLOY = true;

// how many users will be firing tx requests
const USER_LEN = 1;
// how many request are going to be made
const TOTAL_TX_LEN = 100;
const TX_LEN_PER_USER = Math.floor(TOTAL_TX_LEN / USER_LEN);
const TX_SLEEP = Math.floor((800 * USER_LEN) / 30);
// maximum amount of in-flight tx per user
const QUEUE_SIZE = Math.floor((30 * 3) / USER_LEN);
//
const WASM_EXEC = 'exec.wasm';
const WASM_COUNTER = 'counter.wasm';
// the method that will be called on `CONTRACT_WASM`
const ACTION_METHOD = 'increment';
const ACTION_ARGS = {};
const ACTION_GAS = 50000000000000;

// no need to chage what's below

// tracks which is the latest block-confirmed tx nonce per user.
// This can be used since tx that comes later and has a lower
// nonce than before cannot be accepted into the blockchain
const _latestNonceDiffs = new SharedArrayBuffer(32 * USER_LEN);
let latestNonceDiffs = new Uint32Array(_latestNonceDiffs);

export {
  NETWORK_ID,
  CONTRACT_USER_FACTORY,
  MUST_DEPLOY,
  USER_LEN,
  TOTAL_TX_LEN,
  TX_LEN_PER_USER,
  TX_SLEEP,
  QUEUE_SIZE,
  WASM_EXEC,
  WASM_COUNTER,
  ACTION_METHOD,
  ACTION_ARGS,
  ACTION_GAS,
  latestNonceDiffs
};
