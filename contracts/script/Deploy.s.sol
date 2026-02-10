// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {AutoReleaseKeeper} from "../src/AutoReleaseKeeper.sol";

contract Deploy is Script {
    function run() external {
        // Base Sepolia USDC
        address usdc = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        address arbiter = msg.sender; // Deployer is initial arbiter

        vm.startBroadcast();

        EscrowVault vault = new EscrowVault(usdc, arbiter);
        console2.log("EscrowVault deployed at:", address(vault));

        AutoReleaseKeeper keeper = new AutoReleaseKeeper(address(vault), 20);
        console2.log("AutoReleaseKeeper deployed at:", address(keeper));

        vm.stopBroadcast();
    }
}
