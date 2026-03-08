// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @notice Upgrade EscrowVault proxy to a new implementation.
 *
 * Required env vars:
 *   PRIVATE_KEY          — owner private key (must be current proxy owner)
 *   ESCROW_VAULT_ADDRESS — existing proxy address to upgrade
 *
 * Usage:
 *   forge script script/Upgrade.s.sol \
 *     --fork-url $BASE_SEPOLIA_RPC \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 */
contract Upgrade is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(ownerKey);
        address proxyAddress = vm.envAddress("ESCROW_VAULT_ADDRESS");

        console2.log("=== Upgrade EscrowVault ===");
        console2.log("Owner:     ", owner);
        console2.log("Proxy:     ", proxyAddress);
        console2.log("---");

        vm.startBroadcast(ownerKey);

        // Deploy new implementation
        EscrowVault newImpl = new EscrowVault();
        console2.log("New impl:  ", address(newImpl));

        // Upgrade proxy to new implementation (no initializer call needed for pure upgrades)
        UUPSUpgradeable(proxyAddress).upgradeToAndCall(address(newImpl), "");
        console2.log("Upgraded successfully");

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Verify: cast call", proxyAddress, "\"owner()\"");
    }
}
