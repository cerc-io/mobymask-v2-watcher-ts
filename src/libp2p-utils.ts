//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { ethers, Signer } from 'ethers';

import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import { PaymentsManager } from '@cerc-io/util';
import { utils as nitroUtils } from '@cerc-io/nitro-client';

import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';
import { ChainTransactionRates } from './config';

const log = debug('vulcanize:libp2p-utils');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

const DEFAULT_GAS_LIMIT = 500000;

const DEFAULT_CHAIN_TX_COST = 100;

export function createMessageToL2Handler (
  signer: Signer,
  { contractAddress, gasLimit }: {
    contractAddress: string,
    gasLimit?: number
  },
  paymentsManager: PaymentsManager,
  txRates: ChainTransactionRates
) {
  return (peerId: string, data: any): void => {
    log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);
    sendMessageToL2(signer, { contractAddress, gasLimit }, data, paymentsManager, txRates);
  };
}

export async function sendMessageToL2 (
  signer: Signer,
  { contractAddress, gasLimit = DEFAULT_GAS_LIMIT }: {
    contractAddress: string,
    gasLimit?: number
  },
  data: any,
  paymentsManager: PaymentsManager,
  chainTxRates: ChainTransactionRates
): Promise<void> {
  // Message envelope includes the payload as well as a payment (to, vhash, vsig)
  const {
    payload: { kind, message },
    payment
  } = data;

  if (!paymentsManager.clientAddress) {
    log('Ignoring payload, payments manager not subscribed to vouchers yet');
    return;
  }

  // Ignore if the payload is not meant for us
  if (payment.to === paymentsManager.clientAddress) {
    log('Ignoring payload not meant for this client');
    return;
  }

  // Retrieve sender address
  const signerAddress = nitroUtils.getSignerAddress(payment.vhash, payment.vsig);

  // Get the configured chain tx cost
  let chainTxCost: bigint;
  if (kind in chainTxRates) {
    chainTxCost = BigInt(chainTxRates[kind as 'invoke' | 'revoke'] ?? DEFAULT_CHAIN_TX_COST);
  } else {
    log(`Unknown libp2p message kind: ${kind}`);
    log(JSON.stringify(message, null, 2));
    return;
  }

  // Check for payment voucher received from the sender Nitro account
  const paymentVoucherRecived = await paymentsManager.authenticatePayment(payment.vhash, signerAddress, chainTxCost);

  if (!paymentVoucherRecived) {
    log(`Rejecting tx request from ${signerAddress}, payment voucher not received`);
    return;
  }

  log(`Serving a paid tx request for ${signerAddress}`);

  const contract = new ethers.Contract(contractAddress, PhisherRegistryABI, signer);
  let receipt: TransactionReceipt | undefined;

  try {
    switch (kind) {
      case MESSAGE_KINDS.INVOKE: {
        const signedInvocations = message;

        const transaction: TransactionResponse = await contract.invoke(
          signedInvocations,
          // Setting gasLimit as eth_estimateGas call takes too long in L2 chain
          { gasLimit }
        );

        receipt = await transaction.wait();

        break;
      }

      case MESSAGE_KINDS.REVOKE: {
        const { signedDelegation, signedIntendedRevocation } = message;

        const transaction: TransactionResponse = await contract.revokeDelegation(
          signedDelegation,
          signedIntendedRevocation,
          // Setting gasLimit as eth_estimateGas call takes too long in L2 chain
          { gasLimit }
        );

        receipt = await transaction.wait();

        break;
      }

      default: {
        log(`Handler for libp2p message kind ${kind} not implemented`);
        log(JSON.stringify(message, null, 2));
        break;
      }
    }

    if (receipt) {
      log(`Transaction receipt for ${kind} message`, {
        to: receipt.to,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        transactionHash: receipt.transactionHash,
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        gasUsed: receipt.gasUsed.toString()
      });
    }
  } catch (error) {
    log(error);
  }
}

export function parseLibp2pMessage (peerId: string, data: any): void {
  log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);

  // Message envelope includes the payload
  const {
    payload: { kind, message }
  } = data;

  switch (kind) {
    case MESSAGE_KINDS.INVOKE: {
      _parseInvocation(message);
      break;
    }

    case MESSAGE_KINDS.REVOKE: {
      _parseRevocation(message);
      break;
    }

    default: {
      log(`libp2p message of unknown kind ${kind}`);
      log(JSON.stringify(message, null, 2));
      break;
    }
  }

  log('------------------------------------------');
}

export const getCurrentTime = (): string => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
};

function _parseInvocation (msg: any): void {
  log('Signed invocations:');
  log(JSON.stringify(msg, null, 2));

  const [{ invocations: { batch: invocationsList } }] = msg;
  Array.from(invocationsList).forEach((invocation: any) => {
    const txData = invocation.transaction.data;
    const decoded = contractInterface.parseTransaction({ data: txData });

    log(`method: ${decoded.name}, value: ${decoded.args[0]}`);
  });
}

function _parseRevocation (msg: any): void {
  const { signedDelegation, signedIntendedRevocation } = msg;
  log('Signed delegation:');
  log(JSON.stringify(signedDelegation, null, 2));
  log('Signed intention to revoke:');
  log(JSON.stringify(signedIntendedRevocation, null, 2));
}
