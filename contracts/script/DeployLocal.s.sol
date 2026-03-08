// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {SessionEscrow} from "../src/SessionEscrow.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @notice Deploy all contracts against a local Anvil node (or fork) via UUPS proxy pattern.
 *
 * Deploys MockUSDC instead of real USDC, sets no fees, and uses the
 * deployer address for all roles. Mints 1,000,000 test USDC to the deployer.
 *
 * Optional env vars:
 *   PRIVATE_KEY   — deployer private key (hex, 0x-prefixed)
 *                   Defaults to Anvil account #0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Usage:
 *   bun run deploy:local
 *   # or directly (with Anvil running on localhost:8545):
 *   forge script script/DeployLocal.s.sol \
 *     --fork-url http://localhost:8545 \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 */
contract DeployLocal is Script {
    uint256 constant INITIAL_MINT = 1_000_000 * 1e6; // 1,000,000 USDC

    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        console2.log("=== Deploy Local (Anvil, UUPS Proxy) ===");
        console2.log("Deployer:  ", deployer);
        console2.log("Chain ID:  ", block.chainid);
        console2.log("---");

        vm.startBroadcast(deployerKey);

        // Deploy MockUSDC and mint test tokens to deployer
        MockUSDC usdc = new MockUSDC();
        console2.log("MockUSDC:          ", address(usdc));
        usdc.mint(deployer, INITIAL_MINT);
        console2.log("Minted 1,000,000 USDC to deployer");

        // Deploy EscrowVault implementation + proxy — no fees, deployer fills all roles
        EscrowVault vaultImpl = new EscrowVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeCall(EscrowVault.initialize, (address(usdc), deployer, deployer, 0, 0))
        );
        console2.log("EscrowVault impl:  ", address(vaultImpl));
        console2.log("EscrowVault proxy: ", address(vaultProxy));

        // Deploy SessionEscrow implementation + proxy
        SessionEscrow sessionImpl = new SessionEscrow();
        ERC1967Proxy sessionProxy = new ERC1967Proxy(
            address(sessionImpl),
            abi.encodeCall(SessionEscrow.initialize, (address(usdc), deployer))
        );
        console2.log("SessionEscrow impl:", address(sessionImpl));
        console2.log("SessionEscrow prx: ", address(sessionProxy));

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Next steps:");
        console2.log("  1. Add to .env:  ESCROW_VAULT_ADDRESS=", address(vaultProxy));
        console2.log("  2. Add to .env:  USDC_ADDRESS=", address(usdc));
        console2.log("  3. Run:          bun run sync-abi");
    }
}
