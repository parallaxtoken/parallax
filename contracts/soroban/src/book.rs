#![no_std]
use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, token, Address, Bytes,
    Env, IntoVal, Symbol, Vec,
};
use crate::types::{FillArgs, Order, OrderStatus, Side, STROOP, WAD};
use crate::registry::WrapperRegistryClient;

#[contractclient(name = "SwapRouterClient")]
pub trait SwapRouterTrait {
    fn execute_route(env: Env, token_out: Address, amount_in: i128, recipient: Address, route_data: Bytes) -> i128;
}

#[contracttype]
pub enum BookDataKey {
    Admin,
    Usdc,
    Registry,
    NextId,
    Paused,
    Order(u64),
}

#[contract]
pub struct ParallaxBook;

#[contractimpl]
impl ParallaxBook {
    pub fn initialize(env: Env, admin: Address, usdc: Address, registry: Address) {
        if env.storage().instance().has(&BookDataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&BookDataKey::Admin, &admin);
        env.storage().instance().set(&BookDataKey::Usdc, &usdc);
        env.storage().instance().set(&BookDataKey::Registry, &registry);
        env.storage().instance().set(&BookDataKey::NextId, &0u64);
        env.storage().instance().set(&BookDataKey::Paused, &false);
        env.storage().instance().extend_ttl(100_000, 200_000);
    }

    pub fn set_paused(env: Env, paused: bool) {
        let admin: Address = env.storage().instance().get(&BookDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().instance().set(&BookDataKey::Paused, &paused);
        env.events().publish((symbol_short!("paused"),), paused);
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&BookDataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().instance().set(&BookDataKey::Admin, &new_admin);
        env.events().publish((symbol_short!("admin"),), new_admin);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&BookDataKey::Paused).unwrap_or(false)
    }

    pub fn place_buy(
        env: Env,
        owner: Address,
        ticker_id: Symbol,
        pay_amount: i128,
        min_shares: i128,
        deadline: u64,
        wrapper_mask: u32,
    ) -> u64 {
        if Self::is_paused(env.clone()) {
            panic!("Book is paused");
        }
        owner.require_auth();
        if pay_amount <= 0 || min_shares <= 0 || wrapper_mask == 0 || deadline <= env.ledger().timestamp() {
            panic!("Bad parameters");
        }

        let registry_addr: Address = env.storage().instance().get(&BookDataKey::Registry).unwrap();
        let registry_client = WrapperRegistryClient::new(&env, &registry_addr);
        if registry_client.wrapper_count(&ticker_id) == 0 {
            panic!("No wrappers for ticker");
        }

        let mut next_id: u64 = env.storage().instance().get(&BookDataKey::NextId).unwrap();
        let id = next_id;
        next_id += 1;
        env.storage().instance().set(&BookDataKey::NextId, &next_id);

        let order = Order {
            id,
            owner: owner.clone(),
            side: Side::Buy,
            status: OrderStatus::Open,
            wrapper_mask,
            deadline,
            ticker_id: ticker_id.clone(),
            amount: pay_amount,
            limit: min_shares,
        };

        let key = BookDataKey::Order(id);
        env.storage().persistent().set(&key, &order);
        // Extend TTL in Soroban persistent storage for open order
        env.storage().persistent().extend_ttl(&key, 100_000, 200_000);

        env.events().publish(
            (symbol_short!("placed"), id, owner),
            (ticker_id, Side::Buy as u32, pay_amount, min_shares),
        );
        id
    }

    pub fn place_sell(
        env: Env,
        owner: Address,
        ticker_id: Symbol,
        shares: i128,
        min_usdc_per_share: i128,
        deadline: u64,
        wrapper_mask: u32,
    ) -> u64 {
        if Self::is_paused(env.clone()) {
            panic!("Book is paused");
        }
        owner.require_auth();
        if shares <= 0 || min_usdc_per_share <= 0 || wrapper_mask == 0 || deadline <= env.ledger().timestamp() {
            panic!("Bad parameters");
        }

        let registry_addr: Address = env.storage().instance().get(&BookDataKey::Registry).unwrap();
        let registry_client = WrapperRegistryClient::new(&env, &registry_addr);
        if registry_client.wrapper_count(&ticker_id) == 0 {
            panic!("No wrappers for ticker");
        }

        let mut next_id: u64 = env.storage().instance().get(&BookDataKey::NextId).unwrap();
        let id = next_id;
        next_id += 1;
        env.storage().instance().set(&BookDataKey::NextId, &next_id);

        let order = Order {
            id,
            owner: owner.clone(),
            side: Side::Sell,
            status: OrderStatus::Open,
            wrapper_mask,
            deadline,
            ticker_id: ticker_id.clone(),
            amount: shares,
            limit: min_usdc_per_share,
        };

        let key = BookDataKey::Order(id);
        env.storage().persistent().set(&key, &order);
        env.storage().persistent().extend_ttl(&key, 100_000, 200_000);

        env.events().publish(
            (symbol_short!("placed"), id, owner),
            (ticker_id, Side::Sell as u32, shares, min_usdc_per_share),
        );
        id
    }

    pub fn cancel(env: Env, order_id: u64) {
        let key = BookDataKey::Order(order_id);
        let mut order: Order = env.storage().persistent().get(&key).expect("Order not found");
        order.owner.require_auth();

        if order.status != OrderStatus::Open {
            panic!("Order not open");
        }

        order.status = OrderStatus::Cancelled;
        env.storage().persistent().set(&key, &order);

        env.events().publish((symbol_short!("cancel"), order_id), ());
    }

