// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract EscrowVaultTest is Test {
    EscrowVault public vault;
    EscrowVault public vaultImpl;
    MockUSDC public usdc;

    address public arbiter = makeAddr("arbiter");
    address public facilitator = makeAddr("facilitator");
    address public operator = makeAddr("operator");
    address public feeRecipient = makeAddr("feeRecipient");

    uint256 public buyerPk = 0xA11CE;
    address public buyer = vm.addr(buyerPk);

    address public seller = makeAddr("seller");

    bytes32 constant ORDER_ID = keccak256("order-1");
    bytes32 constant CONTENT_HASH = keccak256("test-content-metadata");
    uint256 constant AMOUNT = 5_000_000; // 5 USDC
    uint256 constant FEE_BPS = 100; // 1%
    uint256 constant FLAT_FEE = 50_000; // $0.05 USDC
    uint256 constant FEE = (AMOUNT * FEE_BPS) / 10000 + FLAT_FEE; // 100_000 ($0.10)
    uint256 constant RELEASE_WINDOW = 7 days;
    uint256 constant DISPUTE_WINDOW = 3 days;

    function setUp() public {
        usdc = new MockUSDC();
        vaultImpl = new EscrowVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeCall(EscrowVault.initialize, (address(usdc), arbiter, feeRecipient, FEE_BPS, FLAT_FEE))
        );
        vault = EscrowVault(address(proxy));

        vault.setFacilitator(facilitator);

        // Mint USDC to buyer
        usdc.mint(buyer, 100_000_000); // 100 USDC
    }

    // ──────────── Helper: deploy proxy with custom params ────────────

    function _deployVault(address _arbiter, address _feeRecipient, uint256 _feeBps, uint256 _flatFee) internal returns (EscrowVault) {
        EscrowVault impl = new EscrowVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(EscrowVault.initialize, (address(usdc), _arbiter, _feeRecipient, _feeBps, _flatFee))
        );
        return EscrowVault(address(proxy));
    }

    // ──────────── Helper: create escrow via approve ────────────

    function _createStandardEscrow() internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        assertEq(e.facilitatorFee, FEE);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Active));
        assertEq(e.orderId, ORDER_ID);
        assertEq(e.contentHash, CONTENT_HASH);
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
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH, buyer, validAfter, validBefore, nonce, v, r, s
        );

        assertEq(escrowId, 1);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
        assertEq(e.contentHash, CONTENT_HASH);
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
        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    // ──────────── Test: Buyer releases directly (without delivery confirmation) ────────────

    function test_buyerReleasesWithoutConfirmation() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Completed));
        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
    }

    // ──────────── Test: Auto-release after timeout (Active state needs releaseWindow + disputeWindow) ────────────

    function test_autoRelease() public {
        vm.warp(1000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
    }

    // ──────────── Test: Auto-release blocked during dispute window ────────────

    function test_autoRelease_blockedDuringDisputeWindow() public {
        // Start at a known time
        vm.warp(1000);

        // Create escrow with 7-day release window at t=1000
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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

        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
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
        uint256 tradeAmount = AMOUNT - FEE;
        uint256 expectedBuyer = (tradeAmount * 70) / 100;
        uint256 expectedSeller = tradeAmount - expectedBuyer;
        assertEq(usdc.balanceOf(buyer), 100_000_000 - AMOUNT + expectedBuyer);
        assertEq(usdc.balanceOf(seller), expectedSeller);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
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

    function test_onlySellerOrFacilitatorCanConfirmDelivery() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vm.expectRevert(EscrowVault.NotAuthorized.selector);
        vault.confirmDelivery(escrowId);

        vm.prank(operator);
        vm.expectRevert(EscrowVault.NotAuthorized.selector);
        vault.confirmDelivery(escrowId);
    }

    function test_facilitatorCanConfirmDelivery() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(facilitator);
        vault.confirmDelivery(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.DeliveryConfirmed));
    }

    function test_facilitatorRefund() public {
        uint256 escrowId = _createStandardEscrow();
        uint256 buyerBalBefore = usdc.balanceOf(buyer);

        vm.prank(facilitator);
        vault.refund(escrowId);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Refunded));
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + AMOUNT);
    }

    function test_setFacilitator() public {
        address newFacilitator = makeAddr("newFacilitator");
        vault.setFacilitator(newFacilitator);
        assertEq(vault.facilitator(), newFacilitator);
    }

    function test_setFacilitatorNotOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, nonOwner));
        vault.setFacilitator(makeAddr("newFacilitator"));
    }

    function test_facilitatorConfirmThenDispute() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(facilitator);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 70);

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Resolved));
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
        vault.createEscrow(ORDER_ID, seller, 0, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
    }

    function test_cannotCreateWithZeroAddress() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        vault.createEscrow(ORDER_ID, address(0), AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();
    }

    function test_cannotCreateWithReleaseWindowTooShort() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(EscrowVault.ReleaseWindowTooShort.selector);
        vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", 1 hours, CONTENT_HASH);
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

        assertEq(usdc.balanceOf(buyer), buyerBalBefore + AMOUNT - FEE);
        assertEq(usdc.balanceOf(seller), 0);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
    }

    function test_resolveDisputeFullSeller() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 0);

        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
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
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH, buyer, validAfter, validBefore, nonce, v, r, s
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
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH, buyer, validAfter, validBefore, nonce, v, r, s
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
            CONTENT_HASH,
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
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        uint256 id2 = vault.createEscrow(keccak256("order-2"), seller, 10_000_000, "agent-service", 3 days, bytes32(0));
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);

        EscrowVault.Escrow memory e1 = vault.getEscrow(id1);
        EscrowVault.Escrow memory e2 = vault.getEscrow(id2);

        assertEq(e1.releaseWindow, RELEASE_WINDOW);
        assertEq(e2.releaseWindow, 3 days);
    }

    // ──────────── Test: Buyer cannot equal seller ────────────

    function test_buyerCannotEqualSeller() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        // buyer == seller (msg.sender is buyer, and seller param is also buyer)
        vault.createEscrow(ORDER_ID, buyer, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, nonOwner));
        vault.setArbiter(makeAddr("newArbiter"));
    }

    // ──────────── Test: Dispute from Active state ────────────

    function test_disputeFromActiveState() public {
        vm.warp(1000);

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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
        assertEq(usdc.balanceOf(seller), AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
    }

    // ──────────── Test: Pause blocks creation ────────────

    function test_pauseBlocksCreation() public {
        // Owner (address(this)) pauses the vault
        vault.pause();

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        vm.expectRevert(); // EnforcedPause
        vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
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

        uint256 tradeAmount = AMOUNT - FEE;
        uint256 expectedBuyerAmount = (tradeAmount * buyerPct) / 100;
        uint256 expectedSellerAmount = tradeAmount - expectedBuyerAmount;

        assertEq(usdc.balanceOf(buyer), buyerBalBefore + expectedBuyerAmount);
        assertEq(usdc.balanceOf(seller), expectedSellerAmount);
        assertEq(usdc.balanceOf(feeRecipient), FEE);
    }

    // ──────────── Test: Stats tracking ────────────

    function test_statsOnCreate() public {
        _createStandardEscrow();

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.totalEscrows, 1);
        assertEq(ss.totalAmount, AMOUNT);
        assertEq(ss.completedCount, 0);

        EscrowVault.Stats memory svc = vault.getServiceTypeStats("marketplace");
        assertEq(svc.totalEscrows, 1);
        assertEq(svc.totalAmount, AMOUNT);
    }

    function test_statsOnRelease() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.completedCount, 1);
        assertEq(ss.completedAmount, AMOUNT);

        EscrowVault.Stats memory svc = vault.getServiceTypeStats("marketplace");
        assertEq(svc.completedCount, 1);
        assertEq(svc.completedAmount, AMOUNT);
    }

    function test_statsOnAutoRelease() public {
        vm.warp(1000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);
        vault.autoRelease(escrowId);

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.completedCount, 1);
        assertEq(ss.completedAmount, AMOUNT);
    }

    function test_statsOnDispute() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.disputedCount, 1);
        assertEq(ss.disputedAmount, AMOUNT);

        EscrowVault.Stats memory svc = vault.getServiceTypeStats("marketplace");
        assertEq(svc.disputedCount, 1);
        assertEq(svc.disputedAmount, AMOUNT);
    }

    function test_statsOnResolve() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 50);

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.resolvedCount, 1);

        EscrowVault.Stats memory svc = vault.getServiceTypeStats("marketplace");
        assertEq(svc.resolvedCount, 1);
    }

    function test_statsOnRefund() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.refund(escrowId);

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.refundedCount, 1);
        assertEq(ss.refundedAmount, AMOUNT);

        EscrowVault.Stats memory svc = vault.getServiceTypeStats("marketplace");
        assertEq(svc.refundedCount, 1);
        assertEq(svc.refundedAmount, AMOUNT);
    }

    function test_statsMultipleEscrows() public {
        _createStandardEscrow();

        usdc.mint(buyer, 100_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 10_000_000);
        vault.createEscrow(keccak256("order-2"), seller, 10_000_000, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.totalEscrows, 2);
        assertEq(ss.totalAmount, AMOUNT + 10_000_000);
    }

    function test_statsAcrossServiceTypes() public {
        _createStandardEscrow(); // marketplace

        usdc.mint(buyer, 100_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 10_000_000);
        vault.createEscrow(keccak256("order-2"), seller, 10_000_000, "agent-service", 3 days, bytes32(0));
        vm.stopPrank();

        EscrowVault.Stats memory mp = vault.getServiceTypeStats("marketplace");
        assertEq(mp.totalEscrows, 1);
        assertEq(mp.totalAmount, AMOUNT);

        EscrowVault.Stats memory ag = vault.getServiceTypeStats("agent-service");
        assertEq(ag.totalEscrows, 1);
        assertEq(ag.totalAmount, 10_000_000);

        // Seller stats should aggregate both
        EscrowVault.Stats memory ss = vault.getSellerStats(seller);
        assertEq(ss.totalEscrows, 2);
        assertEq(ss.totalAmount, AMOUNT + 10_000_000);
    }

    // ──────────── Test: Buyer Stats tracking ────────────

    function test_buyerStatsOnCreate() public {
        _createStandardEscrow();

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.totalEscrows, 1);
        assertEq(bs.totalAmount, AMOUNT);
        assertEq(bs.completedCount, 0);
    }

    function test_buyerStatsOnRelease() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.completedCount, 1);
        assertEq(bs.completedAmount, AMOUNT);
    }

    function test_buyerStatsOnAutoRelease() public {
        vm.warp(1000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);
        vault.autoRelease(escrowId);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.completedCount, 1);
        assertEq(bs.completedAmount, AMOUNT);
    }

    function test_buyerStatsOnDispute() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.disputedCount, 1);
        assertEq(bs.disputedAmount, AMOUNT);
    }

    function test_buyerStatsOnResolve() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.confirmDelivery(escrowId);

        vm.prank(buyer);
        vault.dispute(escrowId);

        vm.prank(arbiter);
        vault.resolveDispute(escrowId, 50);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.resolvedCount, 1);
    }

    function test_buyerStatsOnRefund() public {
        uint256 escrowId = _createStandardEscrow();

        vm.prank(seller);
        vault.refund(escrowId);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.refundedCount, 1);
        assertEq(bs.refundedAmount, AMOUNT);
    }

    function test_buyerStatsMultipleEscrows() public {
        _createStandardEscrow();

        usdc.mint(buyer, 100_000_000);
        vm.startPrank(buyer);
        usdc.approve(address(vault), 10_000_000);
        vault.createEscrow(keccak256("order-2"), seller, 10_000_000, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.totalEscrows, 2);
        assertEq(bs.totalAmount, AMOUNT + 10_000_000);
    }

    function test_getBuyerStats() public {
        uint256 escrowId = _createStandardEscrow();

        // Release to get completed stats
        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        EscrowVault.Stats memory bs = vault.getBuyerStats(buyer);
        assertEq(bs.totalEscrows, 1);
        assertEq(bs.totalAmount, AMOUNT);
        assertEq(bs.completedCount, 1);
        assertEq(bs.completedAmount, AMOUNT);
        assertEq(bs.disputedCount, 0);
        assertEq(bs.refundedCount, 0);
    }

    // ──────────── Test: Fuzz ────────────

    function testFuzz_createEscrow(uint256 amount) public {
        vm.assume(amount > 0 && amount < 1e18);
        uint256 expectedFee = (amount * FEE_BPS) / 10000 + FLAT_FEE;
        vm.assume(expectedFee < amount); // fee must not exceed amount

        usdc.mint(buyer, amount);

        vm.startPrank(buyer);
        usdc.approve(address(vault), amount);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, amount, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.amount, amount);
        assertEq(e.facilitatorFee, expectedFee);
        assertEq(e.buyer, buyer);
        assertEq(e.seller, seller);
        assertEq(uint256(e.state), uint256(EscrowVault.EscrowState.Active));
    }

    // ──────────── Test: Fee configuration ────────────

    function test_setFeeConfig() public {
        address newRecipient = makeAddr("newFeeRecipient");
        vault.setFeeConfig(newRecipient, 200, 100_000);

        (address recipient, uint256 bps, uint256 flat) = vault.getFeeConfig();
        assertEq(recipient, newRecipient);
        assertEq(bps, 200);
        assertEq(flat, 100_000);
    }

    function test_setFeeConfigNotOwner() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, seller));
        vault.setFeeConfig(makeAddr("x"), 200, 0);
    }

    function test_feeExceedsMax() public {
        vm.expectRevert(EscrowVault.InvalidFee.selector);
        vault.setFeeConfig(feeRecipient, 1001, 0);
    }

    function test_flatFeeExceedsMax() public {
        vm.expectRevert(EscrowVault.InvalidFee.selector);
        vault.setFeeConfig(feeRecipient, 0, 50_000_001);
    }

    function test_feeWithZeroRecipient() public {
        // feeBps > 0 but feeRecipient == address(0) should revert
        vm.expectRevert(EscrowVault.InvalidFeeRecipient.selector);
        vault.setFeeConfig(address(0), 100, 0);
    }

    function test_flatFeeWithZeroRecipient() public {
        // flatFee > 0 but feeRecipient == address(0) should revert
        vm.expectRevert(EscrowVault.InvalidFeeRecipient.selector);
        vault.setFeeConfig(address(0), 0, 50_000);
    }

    function test_zeroFeeMode() public {
        // Deploy a vault with zero fee via proxy
        EscrowVault zeroFeeVault = _deployVault(arbiter, address(0), 0, 0);

        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(zeroFeeVault), AMOUNT);
        uint256 escrowId = zeroFeeVault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Escrow memory e = zeroFeeVault.getEscrow(escrowId);
        assertEq(e.facilitatorFee, 0);

        // Release — seller gets full amount, no fee transfer
        vm.prank(buyer);
        zeroFeeVault.releaseFunds(escrowId);

        assertEq(usdc.balanceOf(seller), AMOUNT);
    }

    function test_feeStoredInStruct() public {
        uint256 escrowId = _createStandardEscrow();

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.facilitatorFee, FEE);
        assertEq(e.facilitatorFee, (AMOUNT * FEE_BPS) / 10000 + FLAT_FEE);
    }

    function test_feeDistributionOnRelease() public {
        uint256 escrowId = _createStandardEscrow();

        uint256 sellerBalBefore = usdc.balanceOf(seller);
        uint256 feeBalBefore = usdc.balanceOf(feeRecipient);
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        vm.prank(buyer);
        vault.releaseFunds(escrowId);

        assertEq(usdc.balanceOf(seller), sellerBalBefore + AMOUNT - FEE);
        assertEq(usdc.balanceOf(feeRecipient), feeBalBefore + FEE);
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore - AMOUNT);
    }

    function test_fullRefundOnRefund() public {
        uint256 escrowId = _createStandardEscrow();
        uint256 buyerBalBefore = usdc.balanceOf(buyer);
        uint256 feeBalBefore = usdc.balanceOf(feeRecipient);

        vm.prank(seller);
        vault.refund(escrowId);

        // Buyer gets full amount back — facilitator absorbs cost
        assertEq(usdc.balanceOf(buyer), buyerBalBefore + AMOUNT);
        // feeRecipient gets nothing on refund
        assertEq(usdc.balanceOf(feeRecipient), feeBalBefore);
    }

    function testFuzz_feeAlwaysMatchesBpsAndFlat(uint256 amount, uint256 bps, uint256 flat) public {
        vm.assume(amount > 0 && amount < 1e18);
        vm.assume(bps <= 1000);
        vm.assume(flat <= 50_000_000);
        uint256 expectedFee = (amount * bps) / 10000 + flat;
        vm.assume(expectedFee < amount); // fee must not exceed amount

        address recipient = (bps > 0 || flat > 0) ? feeRecipient : address(0);
        EscrowVault fuzzVault = _deployVault(arbiter, recipient, bps, flat);

        usdc.mint(buyer, amount);
        vm.startPrank(buyer);
        usdc.approve(address(fuzzVault), amount);
        uint256 escrowId = fuzzVault.createEscrow(ORDER_ID, seller, amount, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Escrow memory e = fuzzVault.getEscrow(escrowId);
        assertEq(e.facilitatorFee, expectedFee);
    }

    function test_zeroFeeAllowsZeroRecipient() public {
        // feeBps = 0 and flatFee = 0 allows feeRecipient = address(0)
        vault.setFeeConfig(address(0), 0, 0);
        (address recipient, uint256 bps, uint256 flat) = vault.getFeeConfig();
        assertEq(recipient, address(0));
        assertEq(bps, 0);
        assertEq(flat, 0);
    }

    // ──────────── Test: Flat fee specific ────────────

    function test_flatFeeOnly() public {
        // Deploy vault with feeBps=0, flatFee=50_000 ($0.05) via proxy
        EscrowVault flatVault = _deployVault(arbiter, feeRecipient, 0, 50_000);

        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(flatVault), AMOUNT);
        uint256 escrowId = flatVault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();

        EscrowVault.Escrow memory e = flatVault.getEscrow(escrowId);
        assertEq(e.facilitatorFee, 50_000);

        // Release — seller gets amount minus flat fee
        vm.prank(buyer);
        flatVault.releaseFunds(escrowId);

        assertEq(usdc.balanceOf(seller), AMOUNT - 50_000);
        assertEq(usdc.balanceOf(feeRecipient), 50_000);
    }

    function test_feeExceedsAmount() public {
        // Deploy vault with flatFee equal to AMOUNT — creating escrow should revert
        EscrowVault bigFeeVault = _deployVault(arbiter, feeRecipient, 0, AMOUNT);

        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(bigFeeVault), AMOUNT);
        vm.expectRevert(EscrowVault.InvalidFee.selector);
        bigFeeVault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();
    }

    // ──────────── Test: setDisputeWindow ────────────

    function test_setDisputeWindow() public {
        uint256 newWindow = 1 days;
        vm.expectEmit(false, false, false, true);
        emit EscrowVault.DisputeWindowUpdated(3 days, newWindow);
        vault.setDisputeWindow(newWindow);
        assertEq(vault.disputeWindow(), newWindow);

        // New escrows use the updated window
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", 1 days, CONTENT_HASH);
        vm.stopPrank();
        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.disputeWindow, newWindow);
    }

    function test_setDisputeWindow_onlyOwner() public {
        address nonOwner = makeAddr("nonOwner");
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, nonOwner));
        vault.setDisputeWindow(1 days);
    }

    function test_setDisputeWindow_bounds() public {
        // Below MIN_DISPUTE_WINDOW (1 hours)
        vm.expectRevert(EscrowVault.InvalidDisputeWindow.selector);
        vault.setDisputeWindow(1 hours - 1);

        // Exactly MIN_DISPUTE_WINDOW — allowed
        vault.setDisputeWindow(1 hours);
        assertEq(vault.disputeWindow(), 1 hours);

        // Above MAX_DISPUTE_WINDOW (30 days)
        vm.expectRevert(EscrowVault.InvalidDisputeWindow.selector);
        vault.setDisputeWindow(30 days + 1);

        // Exactly MAX_DISPUTE_WINDOW — allowed
        vault.setDisputeWindow(30 days);
        assertEq(vault.disputeWindow(), 30 days);
    }

    function test_setDisputeWindow_existingEscrowsUnaffected() public {
        // Create escrow with default 3-day dispute window
        uint256 escrowId = _createStandardEscrow();
        EscrowVault.Escrow memory eBefore = vault.getEscrow(escrowId);
        assertEq(eBefore.disputeWindow, 3 days);

        // Owner changes the global dispute window
        vault.setDisputeWindow(1 hours);

        // Existing escrow still has its original window
        EscrowVault.Escrow memory eAfter = vault.getEscrow(escrowId);
        assertEq(eAfter.disputeWindow, 3 days);
    }

    // ──────────── Test: Batch auto-release ────────────

    function _createEscrowAt(uint256 time, bytes32 orderId) internal returns (uint256) {
        vm.warp(time);
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(orderId, seller, AMOUNT, "marketplace", RELEASE_WINDOW, CONTENT_HASH);
        vm.stopPrank();
        return escrowId;
    }

    function test_batchAutoRelease() public {
        uint256 id1 = _createEscrowAt(1000, keccak256("batch-1"));
        uint256 id2 = _createEscrowAt(1001, keccak256("batch-2"));
        uint256 id3 = _createEscrowAt(1002, keccak256("batch-3"));

        // Warp past all release+dispute windows
        vm.warp(1002 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);

        uint256[] memory ids = new uint256[](3);
        ids[0] = id1;
        ids[1] = id2;
        ids[2] = id3;

        uint256 released = vault.batchAutoRelease(ids);
        assertEq(released, 3);

        assertEq(uint256(vault.getEscrow(id1).state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(uint256(vault.getEscrow(id2).state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(uint256(vault.getEscrow(id3).state), uint256(EscrowVault.EscrowState.AutoReleased));

        // Seller should have received funds from all 3
        assertEq(usdc.balanceOf(seller), 3 * (AMOUNT - FEE));
        assertEq(usdc.balanceOf(feeRecipient), 3 * FEE);
    }

    function test_batchAutoRelease_partialFailure() public {
        uint256 id1 = _createEscrowAt(1000, keccak256("batch-p1"));
        uint256 id2 = _createEscrowAt(1001, keccak256("batch-p2"));

        // Refund id2 so it can't be auto-released
        vm.prank(seller);
        vault.refund(id2);

        // Warp past release window
        vm.warp(1001 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        uint256 released = vault.batchAutoRelease(ids);
        assertEq(released, 1); // Only id1 should succeed

        assertEq(uint256(vault.getEscrow(id1).state), uint256(EscrowVault.EscrowState.AutoReleased));
        assertEq(uint256(vault.getEscrow(id2).state), uint256(EscrowVault.EscrowState.Refunded));
    }

    function test_batchAutoRelease_emptyArray() public {
        uint256[] memory ids = new uint256[](0);
        uint256 released = vault.batchAutoRelease(ids);
        assertEq(released, 0);
    }

    function test_batchAutoRelease_paused() public {
        uint256 id1 = _createEscrowAt(1000, keccak256("batch-pause"));
        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);

        vault.pause();

        uint256[] memory ids = new uint256[](1);
        ids[0] = id1;

        vm.expectRevert(); // EnforcedPause
        vault.batchAutoRelease(ids);
    }

    // ──────────── Test: Batch isReleasable ────────────

    function test_batchIsReleasable() public {
        uint256 id1 = _createEscrowAt(1000, keccak256("batch-r1"));
        uint256 id2 = _createEscrowAt(2000, keccak256("batch-r2"));

        // Only warp past id1's window, not id2's
        vm.warp(1000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        bool[] memory results = vault.batchIsReleasable(ids);
        assertTrue(results[0]);
        assertFalse(results[1]); // id2 was created 1000s later

        // Warp past id2's window — both should be releasable
        vm.warp(2000 + RELEASE_WINDOW + DISPUTE_WINDOW + 1);
        results = vault.batchIsReleasable(ids);
        assertTrue(results[0]);
        assertTrue(results[1]);
    }

    // ──────────── Test: UUPS Upgrade ────────────

    function test_upgradeByOwner() public {
        // Create an escrow first
        uint256 escrowId = _createStandardEscrow();
        EscrowVault.Escrow memory eBefore = vault.getEscrow(escrowId);

        // Deploy new implementation
        EscrowVault newImpl = new EscrowVault();

        // Upgrade (owner = address(this))
        vault.upgradeToAndCall(address(newImpl), "");

        // Storage should be preserved
        EscrowVault.Escrow memory eAfter = vault.getEscrow(escrowId);
        assertEq(eAfter.buyer, eBefore.buyer);
        assertEq(eAfter.seller, eBefore.seller);
        assertEq(eAfter.amount, eBefore.amount);
        assertEq(eAfter.contentHash, eBefore.contentHash);
        assertEq(uint256(eAfter.state), uint256(eBefore.state));
    }

    function test_upgradeNotOwner_reverts() public {
        EscrowVault newImpl = new EscrowVault();

        address nonOwner = makeAddr("nonOwner");
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, nonOwner));
        vault.upgradeToAndCall(address(newImpl), "");
    }

    function test_storagePreservedAfterUpgrade() public {
        // Create multiple escrows
        uint256 id1 = _createStandardEscrow();
        usdc.mint(buyer, AMOUNT);
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 id2 = vault.createEscrow(keccak256("order-2"), seller, AMOUNT, "agent-service", 3 days, bytes32(0));
        vm.stopPrank();

        // Release one
        vm.prank(buyer);
        vault.releaseFunds(id1);

        // Capture state
        uint256 nextId = vault.nextEscrowId();
        EscrowVault.Stats memory sellerStatsBefore = vault.getSellerStats(seller);

        // Upgrade
        EscrowVault newImpl = new EscrowVault();
        vault.upgradeToAndCall(address(newImpl), "");

        // Verify all state preserved
        assertEq(vault.nextEscrowId(), nextId);
        assertEq(vault.arbiter(), arbiter);
        assertEq(vault.facilitator(), facilitator);
        assertEq(vault.disputeWindow(), 3 days);

        EscrowVault.Stats memory sellerStatsAfter = vault.getSellerStats(seller);
        assertEq(sellerStatsAfter.totalEscrows, sellerStatsBefore.totalEscrows);
        assertEq(sellerStatsAfter.completedCount, sellerStatsBefore.completedCount);

        EscrowVault.Escrow memory e2 = vault.getEscrow(id2);
        assertEq(uint256(e2.state), uint256(EscrowVault.EscrowState.Active));
        assertEq(e2.amount, AMOUNT);
    }

    function test_initializeCannotBeCalledTwice() public {
        vm.expectRevert();
        vault.initialize(address(usdc), arbiter, feeRecipient, FEE_BPS, FLAT_FEE);
    }

    // ──────────── Test: ContentHash ────────────

    function test_contentHashStoredAndEmitted() public {
        bytes32 hash = keccak256("my-content-metadata-json");

        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, hash);
        vm.stopPrank();

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.contentHash, hash);
    }

    function test_contentHashCanBeZero() public {
        vm.startPrank(buyer);
        usdc.approve(address(vault), AMOUNT);
        uint256 escrowId = vault.createEscrow(ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, bytes32(0));
        vm.stopPrank();

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.contentHash, bytes32(0));
    }

    function test_contentHashWithAuth() public {
        bytes32 hash = keccak256("auth-content-metadata");
        bytes32 nonce = keccak256("nonce-hash-test");
        uint256 validAfter = 0;
        uint256 validBefore = type(uint256).max;

        (uint8 v, bytes32 r, bytes32 s) =
            _signReceiveAuth(buyerPk, buyer, address(vault), AMOUNT, validAfter, validBefore, nonce);

        vm.prank(operator);
        uint256 escrowId = vault.createEscrowWithAuth(
            ORDER_ID, seller, AMOUNT, "marketplace", RELEASE_WINDOW, hash, buyer, validAfter, validBefore, nonce, v, r, s
        );

        EscrowVault.Escrow memory e = vault.getEscrow(escrowId);
        assertEq(e.contentHash, hash);
    }
}
