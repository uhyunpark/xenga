// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract EscrowVaultTest is Test {
    EscrowVault public vault;
    MockUSDC public usdc;

    address public arbiter = makeAddr("arbiter");
    address public operator = makeAddr("operator");

    uint256 public buyerPk = 0xA11CE;
    address public buyer = vm.addr(buyerPk);

    address public seller = makeAddr("seller");

    bytes32 constant ORDER_ID = keccak256("order-1");
    uint256 constant AMOUNT = 5_000_000; // 5 USDC
    uint256 constant RELEASE_WINDOW = 7 days;
    uint256 constant DISPUTE_WINDOW = 3 days;

    function setUp() public {
        usdc = new MockUSDC();
        vault = new EscrowVault(address(usdc), arbiter);

        // Mint USDC to buyer
        usdc.mint(buyer, 100_000_000); // 100 USDC
    }

    // ──────────── Helper: create escrow via approve ────────────

    function _createStandardEscrow() internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();
        return escrowId;
    }

    // ──────────── Helper: ERC-3009 signature ────────────

    function _signReceiveAuth(
        uint256 signerPk,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 typeHash = keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );

        bytes32 structHash = keccak256(abi.encode(typeHash, from, to, value, validAfter, validBefore, nonce));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));

        (v, r, s) = vm.sign(signerPk, digest);
    }

    // ──────────── Test: Standard create escrow ────────────

    function test_createEscrow() public {
        uint256 escrowId = _createStandardEscrow();

        assertEq(escrowId, 1);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
        assertEq(e.amount, AMOUNT);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Active));
        assertEq(e.orderId, ORDER_ID);
    }

    // ──────────── Test: ERC-3009 gasless deposit ────────────

    function test_createEscrowWithAuth() public {
        bytes32 nonce = keccak256("nonce-1");
        uint256 validAfter = 0;
        uint256 validBefore = type(uint256).max;

        (uint8 v, bytes32 r, bytes32 s) =
            _signReceiveAuth(buyerPk, buyer, address(vault), AMOUNT, validAfter, validBefore, nonce);

        vm.prank(operator);
        uint256 escrowId = vault.createEscrowWithAuth(
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, buyer, validAfter, validBefore, nonce, v, r, s
        );

        assertEq(escrowId, 1);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
    }

    // ──────────── Test: Happy path — create → confirm → release ────────────

    function test_happyPath() public {
        uint256 escrowId = _createStandardEscrow();

        // Seller confirms delivery
        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.DeliveryConfirmed));

        // Buyer releases funds
        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Completed));
        assertEq(usdc.balanceOf(seller), AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    // ──────────── Test: Buyer releases directly (without delivery confirmation) ────────────

    function test_buyerReleasesWithoutConfirmation() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Completed));
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    // ──────────── Test: Auto-release after timeout (Active state needs releaseWindow + disputeWindow) ────────────

    function test_autoRelease() public {
        vm.warp(1000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        // Cannot auto-release before releaseWindow + disputeWindow (Active state)
        vm.warp(1000 + RELEASE_WINDOW + 1);
        vm.expectRevert(EscrowVault.ReleaseWindowNotPassed.selector);
        vault.autoRelease(escrowId);

        // Warp past releaseWindow + disputeWindow
        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);

        vault.autoRelease(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    // ──────────── Test: Auto-release blocked during dispute window ────────────

    function test_autoRelease_blockedDuringDisputeWindow() public {
        // Start at a known time
        vm.warp(1000);

        // Create escrow with 7-day release window at t=1000
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        // Seller confirms delivery at t=1000 + 6 days (near end of 7-day release window)
        vm.warp(1000 + 6 days);
        vm.prank(seller);
        vault.confirmDelivery(escrowId);
        // deliveryConfirmedAt = 1000 + 6 days
        // dispute window ends at 1000 + 6 days + 3 days = 1000 + 9 days

        // At t=1000+7days+1: release window passed, but dispute window still active
        vm.warp(1000 + 7 days + 1);
        vm.expectRevert(EscrowVault.DisputeWindowActive.selector);
        vault.autoRelease(escrowId);

        // At t=1000+9days+1: both windows passed — auto-release should succeed
        vm.warp(1000 + 9 days + 1);
        vault.autoRelease(escrowId);

        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    // ──────────── Test: Dispute → resolve with split ────────────

    function test_disputeAndResolve() public {
        uint256 escrowId = _createStandardEscrow();

        // Seller confirms delivery
        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        // Buyer disputes within window
        vm.prank(buyer);
        vault.dispute(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Disputed));

        // Arbiter resolves: 70% to buyer, 30% to seller
        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 70);

        e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Resolved));
        assertEq(usdc.balanceOf(buyer), 100_000_000 - AMOUNT + 3_500_000); // original - deposit + 70%
        assertEq(usdc.balanceOf(seller), 1_500_000); // 30%
    }

    // ──────────── Test: Refund before delivery ────────────

    function test_sellerRefund() public {
        uint256 escrowId = _createStandardEscrow();
        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(seller);
        vault.refund(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Refunded));
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + AMOUNT);
    }

    // ──────────── Test: Arbiter can refund ────────────

    function test_arbiterRefund() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(arbiter);
        vault.refund(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Refunded));
    }

    // ──────────── Test: Access control ────────────

    function test_onlyBuyerCanRelease() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vm.expectRevert(EscrowVault.NotBuyer.selector);
        vault.releaseFunds(escrowId);

        vm.prank(operator);
        vm.expectRevert(EscrowVault.NotBuyer.selector);
        vault.releaseFunds(escrowId);
    }

    function test_onlySellerCanConfirmDelivery() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vm.expectRevert(EscrowVault.NotSeller.selector);
        vault.confirmDelivery(escrowId);
    }

    function test_onlyBuyerCanDispute() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(seller);
        vm.expectRevert(EscrowVault.NotBuyer.selector);
        vault.dispute(escrowId);
    }

    function test_onlyArbiterCanResolve() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(buyer);
        vm.expectRevert(EscrowVault.NotArbiter.selector);
        vault.resolveDispute(escrowId, 50);
    }

    function test_unauthorizedRefund() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(operator);
        vm.expectRevert(EscrowVault.NotAuthorized.selector);
        vault.refund(escrowId);
    }

    // ──────────── Test: Edge cases ────────────

    function test_cannotDoubleRelease() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        vm.prank(buyer);
        vm.expectRevert();
        vault.releaseFunds(escrowId);
    }

    function test_cannotCreateWithZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(EscrowVault.InvalidAmount.selector);
        vault.createEscrow(ORDER_ID, seller, 0, "marketplace", RELEASE_WINDOW);
    }

    function test_cannotCreateWithZeroAddress() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        vault.createEscrow(ORDER_ID, address(0), AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();
    }

    function test_disputeAfterWindowExpired() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        // Warp past dispute window
        vm.warp(block.timestamp + 3 days + 1);

        vm.prank(buyer);
        vm.expectRevert(EscrowVault.DisputeWindowExpired.selector);
        vault.dispute(escrowId);
    }

    function test_invalidDisputePercentage() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vm.expectRevert(EscrowVault.InvalidPercentage.selector);
        vault.resolveDispute(escrowId, 101);
    }

    function test_resolveDisputeFullBuyer() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 100);

        assertEq(usdc.balanceOf(buyer), buyerBalBefore + AMOUNT);
        assertEq(usdc.balanceOf(seller), 0);
    }

    function test_resolveDisputeFullSeller() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 0);

        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    function test_expiredERC3009Auth() public {
        bytes32 nonce = keccak256("nonce-expired");
        uint256 validAfter = 0;
        uint256 validBefore = block.timestamp; // Already expired

        (uint8 v, bytes32 r, bytes32 s) =
            _signReceiveAuth(buyerPk, buyer, address(vault), AMOUNT, validAfter, validBefore, nonce);

        vm.prank(operator);
        vm.expectRevert(); // MockUSDC AuthorizationExpired
        vault.createEscrowWithAuth(
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, buyer, validAfter, validBefore, nonce, v, r, s
        );
    }

    function test_doubleUseERC3009Nonce() public {
        bytes32 nonce = keccak256("nonce-double");
        uint256 validAfter = 0;
        uint256 validBefore = type(uint256).max;

        (uint8 v, bytes32 r, bytes32 s) =
            _signReceiveAuth(buyerPk, buyer, address(vault), AMOUNT, validAfter, validBefore, nonce);

        vm.prank(operator);
        vault.createEscrowWithAuth(
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, buyer, validAfter, validBefore, nonce, v, r, s
        );

        // Try to reuse the same nonce
        vm.prank(operator);
        vm.expectRevert(); // MockUSDC AuthorizationAlreadyUsed
        vault.createEscrowWithAuth(
            keccak256("order-2"),
            seller,
            AMOUNT,
            "marketplace",
            RELEASE_WINDOW,
            buyer,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
    }

    function test_isReleasable() public {
        vm.warp(1000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        assertFalse(vault.isReleasable(escrowId));

        // Active state requires releaseWindow + disputeWindow
        vm.warp(1000 + RELEASE_WINDOW + 1);
        assertFalse(vault.isReleasable(escrowId));

        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);
        assertTrue(vault.isReleasable(escrowId));
    }

    function test_multipleEscrows() public {
        uint256 id1 = _createStandardEscrow();

        usdc.mint(buyer, 100_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 10_000_000);
        uint256 id2 = vault.createEscrow(keccak256("order-2"), seller, 10_000_000, "agent-service", 1 hours);
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);

        EscrowVault.Escrow memory e1 = vault.getEscrow(id1);
        EscrowVault.Escrow memory e2 = vault.getEscrow(id2);

        assertEq(e1.releaseWindow, RELEASE_WINDOW);
        assertEq(e2.releaseWindow, 1 hours);
    }

    // ──────────── Test: Buyer cannot equal seller ────────────

    function test_buyerCannotEqualSeller() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        // buyer == seller (msg.sender is buyer, and seller param is also buyer)
        vault.createEscrow(ORDER_ID, buyer, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();
    }

    // ──────────── Test: Owner can change arbiter (Ownable2Step) ────────────

    function test_setArbiter() public {
        address newArbiter = makeAddr("newArbiter");
        // address(this) is the owner since the test contract deployed the vault
        vault.setArbiter(newArbiter);
        assertEq(vault.arbiter(), newArbiter);
    }

    // ──────────── Test: Non-owner cannot change arbiter ────────────

    function test_setArbiterNotOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        vault.setArbiter(makeAddr("newArbiter"));
    }

    // ──────────── Test: Dispute from Active state ────────────

    function test_disputeFromActiveState() public {
        vm.warp(1000);

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        // Too early — before releaseWindow - disputeWindow
        vm.warp(1000 + RELEASE_WINDOW - DISPUTE_WINDOW - 1);
        vm.prank(buyer);
        vm.expectRevert(EscrowVault.DisputeWindowNotStarted.selector);
        vault.dispute(escrowId);

        // Within the dispute window for Active state (releaseWindow - disputeWindow <= t <= releaseWindow + disputeWindow)
        vm.warp(1000 + RELEASE_WINDOW - DISPUTE_WINDOW);
        vm.prank(buyer);
        vault.dispute(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Disputed));
    }

    // ──────────── Test: Active state auto-release extends window ────────────

    function test_autoReleaseActiveStateExtendsWindow() public {
        vm.warp(1000);

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        // Just past releaseWindow — should fail because Active state requires releaseWindow + disputeWindow
        vm.warp(1000 + RELEASE_WINDOW + 1);
        vm.expectRevert(EscrowVault.ReleaseWindowNotPassed.selector);
        vault.autoRelease(escrowId);

        // Just before the extended window
        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW - 1);
        vm.expectRevert(EscrowVault.ReleaseWindowNotPassed.selector);
        vault.autoRelease(escrowId);

        // Past the extended window — should succeed
        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);
        vault.autoRelease(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    // ──────────── Test: Pause blocks creation ────────────

    function test_pauseBlocksCreation() public {
        // Owner (address(this)) pauses the vault
        vault.pause();

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(); // EnforcedPause
        vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();
    }

    // ──────────── Test: Fuzz — resolve dispute ────────────

    function testFuzz_resolveDispute(uint256 buyerPct) public {
        vm.assume(buyerPct <= 100);

        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, buyerPct);

        uint256 expectedBuyerAmount = (AMOUNT * buyerPct) / 100;
        uint256 expectedSellerAmount = AMOUNT - expectedBuyerAmount;

        assertEq(usdc.balanceOf(buyer), buyerBalBefore + expectedBuyerAmount);
        assertEq(usdc.balanceOf(seller), expectedSellerAmount);
    }

    // ──────────── Test: Fuzz — create escrow ────────────

    function testFuzz_createEscrow(uint256 amount) public {
        vm.assume(amount > 0 && amount < 1e18);

        usdc.mint(buyer, amount);

        vm.startPrank(buyer);
        usdc.approve(address(vault), amount);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, amount, "marketplace", RELEASE_WINDOW);
        vm.stopPrank();

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.amount, amount);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Active));
    }
}
