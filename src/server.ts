//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import { ethers } from 'ethers';

import { ServerCmd } from '@cerc-io/cli';

import { utils } from '@cerc-io/nitro-client';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { createMessageToL2Handler, parseLibp2pMessage } from './libp2p-utils';
import contractAddresses from './nitro-addresses.json';
import { Config, PaymentsManager, getConfig } from '@cerc-io/util';
import { Peer } from '@cerc-io/peer';

import { RatesConfig } from './config';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  let nitroPaymentsManager: PaymentsManager | undefined;
  let p2pMessageHandler = parseLibp2pMessage;

  const { enablePeer, peer: { enableL2Txs, l2TxsConfig }, nitro: { payments } } = serverCmd.config.server.p2p;

  if (enablePeer) {
    const ratesConfig: RatesConfig = await getConfig(payments.ratesFile);
    nitroPaymentsManager = new PaymentsManager(payments, ratesConfig);

    if (enableL2Txs) {
      assert(l2TxsConfig);
      const wallet = new ethers.Wallet(l2TxsConfig.privateKey, serverCmd.ethProvider);
      p2pMessageHandler = createMessageToL2Handler(wallet, l2TxsConfig, nitroPaymentsManager);
    }
  }

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  await serverCmd.exec(createResolvers, typeDefs, p2pMessageHandler, nitroPaymentsManager);

  if (enablePeer) {
    assert(serverCmd.peer);
    assert(nitroPaymentsManager);

    const nitro = await setupNitro(serverCmd.config, serverCmd.peer);
    log(`Nitro client started with address: ${nitro.client.address}`);

    // Start subscription for payment vouchers received by the client
    nitroPaymentsManager.subscribeToVouchers(nitro.client);
  }
};

const setupNitro = async (config: Config, peer: Peer): Promise<utils.Nitro> => {
  const {
    server: {
      p2p: {
        nitro
      }
    },
    upstream: {
      ethServer: {
        rpcProviderEndpoint
      }
    }
  } = config;

  return utils.Nitro.setupClient(
    nitro.privateKey,
    rpcProviderEndpoint,
    nitro.chainPrivateKey,
    contractAddresses,
    peer,
    path.resolve(nitro.store)
  );
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
