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
