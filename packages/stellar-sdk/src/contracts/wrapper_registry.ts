/**
 * WrapperRegistry Soroban RPC Client
 */

import {
  Account,
  Contract,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  DEFAULT_SOROBAN_TESTNET_RPC,
  STELLAR_TESTNET_PASSPHRASE,
  WRAPPER_REGISTRY_TESTNET,
} from '../constants.js';
import {
  type AddWrapperParams,
  type SetCustomUnitParams,
  type SetRouterParams,
  type SetTokenPausedParams,
  type SetWrapperActiveParams,
  type Wrapper,
  type WrapperRegistryConfig,
} from '../types.js';
import {
  addressToScVal,
  boolToScVal,
  deserializeWrapper,
  i128ToScVal,
  symbolToScVal,
  u32ToScVal,
} from './serializers.js';

export class WrapperRegistryClient {
  public readonly contractId: string;
  public readonly rpcUrl: string;
  public readonly networkPassphrase: string;
  public readonly server: rpc.Server;
  public readonly contract: Contract;

  constructor(config: WrapperRegistryConfig = {}) {
    this.rpcUrl = config.rpcUrl ?? DEFAULT_SOROBAN_TESTNET_RPC;
    this.networkPassphrase = config.networkPassphrase ?? STELLAR_TESTNET_PASSPHRASE;
    this.contractId = config.contractId ?? WRAPPER_REGISTRY_TESTNET;

    if (config.server) {
      this.server = config.server;
    } else {
      this.server = new rpc.Server(this.rpcUrl, {
        allowHttp: config.allowHttp ?? this.rpcUrl.startsWith('http://'),
        timeout: config.timeout,
        headers: config.headers,
      });
    }
    this.contract = new Contract(this.contractId);
  }

  private async resolveAccount(
    source: string | Account,
    sequence?: string | bigint
  ): Promise<Account> {
    if (typeof source !== 'string') {
      return source;
    }
    if (sequence !== undefined) {
      return new Account(source, sequence.toString());
    }
    try {
      return await this.server.getAccount(source);
    } catch {
      return new Account(source, '0');
    }
  }

  /**
   * Read-only query: Returns the number of registered wrappers for a given ticker
   */
  public async getWrapperCount(ticker: string): Promise<number> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('wrapper_count', symbolToScVal(ticker));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Unknown simulation error';
      throw new Error(`getWrapperCount(${ticker}) simulation failed: ${err}`);
    }
    return Number(scValToNative(sim.result.retval));
  }

  /**
   * Read-only query: Fetches the wrapper registration details at a specific index
   */
  public async getWrapperAt(ticker: string, index: number): Promise<Wrapper> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('wrapper_at', symbolToScVal(ticker), u32ToScVal(index));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Wrapper not found';
      throw new Error(`getWrapperAt(${ticker}, ${index}) simulation failed: ${err}`);
    }
    return deserializeWrapper(sim.result.retval);
  }

  /**
   * Read-only query: Returns the current 18-decimal shares-per-token multiplier (unit WAD)
   */
  public async getSharesPerToken(tokenAddress: string): Promise<bigint> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('shares_per_token', addressToScVal(tokenAddress));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Unknown simulation error';
      throw new Error(`getSharesPerToken(${tokenAddress}) simulation failed: ${err}`);
    }
    return BigInt(scValToNative(sim.result.retval) as bigint | number | string);
  }

  /**
   * Read-only query: Checks whether a router contract is allowlisted in the registry
   */
  public async isRouter(routerAddress: string): Promise<boolean> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('is_router', addressToScVal(routerAddress));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Unknown simulation error';
      throw new Error(`isRouter(${routerAddress}) simulation failed: ${err}`);
    }
    return scValToNative(sim.result.retval) as boolean;
  }

  /**
   * Read-only query: Checks whether an individual token wrapper is paused
   */
  public async isPaused(tokenAddress: string): Promise<boolean> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('is_paused', addressToScVal(tokenAddress));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Unknown simulation error';
      throw new Error(`isPaused(${tokenAddress}) simulation failed: ${err}`);
    }
    return scValToNative(sim.result.retval) as boolean;
  }

  /**
   * Admin Builder: Registers a new equity wrapper under a ticker
   */
  public async buildAddWrapperTx(params: AddWrapperParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call(
      'add_wrapper',
      symbolToScVal(params.ticker),
      addressToScVal(params.token),
      u32ToScVal(params.issuer),
      boolToScVal(params.instantOnly ?? false)
    );

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }

  /**
   * Admin Builder: Activates or deactivates an equity wrapper
   */
  public async buildSetWrapperActiveTx(params: SetWrapperActiveParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call(
      'set_wrapper_active',
      symbolToScVal(params.ticker),
      u32ToScVal(params.index),
      boolToScVal(params.active)
    );

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }

  /**
   * Admin Builder: Sets a custom shares-per-token unit multiplier for peg re-anchoring
   */
  public async buildSetCustomUnitTx(params: SetCustomUnitParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call(
      'set_custom_unit',
      addressToScVal(params.token),
      i128ToScVal(params.unitWad)
    );

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }

  /**
   * Admin Builder: Allowlist or revoke a router address
   */
  public async buildSetRouterTx(params: SetRouterParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call(
      'set_router',
      addressToScVal(params.router),
      boolToScVal(params.allowed)
    );

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }

  /**
   * Admin Builder: Pause or unpause an equity wrapper token
   */
  public async buildSetTokenPausedTx(params: SetTokenPausedParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call(
      'set_token_paused',
      addressToScVal(params.token),
      boolToScVal(params.paused)
    );

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }
}
