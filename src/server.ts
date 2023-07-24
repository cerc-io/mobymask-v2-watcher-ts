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

import {
  P2PMessageService,
  Client,
  EthChainService,
  PermissivePolicy,
  DurableStore
} from '@cerc-io/nitro-client';
import { hex2Bytes } from '@cerc-io/nitro-util';

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { createMessageToL2Handler, parseLibp2pMessage } from './libp2p-utils';
import {
  nitroAdjudicatorAddress,
  virtualPaymentAppAddress,
  consensusAppAddress
} from './nitro-addresses.json';
import { Config, PaymentsManager } from '@cerc-io/util';
import { Peer } from '@cerc-io/peer';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  let p2pMessageHandler = parseLibp2pMessage;
  const { enablePeer, peer: { enableL2Txs, l2TxsConfig } } = serverCmd.config.server.p2p;

  if (enableL2Txs) {
    assert(l2TxsConfig);
    const wallet = new ethers.Wallet(l2TxsConfig.privateKey, serverCmd.ethProvider);
    p2pMessageHandler = createMessageToL2Handler(wallet, l2TxsConfig);
  }

  let nitroPaymentsManager: PaymentsManager | undefined;
  if (enablePeer) {
    nitroPaymentsManager = new PaymentsManager();
  }

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  await serverCmd.exec(createResolvers, typeDefs, p2pMessageHandler, nitroPaymentsManager);

  if (enablePeer) {
    assert(serverCmd.peer);
    assert(nitroPaymentsManager);

    const client = await setupNitro(serverCmd.config, serverCmd.peer);
    log(`Nitro client started with address: ${client.address}`);

    // Start subscription for payment vouchers received by the client
    nitroPaymentsManager.subscribeToVouchers(client);
  }
};

const setupNitro = async (config: Config, peer: Peer): Promise<Client> => {
  // TODO: Use Nitro class from ts-nitro
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

  // TODO: Use serverCmd.peer private key for nitro-client?
  const store = DurableStore.newDurableStore(hex2Bytes(nitro.privateKey), path.resolve(nitro.store));
  const msgService = await P2PMessageService.newMessageService(store.getAddress(), peer);

  const chainService = await EthChainService.newEthChainService(
    rpcProviderEndpoint,
    nitro.chainPrivateKey,
    nitroAdjudicatorAddress,
    consensusAppAddress,
    virtualPaymentAppAddress
  );

  return Client.new(
    msgService,
    chainService,
    store,
    undefined,
    new PermissivePolicy()
  );
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
