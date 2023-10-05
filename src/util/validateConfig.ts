import { ethers } from 'ethers';
import debug from 'debug';
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
    console.error(error);
  }
}