    pub fn get_order(env: Env, order_id: u64) -> Order {
        env.storage().persistent().get(&BookDataKey::Order(order_id)).expect("Order not found")
    }

    /// Anyone (an automated Keeper) may execute a fill.
    /// The unit multiplier is read inside the transaction from the registry.
    /// ShareFloor invariant: Delivered real shares MUST be >= order.limit.
    pub fn fill(
        env: Env,
        filler: Address,
        order_id: u64,
        wrapper_idx: u32,
        router: Address,
        route_data: Bytes,
    ) {
        if Self::is_paused(env.clone()) {
            panic!("Book is paused");
        }
        filler.require_auth();

        let key = BookDataKey::Order(order_id);
        let mut order: Order = env.storage().persistent().get(&key).expect("Order not found");

        if order.status != OrderStatus::Open {
            panic!("Order not open");
        }
        if env.ledger().timestamp() > order.deadline {
            panic!("Order expired");
        }

        let registry_addr: Address = env.storage().instance().get(&BookDataKey::Registry).unwrap();
        let registry_client = WrapperRegistryClient::new(&env, &registry_addr);

        let wrapper = registry_client.wrapper_at(&order.ticker_id, &wrapper_idx);
        if !wrapper.active || wrapper.instant_only {
            panic!("Wrapper not allowed");
        }
        let issuer_bit = 1u32 << (wrapper.issuer as u32);
        if (order.wrapper_mask & issuer_bit) == 0 {
            panic!("Wrapper issuer not permitted by owner mask");
        }
        if !registry_client.is_router(&router) {
            panic!("Router not allowlisted");
        }
        if registry_client.is_paused(&wrapper.token) {
            panic!("Wrapper paused");
        }

        // Effects before interactions
        order.status = OrderStatus::Filled;
        env.storage().persistent().set(&key, &order);

        // Read unit inside this transaction from on-chain source
        let unit: i128 = registry_client.shares_per_token(&wrapper.token);

        let usdc_addr: Address = env.storage().instance().get(&BookDataKey::Usdc).unwrap();
        let usdc_client = token::Client::new(&env, &usdc_addr);
        let token_client = token::Client::new(&env, &wrapper.token);
        let contract_addr = env.current_contract_address();

        if order.side == Side::Buy {
            let pay = order.amount;

            // 1. Pull USDC from owner to contract
            usdc_client.transfer_from(&contract_addr, &order.owner, &contract_addr, &pay);

            // 2. Transfer USDC to router for swap execution
            let tok_before = token_client.balance(&contract_addr);
            usdc_client.transfer(&contract_addr, &router, &pay);

            // 3. Router executes swap and delivers stock tokens back to contract
            let router_client = SwapRouterClient::new(&env, &router);
            router_client.execute_route(&wrapper.token, &pay, &contract_addr, &route_data);

            let tok_after = token_client.balance(&contract_addr);
            let tokens_out = tok_after - tok_before;

            // Invariant: Normalize 7-decimal Stellar SAC tokens to 18-decimal WAD
            // Share-equivalents = (tokens_out * unit) / 10^7 (STROOP)
            let shares = (tokens_out * unit) / STROOP;
            if shares < order.limit {
                panic!("ShareFloor: received {} shares, minimum floor was {}", shares, order.limit);
            }

            // 4. Deliver real shares to owner
            token_client.transfer(&contract_addr, &order.owner, &tokens_out);

            env.events().publish(
                (symbol_short!("filled"), order_id, order.owner),
                (wrapper.token, tokens_out, unit, shares, pay, filler),
            );
        } else {
            // Sell Side
            let shares_to_sell = order.amount; // 18 decimals (WAD)
            // Compute required token units in 7-decimal Stellar stroops
            let tokens_stroop = (shares_to_sell * STROOP + unit - 1) / unit;
            let tokens_in = tokens_stroop;

            token_client.transfer_from(&contract_addr, &order.owner, &contract_addr, &tokens_in);
            token_client.transfer(&contract_addr, &router, &tokens_in);

            let usdc_before = usdc_client.balance(&contract_addr);
            let router_client = SwapRouterClient::new(&env, &router);
            router_client.execute_route(&usdc_addr, &tokens_in, &contract_addr, &route_data);

            let usdc_after = usdc_client.balance(&contract_addr);
            let usdc_out = usdc_after - usdc_before;

            // Limit is minimum USDC stroops per share: (shares_to_sell * order.limit) / 1e18
            let min_usdc = (shares_to_sell * order.limit) / WAD;
            if usdc_out < min_usdc {
                panic!("SellFloor: received {} USDC, minimum floor was {}", usdc_out, min_usdc);
            }

            usdc_client.transfer(&contract_addr, &order.owner, &usdc_out);

            env.events().publish(
                (symbol_short!("filled"), order_id, order.owner),
                (wrapper.token, tokens_in, unit, shares_to_sell, usdc_out, filler),
            );
        }
    }

    /// Batch execute multiple fills in a single atomic transaction.
    /// Cuts keeper transaction fees by up to 80% on Soroban ledger.
    pub fn batch_fill(
        env: Env,
        filler: Address,
        fills: Vec<FillArgs>,
    ) -> u32 {
        filler.require_auth();
        if Self::is_paused(env.clone()) {
            panic!("Book is paused");
        }

        let mut count: u32 = 0;
        for i in 0..fills.len() {
            let item = fills.get(i).unwrap();
            Self::fill(
                env.clone(),
                filler.clone(),
                item.order_id,
                item.wrapper_idx,
                item.router,
                item.route_data,
            );
            count += 1;
        }
        count
    }
}
