// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {AutoReleaseKeeper} from "../src/AutoReleaseKeeper.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract AutoReleaseKeeperTest is Test {
    EscrowVault public vault;
    AutoReleaseKeeper public keeper;
    MockUSDC public usdc;

    address public arbiter = makeAddr("arbiter");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");

    uint256 constant DISPUTE_WINDOW = 3 days;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new EscrowVault(address(usdc), arbiter);
        keeper = new AutoReleaseKeeper(address(vault), 10);

        usdc.mint(buyer, 100_000_000);
    }

    function _createEscrow(bytes32 orderId, uint256 releaseWindow) internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(address(vault), 5_000_000);
        uint256 id = vault.createEscrow(orderId, seller, 5_000_000, "marketplace", releaseWindow);
        vm.stopPrank();
        return id;
    }

    function test_checkUpkeep_noReleasable() public view {
        bytes memory checkData = abi.encode(uint256(1), uint256(10));
        (bool needed,) = keeper.checkUpkeep(checkData);
        assertFalse(needed);
    }

    function test_checkUpkeep_withReleasable() public {
        vm.warp(1000);
        _createEscrow(keccak256("order-1"), 1 hours);
        _createEscrow(keccak256("order-2"), 1 hours);
        _createEscrow(keccak256("order-3"), 7 days); // Not releasable yet

        // Active state requires releaseWindow + disputeWindow
        vm.warp(1000 + 1 hours + DISPUTE_WINDOW + 1);

        bytes memory checkData = abi.encode(uint256(1), uint256(3));
        (bool needed, bytes memory performData) = keeper.checkUpkeep(checkData);

        assertTrue(needed);

        uint256[] memory ids = abi.decode(performData, (uint256[]));
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function test_performUpkeep() public {
        vm.warp(1000);
        _createEscrow(keccak256("order-1"), 1 hours);
        _createEscrow(keccak256("order-2"), 1 hours);

        // Active state requires releaseWindow + disputeWindow
        vm.warp(1000 + 1 hours + DISPUTE_WINDOW + 1);

        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;

        keeper.performUpkeep(abi.encode(ids));

        EscrowVault.Escrow memory e1 = vault.getEscrow(1);
        EscrowVault.Escrow memory e2 = vault.getEscrow(2);

        assertEq(uint256(e1.state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(uint256(e2.state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(usdc.balanceOf(seller), 10_000_000); // 5 + 5 USDC
    }

    function test_performUpkeep_skipsAlreadyReleased() public {
        vm.warp(1000);
        _createEscrow(keccak256("order-1"), 1 hours);

        vm.warp(1000 + 1 hours + DISPUTE_WINDOW + 1);

        // Release the first escrow manually
        vm.prank(buyer);
        vault.releaseFunds(1);

        // Keeper tries to auto-release — should not revert
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        keeper.performUpkeep(abi.encode(ids));

        // State should still be Completed (not AutoReleased)
        EscrowVault.Escrow memory e = vault.getEscrow(1);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Completed));
    }

    function test_maxBatchSize() public {
        vm.warp(1000);
        // Create 15 escrows, max batch is 10
        for (uint256 i = 0; i < 15; i++) {
            usdc.mint(buyer, 5_000_000);
            _createEscrow(bytes32(i), 1 hours);
        }

        // Active state requires releaseWindow + disputeWindow
        vm.warp(1000 + 1 hours + DISPUTE_WINDOW + 1);

        bytes memory checkData = abi.encode(uint256(1), uint256(15));
        (bool needed, bytes memory performData) = keeper.checkUpkeep(checkData);

        assertTrue(needed);
        uint256[] memory ids = abi.decode(performData, (uint256[]));
        assertEq(ids.length, 10); // Capped at maxBatchSize
    }

    function test_performUpkeep_forwarderAccess() public {
        vm.warp(1000);
        _createEscrow(keccak256("order-1"), 1 hours);

        vm.warp(1000 + 1 hours + DISPUTE_WINDOW + 1);

        address forwarderAddr = makeAddr("forwarder");
        address randomCaller = makeAddr("random");

        // Set forwarder — test contract is the owner
        keeper.setForwarder(forwarderAddr);

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;

        // Random caller should be rejected
        vm.prank(randomCaller);
        vm.expectRevert(AutoReleaseKeeper.NotForwarder.selector);
        keeper.performUpkeep(abi.encode(ids));

        // Forwarder should succeed
        vm.prank(forwarderAddr);
        keeper.performUpkeep(abi.encode(ids));

        EscrowVault.Escrow memory e = vault.getEscrow(1);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.AutoReleased));
    }
}
