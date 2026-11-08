/**
 * ParallaxBook Soroban RPC Client
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
  PARALLAX_BOOK_TESTNET,
  STELLAR_TESTNET_PASSPHRASE,
} from '../constants.js';
import {
  type BatchFillParams,
  type CancelParams,
  type FillParams,
  type Order,
  type ParallaxBookConfig,
  type PlaceBuyParams,
  type PlaceSellParams,
} from '../types.js';
import {
  addressToScVal,
  bytesToScVal,
  deserializeOrder,
  i128ToScVal,
  serializeFillArgsVec,
  symbolToScVal,
  u32ToScVal,
  u64ToScVal,
} from './serializers.js';

export class ParallaxBookClient {
  public readonly contractId: string;
  public readonly rpcUrl: string;
  public readonly networkPassphrase: string;
  public readonly server: rpc.Server;
  public readonly contract: Contract;

  constructor(config: ParallaxBookConfig = {}) {
    this.rpcUrl = config.rpcUrl ?? DEFAULT_SOROBAN_TESTNET_RPC;
    this.networkPassphrase = config.networkPassphrase ?? STELLAR_TESTNET_PASSPHRASE;
    this.contractId = config.contractId ?? PARALLAX_BOOK_TESTNET;

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

  /**
   * Helper to resolve account public key and sequence
   */
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
   * Read-only query: Checks whether the ParallaxBook contract is currently paused
   */
  public async isPaused(): Promise<boolean> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('is_paused');
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
      throw new Error(`isPaused simulation failed: ${err}`);
    }
    return scValToNative(sim.result.retval) as boolean;
  }

  /**
   * Read-only query: Fetches an open order by its unique ID
   */
  public async getOrder(orderId: bigint | number): Promise<Order> {
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const op = this.contract.call('get_order', u64ToScVal(orderId));
    const tx = new TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
      const err = 'error' in sim ? (sim as { error: string }).error : 'Order not found';
      throw new Error(`getOrder(${orderId}) simulation failed: ${err}`);
    }
    return deserializeOrder(sim.result.retval);
  }

  /**
   * Transaction Builder: Builds an un-signed Soroban transaction to place a Buy order
   */
  public async buildPlaceBuyTx(params: PlaceBuyParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const owner = params.owner ?? account.accountId();
    const wrapperMask = params.wrapperMask ?? 0xffffffff;

    const op = this.contract.call(
      'place_buy',
      addressToScVal(owner),
      symbolToScVal(params.ticker),
      i128ToScVal(params.payAmountUsdcStroops),
      i128ToScVal(params.minSharesWad),
      u64ToScVal(params.deadlineSeconds),
      u32ToScVal(wrapperMask)
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
   * Transaction Builder: Builds an un-signed Soroban transaction to place a Sell order
   */
  public async buildPlaceSellTx(params: PlaceSellParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const owner = params.owner ?? account.accountId();
    const wrapperMask = params.wrapperMask ?? 0xffffffff;

    const op = this.contract.call(
      'place_sell',
      addressToScVal(owner),
      symbolToScVal(params.ticker),
      i128ToScVal(params.sharesWad),
      i128ToScVal(params.minUsdcPerShare),
      u64ToScVal(params.deadlineSeconds),
      u32ToScVal(wrapperMask)
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
   * Transaction Builder: Builds an un-signed Soroban transaction to cancel an open order
   */
  public async buildCancelTx(params: CancelParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const op = this.contract.call('cancel', u64ToScVal(params.orderId));

    return new TransactionBuilder(account, {
      fee: params.fee ?? '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(params.timeout ?? 30)
      .build();
  }

  /**
   * Transaction Builder: Builds an un-signed Soroban transaction to execute a single order fill
   */
  public async buildFillTx(params: FillParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const filler = params.filler ?? account.accountId();

    const op = this.contract.call(
      'fill',
      addressToScVal(filler),
      u64ToScVal(params.orderId),
      u32ToScVal(params.wrapperIdx),
      addressToScVal(params.router),
      bytesToScVal(params.routeData)
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
   * Transaction Builder: Builds an un-signed Soroban transaction to batch fill multiple orders
   */
  public async buildBatchFillTx(params: BatchFillParams): Promise<Transaction> {
    const account = await this.resolveAccount(params.sourceAccount, params.sequence);
    const filler = params.filler ?? account.accountId();

    const op = this.contract.call(
      'batch_fill',
      addressToScVal(filler),
      serializeFillArgsVec(params.fills)
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
   * Simulates a transaction against the Soroban RPC server
   */
  public async simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.server.simulateTransaction(tx);
  }

  /**
   * Submits a signed transaction to the Soroban RPC server
   */
  public async sendTransaction(tx: Transaction): Promise<rpc.Api.SendTransactionResponse> {
    return this.server.sendTransaction(tx);
  }

  /**
   * Polls for transaction execution confirmation on the Soroban ledger
   */
  public async pollTransaction(
    txHash: string,
    timeoutMs = 30000,
    pollIntervalMs = 1000
  ): Promise<rpc.Api.GetTransactionResponse> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await this.server.getTransaction(txHash);
      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS || res.status === rpc.Api.GetTransactionStatus.FAILED) {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`Transaction poll timed out after ${timeoutMs}ms for hash: ${txHash}`);
  }
}
