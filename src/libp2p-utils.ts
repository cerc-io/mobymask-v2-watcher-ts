//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { ethers, Signer } from 'ethers';
import assert from 'assert';

import { TransactionReceipt, TransactionResponse } from '@ethersproject/providers';
import { PaymentsManager, Consensus } from '@cerc-io/util';
import { utils as nitroUtils } from '@cerc-io/nitro-node';

import { abi as PhisherRegistryABI } from './artifacts/PhisherRegistry.json';

const log = debug('vulcanize:libp2p-utils');

const contractInterface = new ethers.utils.Interface(PhisherRegistryABI);

const MESSAGE_KINDS = {
  INVOKE: 'invoke',
  REVOKE: 'revoke'
};

const DEFAULT_GAS_LIMIT = 500000;

export function createMessageToL2Handler (
  signer: Signer,
  { contractAddress, gasLimit }: {
    contractAddress: string,
    gasLimit?: number
  },
  paymentsManager: PaymentsManager,
  consensus: Consensus
) {
  return async (peerId: string, data: any): Promise<void> => {
    log(`[${getCurrentTime()}] Received a message on mobymask P2P network from peer:`, peerId);

    // Message envelope includes the payload as well as a payment (vhash, vsig)
    const { payload, payment } = data;

    // TODO: Check payment status before sending tx to l2
    await handlePayment(paymentsManager, payment, payload.kind);

    sendMessageToL2(consensus, signer, { contractAddress, gasLimit }, payload);
  };
}

export async function handlePayment (
  paymentsManager: PaymentsManager,
  payment: { vhash: string, vsig: string },
  requestKind: string
): Promise<boolean> {
  assert(paymentsManager.clientAddress);

  // Retrieve sender address
  const signerAddress = nitroUtils.getSignerAddress(payment.vhash, payment.vsig);

  // Get the configured mutation cost
  const mutationRates = paymentsManager.mutationRates;
  if (requestKind in mutationRates) {
    const configuredMutationCost = BigInt(mutationRates[requestKind as string]);

    // Check for payment voucher received from the sender Nitro account
    const [paymentVoucherReceived, paymentError] = await paymentsManager.authenticatePayment(payment.vhash, signerAddress, configuredMutationCost);

    if (!paymentVoucherReceived) {
      // log(`Rejecting a mutation request from ${signerAddress}: ${paymentError}`);
      log(paymentError);
      return false;
    }

    // log(`Serving a paid mutation request for ${signerAddress}`);
    log(`Payment received for a mutation request from ${signerAddress}`);
    return true;
  } else {
    // Serve a mutation request for free if rate is not configured
    // log(`Mutation rate not configured for "${requestKind}", serving a free mutation request to ${signerAddress}`);
    log(`Mutation rate not configured for "${requestKind}"`);
    return true;
  }
}

export async function sendMessageToL2 (
  consensus: Consensus,
  signer: Signer,
  { contractAddress, gasLimit = DEFAULT_GAS_LIMIT }: {
    contractAddress: string,
    gasLimit?: number
  },
  data: any
): Promise<void> {
  const { kind, message } = data;

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
