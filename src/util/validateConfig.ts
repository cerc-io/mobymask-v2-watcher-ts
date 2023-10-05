import { ethers } from 'ethers';
import debug from 'debug';
import axios from 'axios';

const log = debug('vulcanize:server');

export async function validateContract (rpcEndpoint: string, contractAddress: string): Promise<void> {
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
      throw new Error(`Connection refused at ${rpcEndpoint}. Please check if the RPC endpoint is correct and the server is running.`);
    } else {
      throw error;
    }
  }
}
