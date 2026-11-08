#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short, testutils::{Address as _, Ledger},
    token::{self, StellarAssetClient}, Address, Bytes, Env, Symbol,
};
use crate::types::{Issuer, OrderStatus, Side, WAD, STROOP};
use crate::registry::{WrapperRegistry, WrapperRegistryClient};
use crate::book::{ParallaxBook, ParallaxBookClient, SwapRouterTrait};

// Mock Swap Router for Testing
#[contract]
pub struct MockRouter;

#[contractimpl]
impl SwapRouterTrait for MockRouter {
    pub fn execute_route(env: Env, token_out: Address, _amount_in: i128, recipient: Address, _route_data: Bytes) -> i128 {
        let client = token::Client::new(&env, &token_out);
        let current_contract = env.current_contract_address();
        
        // Simulates transferring 10 tokens (with 7 decimals STROOP) to the recipient contract
        let amount_to_deliver: i128 = 10 * STROOP; 
        client.transfer(&current_contract, &recipient, &amount_to_deliver);
        amount_to_deliver
    }
}

// Mock Router capable of delivering large token quantities (50,000 SAC tokens)
#[contract]
pub struct LargeMockRouter;

#[contractimpl]
impl SwapRouterTrait for LargeMockRouter {
    pub fn execute_route(env: Env, token_out: Address, _amount_in: i128, recipient: Address, _route_data: Bytes) -> i128 {
        let client = token::Client::new(&env, &token_out);
        let current_contract = env.current_contract_address();
        
        // Simulates transferring 50,000 tokens (with 7 decimals STROOP) to recipient
        let amount_to_deliver: i128 = 50_000 * STROOP; 
        client.transfer(&current_contract, &recipient, &amount_to_deliver);
        amount_to_deliver
    }
}

#[test]
fn test_order_placement_and_cancellation() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "NVDA");

    // Add NVDA wrapper
    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    let pay_amount = 100 * STROOP; // 100 USDC (7 decimals)
    let min_shares = 1 * WAD;      // 1 full share (18 decimals)
    let deadline = env.ledger().timestamp() + 3600;
    let wrapper_mask = 1u32;       // Issuer::BStocks

    // Place Buy Order
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &wrapper_mask);
    assert_eq!(order_id, 0);

    let order = book_client.get_order(&order_id);
    assert_eq!(order.id, 0);
    assert_eq!(order.amount, pay_amount);
    assert_eq!(order.limit, min_shares);
    assert_eq!(order.status, OrderStatus::Open);

    // Cancel Order
    book_client.cancel(&order_id);
    let cancelled_order = book_client.get_order(&order_id);
    assert_eq!(cancelled_order.status, OrderStatus::Cancelled);
}

#[test]
fn test_wrapper_multiplier_units() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(token_admin);
    let ticker = Symbol::new(&env, "AAPL");

    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::Ondo, &false);

    // Default multiplier is 1 WAD (1.0)
    let unit = reg_client.shares_per_token(&stock_token);
    assert_eq!(unit, WAD);

    // Set custom multiplier reflecting a stock dividend or split (e.g. 1.05 shares per token)
    let new_unit = 105 * WAD / 100;
    reg_client.set_custom_unit(&stock_token, &new_unit);
    assert_eq!(reg_client.shares_per_token(&stock_token), new_unit);
}

#[test]
fn test_fill_buy_order_share_floor() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let filler = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "NVDA");

    // Allowlist wrapper and mock router
    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);
    let router_id = env.register_contract(None, MockRouter);
    reg_client.set_router(&router_id, &true);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    // Fund owner with USDC and mock router with stock tokens
    let usdc_token_client = token::StellarAssetClient::new(&env, &usdc);
    usdc_token_client.mint(&owner, &(1000 * STROOP));
    let stock_stellar_client = token::StellarAssetClient::new(&env, &stock_token);
    stock_stellar_client.mint(&router_id, &(100 * STROOP));

    // Place buy order: spend 100 USDC for at least 5 NVDA shares (WAD)
    let pay_amount = 100 * STROOP;
    let min_shares = 5 * WAD; // 5 full shares
    let deadline = env.ledger().timestamp() + 3600;
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &1u32);

    // Mock router delivers 10 tokens = 10 shares (unit = 1.0)
    // 10 shares >= 5 shares min floor -> fill MUST SUCCEED
    let route_data = Bytes::new(&env);
    book_client.fill(&filler, &order_id, &0u32, &router_id, &route_data);

    let filled_order = book_client.get_order(&order_id);
    assert_eq!(filled_order.status, OrderStatus::Filled);

    // Owner must receive delivered tokens
    let stock_client = token::Client::new(&env, &stock_token);
    assert_eq!(stock_client.balance(&owner), 10 * STROOP);
}

