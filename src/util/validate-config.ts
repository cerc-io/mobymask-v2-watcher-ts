import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

import { ServerCmd } from '@cerc-io/cli';
import { validateContracts, validatePaidRPCMethods, validateDatabaseEndpoint, validateWebSocketEndpoint, validateHttpEndpoint, validateJobQueueEndpoint, validateFilePath } from '@cerc-io/util';

export async function validateConfig (serverCmd: ServerCmd, contractsArr: {address:string, name?:string}[]): Promise<void> {
  // Validate JSON RPC Methods
  await validatePaidRPCMethods(serverCmd.config.upstream.ethServer.payments.paidRPCMethods);

  // Validate database endpoint
  await validateDatabaseEndpoint(serverCmd.config.database as PostgresConnectionOptions);

  // Validate Nitro chain url
  await validateWebSocketEndpoint(serverCmd.config.server.p2p.nitro.chainUrl);

  // Validate endpoints
  await validateHttpEndpoint(serverCmd.config.upstream.ethServer.rpcProviderMutationEndpoint, 'serverCmd.config.upstream.ethServer.rpcProviderMutationEndpoint');
  await validateHttpEndpoint(serverCmd.config.upstream.ethServer.rpcProviderEndpoint, 'serverCmd.config.upstream.ethServer.rpcProviderEndpoint');
  await validateHttpEndpoint(serverCmd.config.upstream.ethServer.gqlApiEndpoint, 'serverCmd.config.upstream.ethServer.gqlApiEndpoint');

  // Validate Jobqueue
  await validateJobQueueEndpoint(serverCmd.config.jobQueue.dbConnectionString);

  // Validate contract deployment
  await validateContracts(contractsArr, serverCmd.config.server.p2p.nitro.chainUrl, true);

  // Validate rates.toml file path
  await validateFilePath(serverCmd.config.server.p2p.nitro.payments.ratesFile);
}
