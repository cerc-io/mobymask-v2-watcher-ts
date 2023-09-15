//
// Copyright 2023 Vulcanize, Inc.
//

import crypto from 'crypto';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

const log = debug('laconic:gen-consensus-keys');

interface Arguments {
  file: string;
}

async function main (): Promise<void> {
  const node = crypto.createECDH('secp256k1');
  node.generateKeys('hex');
  const obj = {
    publicKey: node.getPublicKey('hex', 'compressed'),
    privateKey: node.getPrivateKey('hex')
  };

  const argv: Arguments = _getArgv();
  if (argv.file) {
    const exportFilePath = path.resolve(argv.file);
    const exportFileDir = path.dirname(exportFilePath);

    if (!fs.existsSync(exportFileDir)) {
      fs.mkdirSync(exportFileDir, { recursive: true });
    }

    fs.writeFileSync(exportFilePath, JSON.stringify(obj, null, 2));
    log(`Key pair exported to file ${exportFilePath}`);
  } else {
    log(obj);
  }
}

function _getArgv (): any {
  return yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    file: {
      type: 'string',
      alias: 'f',
      describe: 'Peer Id export file path (json)'
    }
  }).argv;
}

main().catch(err => {
  log(err);
});
