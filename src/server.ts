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

import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { createMessageToL2Handler, parseLibp2pMessage } from './libp2p-utils';
import {
  nitroAdjudicatorAddress,
  virtualPaymentAppAddress,
  consensusAppAddress
} from './nitro-addresses.json';
import { PaymentsManager, getConfig } from '@cerc-io/util';

import { RatesConfig } from './config';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  // Initialize / start the p2p nodes
  const [, peer] = await serverCmd.initP2P();

  // Initialize / start the Nitro node
  const nitro = await serverCmd.initNitro({
    nitroAdjudicatorAddress,
    consensusAppAddress,
    virtualPaymentAppAddress
  });

  // Initialize / start the consensus engine
  const consensus = await serverCmd.initConsensus();

  let nitroPaymentsManager: PaymentsManager | undefined;
  const { enablePeer, peer: { enableL2Txs, l2TxsConfig, pubSubTopic }, nitro: { payments } } = serverCmd.config.server.p2p;

  if (enablePeer) {
    assert(peer);
    assert(nitro);

    // Setup the payments manager if peer is enabled
    const ratesConfig: RatesConfig = await getConfig(payments.ratesFile);
    nitroPaymentsManager = new PaymentsManager(payments, ratesConfig);

    // Start subscription for payment vouchers received by the client
    nitroPaymentsManager.subscribeToVouchers(nitro);

    // Register the pubsub topic handler
    let p2pMessageHandler = parseLibp2pMessage;

    // Send L2 txs for messages if enabled
    if (enableL2Txs) {
      assert(l2TxsConfig);
      const wallet = new ethers.Wallet(l2TxsConfig.privateKey, serverCmd.ethProvider);
      p2pMessageHandler = createMessageToL2Handler(wallet, l2TxsConfig, nitroPaymentsManager, consensus);
    }

    peer.subscribeTopic(pubSubTopic, (peerId, data) => {
      p2pMessageHandler(peerId.toString(), data);
    });
  }

  const typeDefs = fs.readFileSync(path.join(__dirname, 'schema.gql')).toString();
  await serverCmd.exec(createResolvers, typeDefs, nitroPaymentsManager);
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});
