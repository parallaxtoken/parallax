/**
 * ScVal Serialization & Deserialization Utilities for Soroban Contracts
 */

import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { type FillArgs, type Order, type Wrapper, Side, OrderStatus, Issuer } from '../types.js';

/**
 * Converts a Stellar address string (G... or C...) to ScVal address
 */
export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

/**
 * Converts an ScVal address or string to Stellar address string
 */
export function scValToAddress(val: xdr.ScVal): string {
  try {
    return Address.fromScVal(val).toString();
  } catch {
    const native = scValToNative(val);
    if (typeof native === 'string') return native;
    throw new Error('Failed to convert ScVal to address string');
  }
}

/**
 * Converts a string to ScVal symbol
 */
export function symbolToScVal(symbol: string): xdr.ScVal {
  return nativeToScVal(symbol, { type: 'symbol' });
}

/**
 * Converts integer/bigint to 128-bit signed integer ScVal
 */
export function i128ToScVal(n: bigint | number | string): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: 'i128' });
}

/**
 * Converts integer/bigint to 64-bit unsigned integer ScVal
 */
export function u64ToScVal(n: bigint | number | string): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: 'u64' });
}

/**
 * Converts integer to 32-bit unsigned integer ScVal
 */
export function u32ToScVal(n: number | bigint): xdr.ScVal {
  return nativeToScVal(Number(n), { type: 'u32' });
}

/**
 * Converts boolean to ScVal boolean
 */
export function boolToScVal(b: boolean): xdr.ScVal {
  return nativeToScVal(b, { type: 'bool' });
}

/**
 * Converts bytes/hex/Buffer to ScVal bytes
 */
export function bytesToScVal(bytes: Uint8Array | Buffer | string): xdr.ScVal {
  let buf: Uint8Array;
  if (typeof bytes === 'string') {
    const cleanHex = bytes.startsWith('0x') ? bytes.slice(2) : bytes;
    if (cleanHex.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(cleanHex)) {
      buf = Buffer.from(cleanHex, 'hex');
    } else {
      buf = Buffer.from(bytes, 'utf8');
    }
  } else {
    buf = bytes;
  }
  return nativeToScVal(buf, { type: 'bytes' });
}

/**
 * Serializes an Order object into a Soroban ScVal map
 */
export function serializeOrder(order: Order): xdr.ScVal {
  const entries: xdr.ScMapEntry[] = [
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('id'),
      val: u64ToScVal(order.id),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('owner'),
      val: addressToScVal(order.owner),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('side'),
      val: u32ToScVal(order.side),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('status'),
      val: u32ToScVal(order.status),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('wrapper_mask'),
      val: u32ToScVal(order.wrapperMask),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('deadline'),
      val: u64ToScVal(order.deadline),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('ticker_id'),
      val: symbolToScVal(order.tickerId),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('amount'),
      val: i128ToScVal(order.amount),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('limit'),
      val: i128ToScVal(order.limit),
    }),
  ];
  return xdr.ScVal.scvMap(entries);
}

/**
 * Deserializes an ScVal representation of an Order into a typed Order
 */
export function deserializeOrder(val: xdr.ScVal): Order {
  const raw = scValToNative(val) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid ScVal for Order: expected object or map');
  }

  return {
    id: BigInt((raw.id as bigint | number | string) ?? 0),
    owner: String(raw.owner ?? ''),
    side: Number(raw.side ?? 0) as Side,
    status: Number(raw.status ?? 0) as OrderStatus,
    wrapperMask: Number((raw.wrapper_mask ?? raw.wrapperMask) ?? 0),
    deadline: BigInt((raw.deadline as bigint | number | string) ?? 0),
    tickerId: String((raw.ticker_id ?? raw.tickerId) ?? ''),
    amount: BigInt((raw.amount as bigint | number | string) ?? 0),
    limit: BigInt((raw.limit as bigint | number | string) ?? 0),
  };
}

/**
 * Serializes a Wrapper object into a Soroban ScVal map
 */
export function serializeWrapper(wrapper: Wrapper): xdr.ScVal {
  const entries: xdr.ScMapEntry[] = [
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('token'),
      val: addressToScVal(wrapper.token),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('issuer'),
      val: u32ToScVal(wrapper.issuer),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('instant_only'),
      val: boolToScVal(wrapper.instantOnly),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('active'),
      val: boolToScVal(wrapper.active),
    }),
  ];
  return xdr.ScVal.scvMap(entries);
}

/**
 * Deserializes an ScVal representation of a Wrapper into a typed Wrapper
 */
export function deserializeWrapper(val: xdr.ScVal): Wrapper {
  const raw = scValToNative(val) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid ScVal for Wrapper: expected object or map');
  }

  return {
    token: String(raw.token ?? ''),
    issuer: Number(raw.issuer ?? 0) as Issuer,
    instantOnly: Boolean(raw.instant_only ?? raw.instantOnly),
    active: Boolean(raw.active ?? false),
  };
}

/**
 * Serializes a single FillArgs struct into a Soroban ScVal map
 */
export function serializeFillArgs(fill: FillArgs): xdr.ScVal {
  const entries: xdr.ScMapEntry[] = [
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('order_id'),
      val: u64ToScVal(fill.orderId),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('route_data'),
      val: bytesToScVal(fill.routeData),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('router'),
      val: addressToScVal(fill.router),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('wrapper_idx'),
      val: u32ToScVal(fill.wrapperIdx),
    }),
  ];
  return xdr.ScVal.scvMap(entries);
}

/**
 * Deserializes an ScVal representation of FillArgs
 */
export function deserializeFillArgs(val: xdr.ScVal): FillArgs {
  const raw = scValToNative(val) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid ScVal for FillArgs: expected object or map');
  }

  let routeData = raw.route_data ?? raw.routeData;
  if (typeof routeData === 'string' && routeData.startsWith('0x')) {
    routeData = Buffer.from(routeData.slice(2), 'hex');
  }

  return {
    orderId: BigInt((raw.order_id ?? raw.orderId) as bigint | number | string),
    wrapperIdx: Number((raw.wrapper_idx ?? raw.wrapperIdx) ?? 0),
    router: String(raw.router ?? ''),
    routeData: (routeData as Uint8Array | Buffer | string) ?? new Uint8Array(),
  };
}

/**
 * Serializes an array of FillArgs into a Soroban Vec<FillArgs> ScVal
 */
export function serializeFillArgsVec(fills: FillArgs[]): xdr.ScVal {
  const scVals = fills.map(serializeFillArgs);
  return xdr.ScVal.scvVec(scVals);
}

/**
 * Deserializes an ScVal vector of FillArgs
 */
export function deserializeFillArgsVec(val: xdr.ScVal): FillArgs[] {
  const rawList = scValToNative(val) as unknown[];
  if (!Array.isArray(rawList)) {
    throw new Error('Invalid ScVal for FillArgs vector: expected array');
  }

  return rawList.map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      orderId: BigInt((raw.order_id ?? raw.orderId) as bigint | number | string),
      wrapperIdx: Number((raw.wrapper_idx ?? raw.wrapperIdx) ?? 0),
      router: String(raw.router ?? ''),
      routeData: (raw.route_data ?? raw.routeData) as Uint8Array | Buffer | string,
    };
  });
}
