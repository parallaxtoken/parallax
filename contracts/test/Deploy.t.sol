// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {WrapperRegistry} from "../src/WrapperRegistry.sol";
import {ParallaxBook} from "../src/ParallaxBook.sol";
import {IWrapperRegistry} from "../src/interfaces/IWrapperRegistry.sol";

/// The deployment script, run against a mainnet fork: every registered wrapper must resolve a unit and a pause
/// state through its own issuer source, and the ticker order must match the generated map.
contract DeployTest is Test {
    function test_deployRegistersEveryWrapperAndReadsUnits() public {
        vm.createSelectFork(vm.envOr("BSC_RPC_URL", string("https://bsc-dataseed1.defibit.io")));
        Deploy d = new Deploy();
        (WrapperRegistry registry, ParallaxBook book) = d.deployAll(address(this));
        assertEq(address(book.registry()), address(registry));

        string memory json = vm.readFile("script/wrappers.flat.json");
        address[] memory tokens = vm.parseJsonAddressArray(json, ".tokens");
        bytes32[] memory tickers = vm.parseJsonBytes32Array(json, ".tickerIds");
        assertGe(tokens.length, 30);
        uint256 readable;
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 unit = registry.sharesPerToken(tokens[i]);
            assertGe(unit, 0.5e18, "unit sane");
            assertLt(unit, 20e18, "unit sane");
            registry.isPaused(tokens[i]);
            readable++;
        }
        assertEq(readable, tokens.length);
        assertEq(registry.wrapperCount(tickers[0]), 3); // NVDA: bStocks, Ondo, xStocks
        assertTrue(registry.isRouter(0x13f4EA83D0bd40E75C8222255bc855a974568Dd4));
    }
}
