import { ethers } from 'ethers';
import { Client } from 'pg';
import axios from 'axios';
import debug from 'debug';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { VALID_RPC_METHODS } from './constants';
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

export function validateContractAddressFormat (contractAddress: string): void {
  if (ethers.utils.isAddress(contractAddress)) {
    log('SUCCESS: Given contract address is in a valid format');
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
    log('SUCCESS: PostgreSQL endpoint is up!');
  } catch (error) {
    log('WARNING: Error connecting to database. Please check if database config is setup and database is running \n', error);
  } finally {
    await client.end();
  }
}

export async function validateEndpoints (endPoint: string, kind: string): Promise<void> {
  try {
    await axios.get(endPoint);
    log(`SUCCESS: The ${endPoint} is up`);
  } catch (error:any) {
    if (error.code === 'ECONNREFUSED') {
      log(`WARNING: Connection refused at ${endPoint}. Please check if the ${kind} is correct and up.`);
    } else {
      throw error;
    }
  }
}

export async function validateJobQueueEndpoint (connectionString: string): Promise<void> {
  const client = new Client({
    connectionString
  });

  try {
    await client.connect();
    log('SUCCESS: Job queue PostgreSQL endpoint is up!');
  } catch (error) {
    log('WARNING: Error connecting to job queue database. Please check if job queue config is setup and database is running \n', error);
  } finally {
    await client.end();
  }
}

async function checkWebSocket (wsEndpoint: string) {
  const socket = new WebSocket(wsEndpoint);

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      socket.close();
      resolve(true);
    });

    socket.addEventListener('error', (event) => {
      // eslint-disable-next-line prefer-promise-reject-errors
      reject(`Error: ${event}`);
    });
  });
}

export async function validateNitroChainUrl (wsEndpoint: string): Promise<void> {
  try {
    await checkWebSocket(wsEndpoint);
    log(`The WebSocket endpoint ${wsEndpoint} is running.`);
  } catch (error) {
    log(`WARNING: Error connecting to websocket endpoint ${wsEndpoint}. Please check if server.p2p.nitro.chainUrl is correct.`, error);
  }
}

export async function validateRPCMethods (method: string): Promise<void> {
  if (VALID_RPC_METHODS.includes(method)) {
    log(`SUCESS: ${method} is a valid JsonRpcMethod`);
  } else {
    log(`WARNING: ${method} is not a valid JsonRpcMethod`);
  }
}