#[test]
fn test_pause_circuit_breaker() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    assert_eq!(book_client.is_paused(), false);
    book_client.set_paused(&true);
    assert_eq!(book_client.is_paused(), true);
    book_client.set_paused(&false);
    assert_eq!(book_client.is_paused(), false);
}

#[test]
fn test_batch_fill_multiple_orders() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let filler = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "AAPL");

    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::Ondo, &false);
    let router_id = env.register_contract(None, MockRouter);
    reg_client.set_router(&router_id, &true);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    let usdc_token_client = token::StellarAssetClient::new(&env, &usdc);
    usdc_token_client.mint(&owner1, &(500 * STROOP));
    usdc_token_client.mint(&owner2, &(500 * STROOP));

    let stock_stellar_client = token::StellarAssetClient::new(&env, &stock_token);
    stock_stellar_client.mint(&router_id, &(100 * STROOP));

    let deadline = env.ledger().timestamp() + 3600;
    let order_id1 = book_client.place_buy(&owner1, &ticker, &(100 * STROOP), &(5 * WAD), &deadline, &2u32);
    let order_id2 = book_client.place_buy(&owner2, &ticker, &(100 * STROOP), &(5 * WAD), &deadline, &2u32);

    let mut fills = soroban_sdk::Vec::new(&env);
    fills.push_back(crate::types::FillArgs {
        order_id: order_id1,
        wrapper_idx: 0,
        router: router_id.clone(),
        route_data: Bytes::new(&env),
    });
    fills.push_back(crate::types::FillArgs {
        order_id: order_id2,
        wrapper_idx: 0,
        router: router_id,
        route_data: Bytes::new(&env),
    });

    let filled_count = book_client.batch_fill(&filler, &fills);
    assert_eq!(filled_count, 2);

    assert_eq!(book_client.get_order(&order_id1).status, OrderStatus::Filled);
    assert_eq!(book_client.get_order(&order_id2).status, OrderStatus::Filled);
}

#[test]
fn test_governance_admin_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let new_multisig = Address::generate(&env);
    let usdc = Address::generate(&env);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);
    reg_client.set_admin(&new_multisig);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);
    book_client.set_admin(&new_multisig);
}

#[test]
#[should_panic(expected = "ShareFloor")]
fn test_fill_buy_order_share_floor_panic() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let filler = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "NVDA");

    // Allowlist NVDA wrapper and standard MockRouter
    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);
    let router_id = env.register_contract(None, MockRouter);
    reg_client.set_router(&router_id, &true);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    // Fund owner and router
    let usdc_token_client = token::StellarAssetClient::new(&env, &usdc);
    usdc_token_client.mint(&owner, &(1000 * STROOP));
    let stock_stellar_client = token::StellarAssetClient::new(&env, &stock_token);
    stock_stellar_client.mint(&router_id, &(100 * STROOP));

    // Place buy order requiring AT LEAST 15 full shares (min_shares = 15 * WAD)
    let pay_amount = 100 * STROOP;
    let min_shares = 15 * WAD;
    let deadline = env.ledger().timestamp() + 3600;
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &1u32);

    // MockRouter delivers only 10 tokens = 10 shares (unit = 1.0).
    // 10 shares < 15 shares -> MUST panic with "ShareFloor"
    let route_data = Bytes::new(&env);
    book_client.fill(&filler, &order_id, &0u32, &router_id, &route_data);
}

#[test]
fn test_buy_order_large_fill_no_overflow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let filler = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "NVDA");

    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);
    let router_id = env.register_contract(None, LargeMockRouter);
    reg_client.set_router(&router_id, &true);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    // Large SAC token amount: 50,000 SAC tokens = 50,000 * 10^7 STROOP
    // Under un-normalized math ((tokens_out * 10^11) * unit), 50,000 * 10^36 > i128::MAX and overflows.
    // Under normalized math ((tokens_out * unit) / STROOP), max intermediate is 5 * 10^29 << i128::MAX.
    let large_sac_amount = 50_000 * STROOP;
    let pay_amount = 50_000 * STROOP;
    let min_shares = 50_000 * WAD;

    let usdc_token_client = token::StellarAssetClient::new(&env, &usdc);
    usdc_token_client.mint(&owner, &(100_000 * STROOP));
    let stock_stellar_client = token::StellarAssetClient::new(&env, &stock_token);
    stock_stellar_client.mint(&router_id, &(100_000 * STROOP));

    let deadline = env.ledger().timestamp() + 3600;
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &1u32);

    let route_data = Bytes::new(&env);
    book_client.fill(&filler, &order_id, &0u32, &router_id, &route_data);

    let filled_order = book_client.get_order(&order_id);
    assert_eq!(filled_order.status, OrderStatus::Filled);

    let stock_client = token::Client::new(&env, &stock_token);
    assert_eq!(stock_client.balance(&owner), large_sac_amount);
}

