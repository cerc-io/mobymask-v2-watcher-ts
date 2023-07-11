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

// TODO: Publish package
import {
  P2PMessageService,
  Client,
  EthChainService,
  PermissivePolicy,
  DurableStore

} from '@cerc-io/nitro-client';
// TODO: Publish package
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

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  let p2pMessageHandler = parseLibp2pMessage;
  const { enableL2Txs, l2TxsConfig } = serverCmd.config.server.p2p.peer;

  if (enableL2Txs) {
    assert(l2TxsConfig);
    const wallet = new ethers.Wallet(l2TxsConfig.privateKey, serverCmd.ethProvider);
    p2pMessageHandler = createMessageToL2Handler(wallet, l2TxsConfig);
  }

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  await serverCmd.exec(createResolvers, typeDefs, p2pMessageHandler);
  await setupNitro(serverCmd);
};

const setupNitro = async (serverCmd: ServerCmd): Promise<Client | undefined> => {
  const {
    server: {
      p2p: {
        enablePeer,
        nitro
      }
    },
    upstream: {
      ethServer: {
        rpcProviderEndpoint
      }
    }
  } = serverCmd.config;

  if (!enablePeer) {
    return;
  }

  // TODO: Use serverCmd.peer private key for nitro-client?
  const store = DurableStore.newDurableStore(hex2Bytes(nitro.privateKey), path.resolve(nitro.store));
  assert(serverCmd.peer);
  const msgService = await P2PMessageService.newMessageService(store.getAddress(), serverCmd.peer);

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
