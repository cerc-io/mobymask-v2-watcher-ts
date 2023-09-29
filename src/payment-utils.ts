//
// Copyright 2023 Vulcanize, Inc.
//

import debug from 'debug';
import { providers } from 'ethers';

import { PaymentsManager } from '@cerc-io/util';
import { deepCopy } from '@ethersproject/properties';
import { fetchJson } from '@ethersproject/web';

const log = debug('vulcanize:payment-utils');

export async function setupProviderWithPayments (paidRPCMethods: string[], provider: providers.JsonRpcProvider, paymentsManager: PaymentsManager, paymentAmount: string): Promise<void> {
  // https://github.com/ethers-io/ethers.js/blob/v5.7.2/packages/providers/src.ts/json-rpc-provider.ts#L502
  provider.send = async (method: string, params: Array<any>): Promise<any> => {
    log(`Making RPC call: ${method}`);

    const request = {
      method: method,
      params: params,
      id: (provider._nextId++),
      jsonrpc: '2.0'
    };

    provider.emit('debug', {
      action: 'request',
      request: deepCopy(request),
      provider: provider
    });

    // We can expand this in the future to any call, but for now these
    // are the biggest wins and do not require any serializing parameters.
    const cache = (['eth_chainId', 'eth_blockNumber'].indexOf(method) >= 0);
    // @ts-expect-error copied code
    if (cache && provider._cache[method]) {
      return provider._cache[method];
    }

    // Send a payment to upstream Nitro node and add details to the request URL
    let updatedURL = `${provider.connection.url}?method=${method}`;
    if (paidRPCMethods.includes(method)) {
      const voucher = await paymentsManager.sendUpstreamPayment(paymentAmount);
      updatedURL = `${updatedURL}&channelId=${voucher.channelId}&amount=${voucher.amount}&signature=${voucher.signature}`;
    }

    const result = fetchJson({ ...provider.connection, url: updatedURL }, JSON.stringify(request), getResult).then((result) => {
      provider.emit('debug', {
        action: 'response',
        request: request,
        response: result,
        provider: provider
      });

      return result;
    }, (error) => {
      provider.emit('debug', {
        action: 'response',
        error: error,
        request: request,
        provider: provider
      });

      throw error;
    });

    // Cache the fetch, but clear it on the next event loop
    if (cache) {
      provider._cache[method] = result;
      setTimeout(() => {
        // @ts-expect-error copied code
        provider._cache[method] = null;
      }, 0);
    }

    return result;
  };
}

// https://github.com/ethers-io/ethers.js/blob/v5.7.2/packages/providers/src.ts/json-rpc-provider.ts#L139
function getResult (payload: { error?: { code?: number, data?: any, message?: string }, result?: any }): any {
  if (payload.error) {
    // @TODO: not any
    const error: any = new Error(payload.error.message);
    error.code = payload.error.code;
    error.data = payload.error.data;
    throw error;
  }

  return payload.result;
}