#[test]
fn test_persistent_storage_ttl_extension() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token_admin = Address::generate(&env);
    let stock_token = env.register_stellar_asset_contract(stock_token_admin);
    let ticker = Symbol::new(&env, "NVDA");
    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    let pay_amount = 100 * STROOP;
    let min_shares = 1 * WAD;
    let deadline = env.ledger().timestamp() + 3600;
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &1u32);

    // 1. Verify order exists and is retrievable
    let order = book_client.get_order(&order_id);
    assert_eq!(order.id, order_id);
    assert_eq!(order.status, OrderStatus::Open);

    // 2. Direct internal persistent storage check via as_contract
    env.as_contract(&book_id, || {
        let key = crate::book::BookDataKey::Order(order_id);
        assert!(env.storage().persistent().has(&key));
    });

    // 3. Advance ledger sequence by 150,000 ledgers (testing the 100,000..200,000 TTL extension)
    env.ledger().with_mut(|li| {
        li.sequence_number += 150_000;
    });

    // 4. Assert order entry has NOT expired and is still fully accessible
    let order_after = book_client.get_order(&order_id);
    assert_eq!(order_after.id, order_id);
    assert_eq!(order_after.status, OrderStatus::Open);

    // 5. Test sell order placement TTL extension as well
    let sell_shares = 2 * WAD;
    let min_usdc_per_share = 100 * STROOP;
    let sell_deadline = env.ledger().timestamp() + 3600;
    let sell_order_id = book_client.place_sell(&owner, &ticker, &sell_shares, &min_usdc_per_share, &sell_deadline, &1u32);

    env.as_contract(&book_id, || {
        let key = crate::book::BookDataKey::Order(sell_order_id);
        assert!(env.storage().persistent().has(&key));
    });

    let sell_order = book_client.get_order(&sell_order_id);
    assert_eq!(sell_order.status, OrderStatus::Open);
}

#[test]
fn test_benji_share_equivalence() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let filler = Address::generate(&env);
    let usdc_admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract(usdc_admin);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let benji_token_admin = Address::generate(&env);
    let benji_token = env.register_stellar_asset_contract(benji_token_admin);
    let ticker = Symbol::new(&env, "BENJI");

    // Add Franklin Templeton BENJI wrapper with Issuer::Benji
    reg_client.add_wrapper(&ticker, &benji_token, &Issuer::Benji, &false);
    let router_id = env.register_contract(None, MockRouter);
    reg_client.set_router(&router_id, &true);

    // 1. Verify 1:1 NAV Parity in Registry: 1 token = 1 share = 1 WAD (1e18)
    let unit = reg_client.shares_per_token(&benji_token);
    assert_eq!(unit, WAD);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    let usdc_token_client = token::StellarAssetClient::new(&env, &usdc);
    usdc_token_client.mint(&owner, &(500 * STROOP));
    let benji_stellar_client = token::StellarAssetClient::new(&env, &benji_token);
    benji_stellar_client.mint(&router_id, &(100 * STROOP));

    // Place buy order for BENJI: 100 USDC for 10 BENJI shares
    // Issuer::Benji is bit 3: 1 << 3 = 8u32
    let benji_mask = 1u32 << (Issuer::Benji as u32);
    assert_eq!(benji_mask, 8u32);

    let pay_amount = 100 * STROOP;
    let min_shares = 10 * WAD; // 10 shares at 1:1 NAV parity
    let deadline = env.ledger().timestamp() + 3600;
    let order_id = book_client.place_buy(&owner, &ticker, &pay_amount, &min_shares, &deadline, &benji_mask);

    // MockRouter delivers 10 tokens. Under 1:1 NAV parity, 10 tokens = 10 shares.
    let route_data = Bytes::new(&env);
    book_client.fill(&filler, &order_id, &0u32, &router_id, &route_data);

    let filled_order = book_client.get_order(&order_id);
    assert_eq!(filled_order.status, OrderStatus::Filled);

    let benji_client = token::Client::new(&env, &benji_token);
    assert_eq!(benji_client.balance(&owner), 10 * STROOP);
}

