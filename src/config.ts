import { BaseRatesConfig } from '@cerc-io/util';

export interface ChainTransactionRates {
  invoke: string;
  revoke: string;
}

export interface RatesConfig extends BaseRatesConfig {
  chainTrasactions: ChainTransactionRates;
}
