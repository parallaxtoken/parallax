// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {WrapperRegistry} from "../src/WrapperRegistry.sol";
import {ParallaxBook} from "../src/ParallaxBook.sol";
import {IWrapperRegistry} from "../src/interfaces/IWrapperRegistry.sol";

/// Deploys WrapperRegistry and ParallaxBook and registers every wrapper from the discovery-generated map
/// (packages/registry/src/wrappers.generated.json). Nothing is typed here: tokens, tickers and issuers come
/// from the evidence file; unit sources are resolved by the registry itself.
contract Deploy is Script {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant PCS_V3_SMART_ROUTER = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4;
    address internal constant PCS_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    function deployAll(address owner) public returns (WrapperRegistry registry, ParallaxBook book) {
        string memory json = vm.readFile("script/wrappers.flat.json");
        address oracle = vm.parseJsonAddress(json, ".ondoOracle");
        registry = new WrapperRegistry(owner, oracle, keccak256("https://docs.ondo.finance/addresses"));

        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        bytes32[] memory tickers = vm.parseJsonBytes32Array(json, ".tickerIds");
        string[] memory issuers = vm.parseJsonStringArray(json, ".issuers");
        string[] memory recv = vm.parseJsonStringArray(json, ".contractReceive");

        vm.startPrank(owner);
        for (uint256 i = 0; i < tokens.length; i++) {
            IWrapperRegistry.Issuer issuer = _issuer(issuers[i]);
            bool instantOnly = keccak256(bytes(recv[i])) == keccak256(bytes("REFUSED"));
            registry.addWrapper(tickers[i], tokens[i], issuer, instantOnly, keccak256(abi.encodePacked("e1:", tokens[i])));
        }
        registry.setRouter(PCS_V3_SMART_ROUTER, true, keccak256("https://developer.pancakeswap.finance"));
        registry.setRouter(PCS_V2_ROUTER, true, keccak256("https://developer.pancakeswap.finance"));
        vm.stopPrank();

        book = new ParallaxBook(IERC20(USDT), registry);
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        string memory json = vm.readFile("script/wrappers.flat.json");
        address oracle = vm.parseJsonAddress(json, ".ondoOracle");

        vm.startBroadcast(pk);
        WrapperRegistry registry = new WrapperRegistry(deployer, oracle, keccak256("https://docs.ondo.finance/addresses"));
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        bytes32[] memory tickers = vm.parseJsonBytes32Array(json, ".tickerIds");
        string[] memory issuers = vm.parseJsonStringArray(json, ".issuers");
        string[] memory recv = vm.parseJsonStringArray(json, ".contractReceive");
        for (uint256 i = 0; i < tokens.length; i++) {
            bool instantOnly = keccak256(bytes(recv[i])) == keccak256(bytes("REFUSED"));
            registry.addWrapper(tickers[i], tokens[i], _issuer(issuers[i]), instantOnly, keccak256(abi.encodePacked("e1:", tokens[i])));
        }
        registry.setRouter(PCS_V3_SMART_ROUTER, true, keccak256("https://developer.pancakeswap.finance"));
        registry.setRouter(PCS_V2_ROUTER, true, keccak256("https://developer.pancakeswap.finance"));
        ParallaxBook book = new ParallaxBook(IERC20(USDT), registry);
        vm.stopBroadcast();

        console2.log("WrapperRegistry", address(registry));
        console2.log("ParallaxBook", address(book));
        console2.log("wrappers", tokens.length);
    }

    function _issuer(string memory s) internal pure returns (IWrapperRegistry.Issuer) {
        bytes32 h = keccak256(bytes(s));
        if (h == keccak256("BSTOCKS")) return IWrapperRegistry.Issuer.BSTOCKS;
        if (h == keccak256("ONDO")) return IWrapperRegistry.Issuer.ONDO;
        if (h == keccak256("XSTOCKS")) return IWrapperRegistry.Issuer.XSTOCKS;
        revert("unknown issuer");
    }
}
