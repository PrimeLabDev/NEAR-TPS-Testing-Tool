import nearAPI from 'near-api-js';
import PQueue from 'p-queue';
import sleep from './sleep.js'
import Tx from './tx.js';

class User {
  /**
  * Creates a new user.
  * @param  {String} accountId The AccountId of the user
  * @param  {String} nickname Used for logging, defaults to 
  * the accountId.
  */
  constructor(accountId, nickname = null) {
    this.accountId = accountId;
    this.nickname = nickname || accountId;
  }

  // sendTxs(rpc, userIndex, keyStore, NETWORK_ID, TX_LEN / USER_LEN, (800 * USER_LEN) / 30)

  // TODO: make it so it can deduce the network's "quality",
  // which could be used to adapt targets. Eg. if it's too
  // congestioned and the failure rate is too high, it could
  // try lowering the tx rate.
  //
  // TODO: make it so the "recent blockhash" (info necessary to 
  // build the txs) is refreshed before the 24h deadline, when 
  // that blockhash will start being rejected by the network 
  /**
  * Makes the user send txs to the contract.
  * @param  {nearAPI.providers.JsonRpcProvider} rpc The RPC 
  * connection to interact with the NEAR blockchain.
  * @param  {nearAPI.keyStores.UnencryptedFileSystemKeyStore} keyStore Key info and signature provider.
  * @param  {String} networkId The NetworkID, such as 'testnet'.
  * @param  {String} contract The contract's AccountID that is 
  * being called.
  * @param  {nearAPI.transactions.Action[]} actions The actions 
  * that will be batched together in this tx. 
  * Eg. transfers, account creations, function calls.
  * @param  {Number} txsLen How many txs this user should send.
  * @param  {Number} txSleep Delay in ms for sending new txs.
  * 
  * Each tx must have a nonce value, which increases for each 
  * tx. But txs of higher nonces values invalidates txs of lower 
  * nonce values that arrives after them. So the delay helps txs 
  * to arrive in-order, since the txs are sent optimistically, 
  * ie. we don't wait for the rpc response to send the next tx.
  * 
  * When choosing the delay, consider the blocktime of 
  * 700-1000ms, and also consider that only 20-36 txs will be 
  * able to get included in each block in total (this is based 
  * on tests). So if you have more users, you should consider 
  * increasing the delay that each one has.
  * 
  * For 1 user, you may consider using 20ms, which should
  * result in 27 tx/s, with a success rate of 75%.
  * In any case, it's recommended to use a value
  * higher than 7ms.
  * @param  {Number} queueSize How many in-flight txs are 
  * allowed to exist simultaneously.
  * 
  * Txs usually take 3 or more blocks to get to completion 
  * because they usually emit receipts and also must return 
  * extra gas, and so on. So a tx that is "alive" is 
  * not necessarily on the first block, it may have unfinished 
  * execution logic that will happen in later blocks.
  * So this is why the number of in-flight txs can be
  * 3-10x higher than the number of txs that can 
  * actually enter a single block.
  * So for a 20tx/s rate, with txs that take 3 blocks 
  * to complete, a queue size of 80 should be good.
  * 
  * As the queue gets filled up, extra delays are added to try
  * to prevent overload, but the values are test-driven.
  */
  async sendTxs(rpc, userIndex, keyStore, networkId, contract, actions, txsLen, txSleep, queueSize) {
    const user = this.accountId;
    const nick = this.nickname;
    console.log(`setting up user ${nick}`);

    let keyPair = await keyStore.getKey(networkId, user);
    const publicKey = keyPair.getPublicKey();
    // console.log(keyStore);

    // gets user's public key information from NEAR blockchain 
    const accessKey = await rpc.query(
      `access_key/${user}/${publicKey.toString()}`, ''
    );
    // this block hash can only be used for the next 24hours
    const recentBlockHash = nearAPI.utils.serialize.base_decode(accessKey.block_hash);

    // the user's last used nonce registered on the blockchain
    let initialNonce = accessKey.nonce;

    // allows to new transactions to be awaited to completion
    let queue = new PQueue({ concurrency: queueSize });

    // list of failed transactions.
    // TODO: retry sending them with a higher nonce?
    // (should re-sign them as well)
    let failedTxs = [];


    let txRequests = [];
    for (let i = 0; i < txsLen; i++) {
      // sleep so txs tend to go in-order
      await sleep(txSleep);
      console.log(`user ${nick} will prepare a new tx`);

      // creates a tx and awaits for it's completion,
      // and then logs it's info
      let txRequest = (async () => {

        let expectedTxHash = null;
        let nonceDiff = i + 1;

        // creates a new tx and gets it's results
        let task = (async () => {
          let nonce = ++accessKey.nonce;

          let tx = new Tx(nearAPI.transactions.createTransaction(
            user,
            publicKey,
            contract,
            nonce,
            actions,
            recentBlockHash
          ), userIndex, nonceDiff);
          await tx.broadcast(rpc, keyPair);
          expectedTxHash = tx.hash;

          console.log(`user ${nick} broadcasted tx: ${expectedTxHash} (nonce: ${initialNonce} + ${nonceDiff})`);

          // wait for some time before start asking for the 
          // transaction's results
          await sleep(1 * 400);

          let res = await tx.getResult(rpc, user, nick);

          if (res === undefined) {
            failedTxs.push(tx);
          }

          return res
        });

        // adds the tx broadcast and result awaiting into the
        // queue
        let res = await queue.add(() => task());

        // info printing
        if (res) {
          let status = JSON.stringify(res.status);
          let hash = res.transaction.hash;
          let block = res.transaction_outcome.block_hash;
          console.log(`tx: https://explorer.${networkId}.near.org/transactions/${hash}; block: https://explorer.${networkId}.near.org/blocks/${block}; \nstatus: ${status}; nonce diff: ${nonceDiff}`);
        } else {
          console.log(`tx (expected): https://explorer.${networkId}.near.org/transactions/${expectedTxHash}; block: unknown; \nstatus: unknown; nonce diff: ${nonceDiff}`);
        }

        return null;
      })(); // end of tx send and result gathering
      txRequests.push(txRequest);

      // in here we finished broadcasting and getting a tx's
      // result, so we prepare to get an additional tx in the 
      // next loop iteration

      // if the queue is 90%+ full, await for a while
      let total = queue.pending + queue.size;
      while (total >= (queueSize * 9) / 10) {
        // console.log(`awaiting.. (${total})`);
        await sleep(100);
        total = queue.pending + queue.size;
      }
      // alternatively:
      // await queue.onSizeLessThan(1);
      // this will await when the queue is already full

      // if the queue is 70%+ full, await for a while
      if (total >= (queueSize * 7) / 10) {
        await sleep(txSleep);
      }
    } // end of tx sending loop

    // await until all requests finished
    console.log(`user ${nick} has finished the tx broadcasting setup, it's now awaiting for all of their completion`);
    await Promise.allSettled(txRequests);

    return failedTxs;
  }
}

export default User;
