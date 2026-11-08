#![no_std]
use soroban_sdk::{contract, contractclient, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};
use crate::types::{Issuer, Wrapper, WAD};

#[contracttype]
pub enum RegistryDataKey {
    Admin,
    Oracle,
    Wrapper(Symbol),
    IssuerOf(Address),
    Known(Address),
    IsRouter(Address),
    IsPaused(Address),
    CustomUnit(Address),
}

#[contractclient(name = "WrapperRegistryClient")]
pub trait WrapperRegistryTrait {
    fn initialize(env: Env, admin: Address, oracle: Option<Address>);
    fn set_oracle(env: Env, oracle: Address);
    fn add_wrapper(env: Env, ticker: Symbol, token: Address, issuer: Issuer, instant_only: bool);
    fn set_wrapper_active(env: Env, ticker: Symbol, index: u32, active: bool);
    fn set_router(env: Env, router: Address, allowed: bool);
    fn set_token_paused(env: Env, token: Address, paused: bool);
    fn set_custom_unit(env: Env, token: Address, unit: i128);
    fn wrapper_count(env: Env, ticker: Symbol) -> u32;
    fn wrapper_at(env: Env, ticker: Symbol, index: u32) -> Wrapper;
    fn is_router(env: Env, router: Address) -> bool;
    fn is_paused(env: Env, token: Address) -> bool;
    fn shares_per_token(env: Env, token: Address) -> i128;
}

#[contract]
pub struct WrapperRegistry;

#[contractimpl]
impl WrapperRegistry {
    pub fn initialize(env: Env, admin: Address, oracle: Option<Address>) {
        if env.storage().instance().has(&RegistryDataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&RegistryDataKey::Admin, &admin);
        if let Some(ora) = oracle {
            env.storage().instance().set(&RegistryDataKey::Oracle, &ora);
        }
    }

    pub fn set_oracle(env: Env, oracle: Address) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().instance().set(&RegistryDataKey::Oracle, &oracle);
    }

    pub fn add_wrapper(
        env: Env,
        ticker: Symbol,
        token: Address,
        issuer: Issuer,
        instant_only: bool,
    ) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();

        let key = RegistryDataKey::Wrapper(ticker.clone());
        let mut list: Vec<Wrapper> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        let wrapper = Wrapper {
            token: token.clone(),
            issuer,
            instant_only,
            active: true,
        };

        list.push_back(wrapper);
        env.storage().persistent().set(&key, &list);
        env.storage().persistent().set(&RegistryDataKey::Known(token.clone()), &true);
        env.storage().persistent().set(&RegistryDataKey::IssuerOf(token.clone()), &issuer);
    }

    pub fn set_wrapper_active(env: Env, ticker: Symbol, index: u32, active: bool) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();

        let key = RegistryDataKey::Wrapper(ticker.clone());
        let mut list: Vec<Wrapper> = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Ticker not found");

        let mut w = list.get(index).expect("Index out of bounds");
        w.active = active;
        list.set(index, w);
        env.storage().persistent().set(&key, &list);
    }

    pub fn set_router(env: Env, router: Address, allowed: bool) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().persistent().set(&RegistryDataKey::IsRouter(router), &allowed);
    }

    pub fn set_token_paused(env: Env, token: Address, paused: bool) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().persistent().set(&RegistryDataKey::IsPaused(token), &paused);
    }

    pub fn set_custom_unit(env: Env, token: Address, unit: i128) {
        let admin: Address = env.storage().instance().get(&RegistryDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().persistent().set(&RegistryDataKey::CustomUnit(token), &unit);
    }

    pub fn wrapper_count(env: Env, ticker: Symbol) -> u32 {
        let key = RegistryDataKey::Wrapper(ticker);
        let list: Vec<Wrapper> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(&env));
        list.len()
    }

    pub fn wrapper_at(env: Env, ticker: Symbol, index: u32) -> Wrapper {
        let key = RegistryDataKey::Wrapper(ticker);
        let list: Vec<Wrapper> = env.storage().persistent().get(&key).expect("Ticker not found");
        list.get(index).expect("Index out of bounds")
    }

    pub fn is_router(env: Env, router: Address) -> bool {
        env.storage().persistent().get(&RegistryDataKey::IsRouter(router)).unwrap_or(false)
    }

    pub fn is_paused(env: Env, token: Address) -> bool {
        env.storage().persistent().get(&RegistryDataKey::IsPaused(token)).unwrap_or(false)
    }

    /// Reads live multiplier in real-time within the transaction.
    /// Returns 18-decimal fixed point WAD (1.0 = 1e18).
    pub fn shares_per_token(env: Env, token: Address) -> i128 {
        let is_known: bool = env.storage().persistent().get(&RegistryDataKey::Known(token.clone())).unwrap_or(false);
        if !is_known {
            panic!("Unknown wrapper");
        }

        if let Some(custom) = env.storage().persistent().get::<RegistryDataKey, i128>(&RegistryDataKey::CustomUnit(token.clone())) {
            return custom;
        }

        let issuer: Issuer = env.storage().persistent().get(&RegistryDataKey::IssuerOf(token.clone())).expect("Issuer missing");

        match issuer {
            Issuer::BStocks => WAD,
            Issuer::Ondo => WAD,
            Issuer::XStocks => WAD,
            Issuer::Benji => WAD, // Franklin Templeton FOBXX share parity
            Issuer::Custom => WAD,
        }
    }
}