#[test]
fn test_all_four_equities_registered() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    // Register all 4 target equities (NVDA, AAPL, TSLA, BENJI)
    let nvda_token = env.register_stellar_asset_contract(Address::generate(&env));
    let aapl_token = env.register_stellar_asset_contract(Address::generate(&env));
    let tsla_token = env.register_stellar_asset_contract(Address::generate(&env));
    let benji_token = env.register_stellar_asset_contract(Address::generate(&env));

    let nvda_sym = Symbol::new(&env, "NVDA");
    let aapl_sym = Symbol::new(&env, "AAPL");
    let tsla_sym = Symbol::new(&env, "TSLA");
    let benji_sym = Symbol::new(&env, "BENJI");

    reg_client.add_wrapper(&nvda_sym, &nvda_token, &Issuer::BStocks, &false);
    reg_client.add_wrapper(&aapl_sym, &aapl_token, &Issuer::BStocks, &false);
    reg_client.add_wrapper(&tsla_sym, &tsla_token, &Issuer::BStocks, &false);
    reg_client.add_wrapper(&benji_sym, &benji_token, &Issuer::Benji, &false);

    // Verify wrapper counts
    assert_eq!(reg_client.wrapper_count(&nvda_sym), 1);
    assert_eq!(reg_client.wrapper_count(&aapl_sym), 1);
    assert_eq!(reg_client.wrapper_count(&tsla_sym), 1);
    assert_eq!(reg_client.wrapper_count(&benji_sym), 1);

    // Verify baseline shares_per_token returns 1.0 WAD for each
    assert_eq!(reg_client.shares_per_token(&nvda_token), WAD);
    assert_eq!(reg_client.shares_per_token(&aapl_token), WAD);
    assert_eq!(reg_client.shares_per_token(&tsla_token), WAD);
    assert_eq!(reg_client.shares_per_token(&benji_token), WAD);

    // Verify BENJI wrapper record
    let benji_wrap = reg_client.wrapper_at(&benji_sym, &0u32);
    assert_eq!(benji_wrap.token, benji_token);
    assert_eq!(benji_wrap.issuer, Issuer::Benji);
    assert_eq!(benji_wrap.active, true);
    assert_eq!(benji_wrap.instant_only, false);

    // Test custom unit update on TSLA without affecting others
    let tsla_split_unit = 3 * WAD; // 3-for-1 stock split
    reg_client.set_custom_unit(&tsla_token, &tsla_split_unit);
    assert_eq!(reg_client.shares_per_token(&tsla_token), tsla_split_unit);
    assert_eq!(reg_client.shares_per_token(&benji_token), WAD);
    assert_eq!(reg_client.shares_per_token(&nvda_token), WAD);
}

#[test]
#[should_panic(expected = "Unit must be positive")]
fn test_set_custom_unit_zero_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let token = env.register_stellar_asset_contract(Address::generate(&env));
    let ticker = Symbol::new(&env, "NVDA");
    reg_client.add_wrapper(&ticker, &token, &Issuer::BStocks, &false);

    reg_client.set_custom_unit(&token, &0);
}

#[test]
#[should_panic(expected = "Unknown wrapper")]
fn test_set_custom_unit_unregistered_wrapper_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let token = env.register_stellar_asset_contract(Address::generate(&env));
    reg_client.set_custom_unit(&token, &(1 * WAD));
}

#[test]
#[should_panic(expected = "Book is paused")]
fn test_pause_rejects_place_buy() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let usdc = Address::generate(&env);
    let reg_id = env.register_contract(None, WrapperRegistry);
    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    book_client.set_paused(&true);
    let ticker = Symbol::new(&env, "NVDA");
    book_client.place_buy(&owner, &ticker, &(100 * STROOP), &(1 * WAD), &(env.ledger().timestamp() + 3600), &1u32);
}

#[test]
#[should_panic(expected = "Order not open")]
fn test_cancel_already_cancelled_order_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let usdc = Address::generate(&env);

    let reg_id = env.register_contract(None, WrapperRegistry);
    let reg_client = WrapperRegistryClient::new(&env, &reg_id);
    reg_client.initialize(&admin, &None);

    let stock_token = env.register_stellar_asset_contract(Address::generate(&env));
    let ticker = Symbol::new(&env, "NVDA");
    reg_client.add_wrapper(&ticker, &stock_token, &Issuer::BStocks, &false);

    let book_id = env.register_contract(None, ParallaxBook);
    let book_client = ParallaxBookClient::new(&env, &book_id);
    book_client.initialize(&admin, &usdc, &reg_id);

    let order_id = book_client.place_buy(&owner, &ticker, &(100 * STROOP), &(1 * WAD), &(env.ledger().timestamp() + 3600), &1u32);
    book_client.cancel(&order_id);
    // Cancelling a second time MUST panic
    book_client.cancel(&order_id);
}
