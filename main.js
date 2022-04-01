import os from 'os';
import fs from 'fs';
import * as config from './config.js';
import User from './user.js';
import nearAPI from 'near-api-js';
const { connect, keyStores } = nearAPI;

async function main() {
  console.log("init");

  let rpc = getRpc(config.NETWORK_ID);
  let keyStore = getKeyStore();

  const EXEC_PREFIX = `exec`;
  const EXEC_CONTRACT = `${EXEC_PREFIX}.${config.CONTRACT_USER_FACTORY}`;
  const COUNTER_PREFIX = `counter`;
  const COUNTER_CONTRACT = `${COUNTER_PREFIX}.${config.CONTRACT_USER_FACTORY}`;

  if (config.MUST_DEPLOY) {
    const nearConfig = {
      networkId: config.NETWORK_ID,
      keyStore,
      nodeUrl: `https://rpc.${config.NETWORK_ID}.near.org`,
      walletUrl: `https://wallet.${config.NETWORK_ID}.near.org`,
      helperUrl: `https://helper.${config.NETWORK_ID}.near.org`,
      explorerUrl: `https://explorer.${config.NETWORK_ID}.near.org`,
    };
    // get a higher-level rpc interface
    console.log("making a high-level connection to the rpc");
    const near = await connect(nearConfig);

    // interface related to the userFactoryAccount
    // (i.e. the parent of all other accounts)
    console.log("preparing an interface for the user-factory acc");
    const userFactoryAccount = await near.account(config.CONTRACT_USER_FACTORY);

    let keyPair = await keyStore.getKey(config.NETWORK_ID, config.CONTRACT_USER_FACTORY);
    // const publicKey = keyPair.getPublicKey();

    // prepares an interface for the contract's methods
    const factory = new nearAPI.Contract(
      userFactoryAccount,
      config.CONTRACT_USER_FACTORY,
      {
        viewMethods: ["version"],
        changeMethods: ["new", "create_subaccount"],
        sender: userFactoryAccount,
      }
    );
    // initializes the user factory contract
    console.log("initializing the user-factory");
    await factory.new({}, 300000000000000, 0);
    console.log("user-factory version:");
    let factoryVersion = await factory.version();
    console.log(factoryVersion);


    console.log("setting key for the exec");
    // deploys and initializes the exec contract
    await keyStore.setKey(config.NETWORK_ID, EXEC_CONTRACT, keyPair);
    console.log("creating the exec acc");
    await factory.create_subaccount(
      {
        prefix: EXEC_PREFIX,
        yocto: "3000000000000000000000000"
      },
      "300000000000000",
      "3000000000000000000000000"
    );
    console.log("preparing an interface for the exec acc");
    const execAccount = await near.account(EXEC_CONTRACT);
    console.log("deploying the exec wasm");
    await execAccount.deployContract(fs.readFileSync(config.WASM_EXEC));
    let exec = new nearAPI.Contract(
      execAccount,
      EXEC_CONTRACT,
      {
        viewMethods: ["version"],
        changeMethods: ["new"],
        sender: execAccount,
      }
    );
    console.log("initializing the exec");
    await exec.new(
      {
        owner_id: EXEC_CONTRACT
      },
      "300000000000000",
      "0"
    );
    console.log(`exec version:`);
    let execVersion = await exec.version();
    console.log(execVersion);

    console.log("setting key for the counter");
    // deploys and initializes the counter contract
    await keyStore.setKey(config.NETWORK_ID, COUNTER_CONTRACT, keyPair);
    console.log("creating the counter acc");
    await factory.create_subaccount(
      {
        prefix: "counter",
        yocto: "3000000000000000000000000"
      },
      "300000000000000",
      "3000000000000000000000000"
    );
    console.log("preparing an interface for the counter acc");
    const counterAccount = await near.account(COUNTER_CONTRACT);
    console.log("deploying the counter wasm");
    await counterAccount.deployContract(fs.readFileSync(config.WASM_COUNTER));
    let counter = new nearAPI.Contract(
      counterAccount,
      COUNTER_CONTRACT,
      {
        viewMethods: ["version"],
        changeMethods: ["new"],
        sender: execAccount,
      }
    );
    console.log("initializing the counter");
    await counter.new({ nearapps_logger: EXEC_CONTRACT }, 300000000000000, 0);
    console.log(`counter version:`);
    let counterVersion = await counter.version();
    console.log(counterVersion);


    for (let i = 0; i < config.USER_LEN; i++) {
      let userPrefix = `u${i}`
      let userAcc = `${userPrefix}.${config.CONTRACT_USER_FACTORY}`;
      console.log(`setting key for the user ${userPrefix}`);
      await keyStore.setKey(config.NETWORK_ID, userAcc, keyPair);
      console.log(`creating the user ${userPrefix} acc`);
      await factory.create_subaccount(
        {
          prefix: userPrefix,
          yocto: "10000000000000000000000000"
        },
        "300000000000000",
        "10000000000000000000000000"
      );
    }
    console.log("finished deployment setup");
    return null;
  }

  let usersRun = [];
  for (let i = 0; i < config.USER_LEN; i++) {
    let userPrefix = `u${i}`
    let userAcc = `${userPrefix}.${config.CONTRACT_USER_FACTORY}`;
    console.log(`running for user ${userPrefix}`);
    let user = new User(userAcc, userPrefix);

    // constructs actions that will be passed to the
    // createTransaction method
    const actions = [
      nearAPI.transactions.functionCall(
        config.ACTION_METHOD,
        config.ACTION_ARGS,
        config.ACTION_GAS
      )
    ];

    let userRun = user.sendTxs(
      rpc,
      i,
      keyStore,
      config.NETWORK_ID,
      COUNTER_CONTRACT,
      actions,
      config.TX_LEN_PER_USER,
      config.TX_SLEEP,
      config.QUEUE_SIZE
    );
    usersRun.push(userRun);
  }
  console.log("awaiting for all users to finish")
  let failedTxs = await Promise.all(usersRun);

  console.log("checking for failed txs");
  for (let i = 0; i < config.USER_LEN; i++) {
    let userPrefix = `u${i}`
    console.log(`user ${userPrefix} had ${failedTxs[i].length} txs that failed`);
  }

  console.log("finished");
}

// get NEAR RPC connection
function getRpc(networkId) {
  console.log("making a low-level connection to the rpc");
  return new nearAPI.providers
    .JsonRpcProvider(`https://rpc.${networkId}.near.org`);
}

// get the local user's keys
function getKeyStore() {
  const homedir = os.homedir();
  const KEY_PATH = `${homedir}/.near-credentials`;
  return new keyStores.UnencryptedFileSystemKeyStore(KEY_PATH);
}


main();
