//
// Copyright 2023 Vulcanize, Inc.
//

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';
import { ethers, providers } from 'ethers';

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
import { PaymentsManager, getConfig, setupProviderWithPayments } from '@cerc-io/util';

import { RatesConfig } from './config';
import { validateContractAddressFormat, validateContractDeployment, validateDatabaseEndpoint, validateEndpoints, validateNitroChainUrl, validateRPCMethods } from './util/validateConfig';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const serverCmd = new ServerCmd();
  await serverCmd.init(Database);
  await serverCmd.initIndexer(Indexer);

  // Initialize / start the p2p nodes
  const { peer } = await serverCmd.initP2P();
  const { rpcProviderMutationEndpoint, payments: ethServerPaymentsConfig } = serverCmd.config.upstream.ethServer;

  // Validate JSON RPC Methods
  serverCmd.config.upstream.ethServer.payments.paidRPCMethods.forEach(async (method) => await validateRPCMethods(method));

  // Validate database endpoint
  const { database } = serverCmd.config;

  await validateDatabaseEndpoint(database as PostgresConnectionOptions);

  // Validate Nitro chain url
  await validateNitroChainUrl(serverCmd.config.server.p2p.nitro.chainUrl);

  // Validate endpoints
  await validateEndpoints(serverCmd.config.upstream.ethServer.rpcProviderMutationEndpoint, 'rpcProviderMutationEndpoint');

  // Validate contract deployment
  [nitroAdjudicatorAddress, virtualPaymentAppAddress, consensusAppAddress].forEach((contractAddr) => {
    validateContractAddressFormat(contractAddr);
    validateContractDeployment(rpcProviderMutationEndpoint, contractAddr);
  });

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
    nitroPaymentsManager = new PaymentsManager(nitro, payments, ratesConfig);

    // Start subscription for payment vouchers received by the client
    nitroPaymentsManager.subscribeToVouchers();

    // Setup a payment channel with the upstream Nitro node if provided in config
    // Setup the provider to send payment with each request
    if (ethServerPaymentsConfig?.nitro?.address) {
      const upstreamPaymentChannel = await nitroPaymentsManager.setupPaymentChannel(ethServerPaymentsConfig?.nitro);

      setupProviderWithPayments(
        serverCmd.ethProvider,
        nitroPaymentsManager,
        upstreamPaymentChannel,
        ethServerPaymentsConfig.paidRPCMethods,
        ethServerPaymentsConfig.amount
      );
    }

    // Register the pubsub topic handler
    let p2pMessageHandler = parseLibp2pMessage;

    // Send L2 txs for messages if enabled
    if (enableL2Txs) {
      assert(l2TxsConfig);
      // Create a separate provider for mutation requests if rpcProviderMutationEndpoint is provided
      const mutationProvider = rpcProviderMutationEndpoint
        ? new providers.JsonRpcProvider(rpcProviderMutationEndpoint)
        : serverCmd.ethProvider;
      const wallet = new ethers.Wallet(l2TxsConfig.privateKey, mutationProvider);

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
