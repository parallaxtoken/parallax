#![no_std]
use soroban_sdk::{contracttype, Address, Symbol};

pub const WAD: i128 = 1_000_000_000_000_000_000; // 18 decimals for share-equivalents
pub const STROOP: i128 = 10_000_000;              // 7 decimals for Stellar native USDC

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Side {
    Buy = 0,
    Sell = 1,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OrderStatus {
    Open = 0,
    Filled = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Issuer {
    BStocks = 0,
    Ondo = 1,
    XStocks = 2,
    Benji = 3,
    Custom = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Wrapper {
    pub token: Address,
    pub issuer: Issuer,
    pub instant_only: bool,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub id: u64,
    pub owner: Address,
    pub side: Side,
    pub status: OrderStatus,
    pub wrapper_mask: u32,
    pub deadline: u64,
    pub ticker_id: Symbol,
    pub amount: i128, // BUY: USDC in (7 decimals); SELL: shares (18 decimals, WAD)
    pub limit: i128,  // BUY: min_shares out (18 decimals, WAD); SELL: min_usdc_per_share
}
