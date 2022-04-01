import nearAPI from 'near-api-js';
import sha256 from 'js-sha256';
import { latestNonceDiffs } from "./config.js";
import sleep from './sleep.js'

class Tx {

  /**
  * Stores a created transaction.
  * @param  {nearAPI.transactions.Transaction} tx The 
  * @param  {number} userIndex The user index that is sending 
  * this tx.
  */
  constructor(tx, userIndex, nonceDiff) {
    this.tx = tx;
    this.hash = null;
    this.userIndex = userIndex;
    this.nonceDiff = nonceDiff;
  }

  /**
  * Broadcasts the transaction. Result is stored in `hash`.
  * @param  {nearAPI.utils.key_pair.KeyPair} keyPair Used to 
  * sign the transaction.
  */
  async broadcast(rpc, keyPair) {
    // borsh serialize, sha256 hash and signs the tx
    const signedTransaction = (() => {
      const serializedTx = nearAPI.utils.serialize.serialize(
        nearAPI.transactions.SCHEMA,
        this.tx
      );
      const serializedTxHash = new Uint8Array(sha256.sha256.array(serializedTx));
      const signature = keyPair.sign(serializedTxHash);
      return new nearAPI.transactions.SignedTransaction({
        transaction: this.tx,
        signature: new nearAPI.transactions.Signature({
          keyType: this.tx.publicKey.keyType,
          data: signature.signature
        })
      });
    })();

    // broadcasts and sets the tx hash
    try {
      // encodes to serialized Borsh
      const signedSerializedTx = signedTransaction.encode();
      // sends via rpc
      const txHash = await rpc.sendJsonRpc(
        // this broadcasts the tx and only gets it's hash
        'broadcast_tx_async',

        // this broadcasts and awaits for it's results
        // 'broadcast_tx_commit',

        // params
        [Buffer.from(signedSerializedTx).toString('base64')]
      );
      this.hash = txHash;
    } catch (error) {
      console.log(error);
      this.hash = null;
    }
  }

  async getResult(rpc, sender, nickname) {
    // track whether the error is about the tx not "existing", 
    // which can be the case when it's still executing
    let txDoesntExist = false;

    let lastError = null;

    const nonceDiff = this.nonceDiff;
    const userIndex = this.userIndex;

    // tries for a few times to get the tx results, before
    // giving it up
    for (let trials = 0; trials < 10; trials++) {
      try {
        const result = await rpc.sendJsonRpc(
          // awaits for the tx result, but there could be
          // incompleted background calls
          // 'tx',

          // awaits for the tx result, and also for the background 
          // calls to complete
          'EXPERIMENTAL_tx_status',

          // params
          [this.hash, sender]
        );

        // informs how many times it was re-tried,
        // in case it was retried
        if (trials != 0) {
          console.log(`tx ${this.hash} retried ${trials} times`);
        }

        while (true) {
          // console.log("a");
          const latestNonceDiff = Atomics.load(latestNonceDiffs, userIndex);
          if (latestNonceDiff < nonceDiff) {
            Atomics.compareExchange(latestNonceDiffs, userIndex, latestNonceDiff, nonceDiff);
            continue;
          } else {
            break;
          }
        }

        return result;
      } catch (error) {

        lastError = error;

        // in case of error, tries to check if it was for the
        // tx not "existing". This is unfortunately done by
        // matching against a message description

        let re = /\[-32000\].* Transaction .* doesn't exist/;

        let msg = error && error.message;

        if (msg) {
          txDoesntExist = re.test(msg);
          if (txDoesntExist) {
            // will await for a while and then continue
          } else {
            console.log("unknown error message");
            console.log(msg);
            break;
          }
        } else {
          console.log("unknown error type");
          break;
        }

        const latestNonceDiff = Atomics.load(latestNonceDiffs, userIndex);
        if (
          latestNonceDiff > nonceDiff
          // also avoids making this check too early
          && trials > 6
        ) {
          // should give up this tx if it's nonce is too low
          // already
          break;
        }

        await sleep(400);
        continue;
      }
    } // break of the loop

    // in here, we gave up on waiting for the tx

    let message;
    if (txDoesntExist) {
      const latestNonceDiff = Atomics.load(latestNonceDiffs, userIndex);
      if (latestNonceDiff > nonceDiff) {
        message = `INFO: giving up on transaction ${this.hash}, it's nonce is already too low.`;
      } else {
        message = `WARNING: giving up on transaction ${this.hash}, but it could still have been executed.`;
        // we gave up retrying, but the tx (or other actions 
        // spawmed by it) could still be in execution. To confirm 
        // that it is not, it's necessary to verify if i'ts still
        // considered as inexistent and check if there is a newer
        // nonce value that _is_ present in the NEAR blockchain.
        //
        // this is because a lower nonce cannot appear _after_
        // a higher one, so only then we can be certain that this
        // tx is invalid.
      }
    } else {
      message = `ERROR: giving up on transaction ${this.hash}`;
      console.log(error);
    }
    console.log(`${message}. user: ${nickname}`);
    return undefined;
  }
}


export default Tx;