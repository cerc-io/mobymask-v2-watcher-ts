import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { ServerCmd } from '@cerc-io/cli';
import { validateContracts, validateEthRPCMethods, validateDatabaseEndpoint, validateNitroChainUrl, validateEndpoint, validateJobQueueEndpoint } from '@cerc-io/util';

export async function validateConfig (serverCmd: ServerCmd, contractsArr: string[]): Promise<void> {
  // Validate JSON RPC Methods
  await validateEthRPCMethods(serverCmd.config.upstream.ethServer.payments.paidRPCMethods);

  // Validate database endpoint

  await validateDatabaseEndpoint(serverCmd.config.database as PostgresConnectionOptions);

  // Validate Nitro chain url
  await validateNitroChainUrl(serverCmd.config.server.p2p.nitro.chainUrl);

  // Validate endpoints
  await validateEndpoint(serverCmd.config.upstream.ethServer.rpcProviderMutationEndpoint, 'serverCmd.config.upstream.ethServer.rpcProviderMutationEndpoint');
  await validateEndpoint(serverCmd.config.upstream.ethServer.rpcProviderEndpoint, 'serverCmd.config.upstream.ethServer.rpcProviderEndpoint');
  await validateEndpoint(serverCmd.config.upstream.ethServer.gqlApiEndpoint, 'serverCmd.config.upstream.ethServer.gqlApiEndpoint');

  // Validate Jobqueue
  await validateJobQueueEndpoint(serverCmd.config.jobQueue.dbConnectionString);

  // Validate contract deployment
  validateContracts(contractsArr, serverCmd.config.upstream.ethServer.rpcProviderEndpoint);
}
