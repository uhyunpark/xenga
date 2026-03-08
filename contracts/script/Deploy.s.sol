// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {SessionEscrow} from "../src/SessionEscrow.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @notice Deploy all production contracts to Base Sepolia via UUPS proxy pattern.
 *
 * Required env vars:
 *   PRIVATE_KEY          — deployer private key (hex, 0x-prefixed)
 *   BASE_SEPOLIA_RPC     — RPC endpoint (defaults to https://sepolia.base.org)
 *
 * Optional env vars (all have sensible defaults):
 *   USDC_ADDRESS         — USDC token address (default: Base Sepolia USDC)
 *   ARBITER_ADDRESS      — initial dispute arbiter (default: deployer)
 *   FEE_RECIPIENT        — address receiving facilitator fees (default: deployer)
 *   FEE_BPS              — fee in basis points, max 1000 (default: 100 = 1%)
 *   FEE_FLAT_USDC        — flat fee in USDC smallest units, max 50_000_000 (default: 0)
 *   FACILITATOR_ADDRESS  — SessionEscrow facilitator server address (default: deployer)
 *
 * Usage:
 *   bun run deploy
 *   # or directly:
 *   forge script script/Deploy.s.sol \
 *     --fork-url $BASE_SEPOLIA_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 */
contract Deploy is Script {
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address usdc = vm.envOr("USDC_ADDRESS", BASE_SEPOLIA_USDC);
        address arbiter = vm.envOr("ARBITER_ADDRESS", deployer);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(100));
        uint256 flatFee = vm.envOr("FEE_FLAT_USDC", uint256(0));
        address facilitator = vm.envOr("FACILITATOR_ADDRESS", deployer);

        console2.log("=== Deploy to Base Sepolia (UUPS Proxy) ===");
        console2.log("Deployer:         ", deployer);
        console2.log("USDC:             ", usdc);
        console2.log("Arbiter:          ", arbiter);
        console2.log("Fee recipient:    ", feeRecipient);
        console2.log("Fee BPS:          ", feeBps);
        console2.log("Flat fee (USDC):  ", flatFee);
        console2.log("Facilitator:      ", facilitator);
        console2.log("---");

        vm.startBroadcast(deployerKey);

        // Deploy EscrowVault implementation + proxy
        EscrowVault vaultImpl = new EscrowVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeCall(EscrowVault.initialize, (usdc, arbiter, feeRecipient, feeBps, flatFee))
        );
        EscrowVault vault = EscrowVault(address(vaultProxy));
        vault.setFacilitator(facilitator);
        console2.log("EscrowVault impl:  ", address(vaultImpl));
        console2.log("EscrowVault proxy: ", address(vaultProxy));

        // Deploy SessionEscrow implementation + proxy
        SessionEscrow sessionImpl = new SessionEscrow();
        ERC1967Proxy sessionProxy = new ERC1967Proxy(
            address(sessionImpl),
            abi.encodeCall(SessionEscrow.initialize, (usdc, facilitator))
        );
        console2.log("SessionEscrow impl:", address(sessionImpl));
        console2.log("SessionEscrow prx: ", address(sessionProxy));

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Next steps:");
        console2.log("  1. Add to .env:  ESCROW_VAULT_ADDRESS=", address(vaultProxy));
        console2.log("  2. Run:          bun run sync-abi");
        console2.log("  3. Call setFacilitator() on SessionEscrow/EscrowVault if facilitator changes");
    }
}
