import { ethers } from 'ethers';
import { Client } from 'pg';
import axios from 'axios';
import debug from 'debug';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

const log = debug('vulcanize:server');

export async function validateContractDeployment (rpcEndpoint: string, contractAddress: string): Promise<void> {
  const provider = await new ethers.providers.JsonRpcProvider(rpcEndpoint);
  try {
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      log(`WARNING: Contract is not deployed at address ${contractAddress}`);
    } else {
      log(`SUCCESS: Contract is deployed at address ${contractAddress}`);
    }
  } catch (error) {
    log(error);
  }
}

export async function validateRPCEndPoint (rpcEndpoint: string): Promise<void> {
  try {
    await axios.get(rpcEndpoint);
  } catch (error:any) {
    if (error.code === 'ECONNREFUSED') {
      log(`WARNING: Connection refused at ${rpcEndpoint}. Please check if the RPC endpoint upstream.ethServer.rpcProviderEndpoint is correct and up.`);
    } else {
      throw error;
    }
  }
}

export function validateContractAddressFormat (contractAddress: string): void {
  if (ethers.utils.isAddress(contractAddress)) {
    log('Given contract address is in a valid format');
  } else {
    log('WARNING: Given contract address is not in a valid format');
  }
}

export async function validateDatabaseEndpoint (database: PostgresConnectionOptions): Promise<void> {
  const connectionString = `${database.type}://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`;

  const client = new Client({
    connectionString
  });

  try {
    await client.connect();
    log('PostgreSQL endpoint is up!');
  } catch (error) {
    log('WARNING: Error connecting to database. Please check if database config is setup and database is running \n', error);
  } finally {
    await client.end();
  }
}
