// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Hourglass} from "../src/Hourglass.sol";
import {ComputeHourToken} from "../src/ComputeHourToken.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract HourglassTest is Test {
    Hourglass hg;
    MockUSDC usdc;

    address forwarder = makeAddr("forwarder");
    address provider = makeAddr("provider");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant PENALTY = 5e6; // $5/hour locked
    uint256 constant PRICE = 2.5e6; // $2.50/hour
    uint256 seriesId;
    ComputeHourToken token;

    function setUp() public {
        usdc = new MockUSDC();
        hg = new Hourglass(usdc, forwarder);

        usdc.mint(provider, 1_000e6);
        usdc.mint(alice, 1_000e6);

        vm.startPrank(provider);
        hg.registerProvider("Acme GPU Cloud", "ipfs://acme");
        usdc.approve(address(hg), type(uint256).max);
        hg.depositBond(500e6);
        seriesId = hg.createSeries(
            "H100-80GB-SXM",
            "US-EAST",
            uint64(block.timestamp),
            uint64(block.timestamp + 7 days),
            9_900,
            PENALTY,
            "Hourglass H100 US-East W42",
            "gH100-USE-W42"
        );
        hg.setPrimaryOffering(seriesId, PRICE, 50);
        vm.stopPrank();

        token = hg.getSeries(seriesId).token;
        vm.prank(alice);
        usdc.approve(address(hg), type(uint256).max);
    }

    function _buy(address who, uint256 h) internal {
        vm.prank(who);
        hg.buyPrimary(seriesId, h, h * PRICE, who);
    }

    function _redeem(address who, uint32 h) internal returns (uint256) {
        vm.prank(who);
        return hg.redeem(seriesId, h, "ssh-ed25519 AAAAC3Nz test@hourglass", bytes32(uint256(1)));
    }

    function _report(uint8 kind, uint256 leaseId, bytes memory payload) internal {
        vm.prank(forwarder);
        hg.onReport(new bytes(64), abi.encode(kind, leaseId, payload));
    }

    function test_primaryPurchaseLocksBondAndPaysProvider() public {
        uint256 providerBefore = usdc.balanceOf(provider);
        _buy(alice, 10);
        assertEq(token.balanceOf(alice), 10);
        assertEq(usdc.balanceOf(provider) - providerBefore, 10 * PRICE);
        (,,, uint256 bond, uint256 locked,,,) = hg.providers(provider);
        assertEq(bond, 500e6);
        assertEq(locked, 10 * PENALTY);
        assertEq(hg.getSeries(seriesId).primaryRemaining, 40);
    }

    function test_cannotMintBeyondBond() public {
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.InsufficientFreeBond.selector, 500e6, 101 * PENALTY));
        hg.mintHours(seriesId, bob, 101);
    }

    function test_withdrawOnlyFreeBond() public {
        _buy(alice, 10);
        vm.startPrank(provider);
        vm.expectRevert();
        hg.withdrawBond(500e6);
        hg.withdrawBond(500e6 - 10 * PENALTY);
        vm.stopPrank();
    }

    function test_tokensTradeFreely() public {
        _buy(alice, 4);
        vm.prank(alice);
        token.transfer(bob, 3);
        assertEq(token.balanceOf(bob), 3);
        _redeem(bob, 3);
        assertEq(token.balanceOf(bob), 0);
    }

    function _provision(uint256 leaseId) internal {
        _report(1, leaseId, abi.encode(bytes("sealed-box"), "https://pod-1.example/health"));
    }

    function _probe(uint256 leaseId, bool up, uint256 times) internal {
        uint256[] memory ids = new uint256[](1);
        bool[] memory ups = new bool[](1);
        ids[0] = leaseId;
        ups[0] = up;
        for (uint256 i; i < times; ++i) {
            _report(2, 0, abi.encode(ids, ups));
        }
    }

    function test_happyPath_deliveredAboveSla() public {
        _buy(alice, 2);
        uint256 leaseId = _redeem(alice, 2);
        _provision(leaseId);
        assertEq(uint8(hg.getLease(leaseId).status), uint8(Hourglass.LeaseStatus.Active));
        (uint256[] memory ids, string[] memory urls) = hg.activeLeases();
        assertEq(ids.length, 1);
        assertEq(urls[0], "https://pod-1.example/health");

        _probe(leaseId, true, 100);
        vm.expectRevert(Hourglass.TooEarly.selector);
        hg.settle(leaseId);
        vm.warp(block.timestamp + 2 hours);

        uint256 before = usdc.balanceOf(alice);
        hg.settle(leaseId);
        assertEq(usdc.balanceOf(alice), before);
        (,,, uint256 bond, uint256 locked, uint64 hoursDelivered, uint32 settled,) = hg.providers(provider);
        assertEq(locked, 0);
        assertEq(bond, 500e6);
        assertEq(settled, 1);
        assertEq(hoursDelivered, 2);
        (ids,) = hg.activeLeases();
        assertEq(ids.length, 0);
    }

    function test_slaBreachPaysProRata() public {
        _buy(alice, 4);
        uint256 leaseId = _redeem(alice, 4);
        _provision(leaseId);
        _probe(leaseId, true, 75);
        _probe(leaseId, false, 25); // 75% uptime < 99% SLA
        assertEq(hg.currentUptimeBps(leaseId), 7_500);
        vm.warp(block.timestamp + 4 hours);
        uint256 before = usdc.balanceOf(alice);
        hg.settle(leaseId);
        uint256 expected = (4 * PENALTY * 2_500) / 10_000;
        assertEq(usdc.balanceOf(alice) - before, expected);
        (,,, uint256 bond, uint256 locked,,,) = hg.providers(provider);
        assertEq(bond, 500e6 - expected);
        assertEq(locked, 0);
    }

    function test_probesAfterTermIgnored() public {
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        _provision(leaseId);
        _probe(leaseId, true, 10);
        vm.warp(block.timestamp + 1 hours + 1);
        _probe(leaseId, false, 10);
        assertEq(hg.getLease(leaseId).probesTotal, 10);
    }

    function test_probesForUnknownOrInactiveLeaseDoNotRevertBatch() public {
        _buy(alice, 2);
        uint256 a = _redeem(alice, 1);
        uint256 b = _redeem(alice, 1);
        _provision(a);
        uint256[] memory ids = new uint256[](3);
        bool[] memory ups = new bool[](3);
        (ids[0], ids[1], ids[2]) = (a, b, 999);
        (ups[0], ups[1], ups[2]) = (true, true, true);
        _report(2, 0, abi.encode(ids, ups));
        assertEq(hg.getLease(a).probesTotal, 1);
        assertEq(hg.getLease(b).probesTotal, 0);
    }

    function test_noProbesSettlesAsDelivered() public {
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        _provision(leaseId);
        vm.warp(block.timestamp + 1 hours);
        hg.settle(leaseId);
        assertEq(hg.getLease(leaseId).uptimeBps, 10_000);
    }

    function test_reportedFailureSlashesFully() public {
        _buy(alice, 3);
        uint256 leaseId = _redeem(alice, 3);
        uint256 before = usdc.balanceOf(alice);
        _report(3, leaseId, "");
        assertEq(usdc.balanceOf(alice) - before, 3 * PENALTY);
        assertEq(uint8(hg.getLease(leaseId).status), uint8(Hourglass.LeaseStatus.Slashed));
    }

    function test_provisionTimeoutIsPermissionless() public {
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        vm.expectRevert(Hourglass.TooEarly.selector);
        hg.claimProvisionTimeout(leaseId);
        vm.warp(block.timestamp + 31 minutes);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(bob);
        hg.claimProvisionTimeout(leaseId);
        assertEq(usdc.balanceOf(alice) - before, PENALTY);
    }

    function test_onlyForwarderCanReport() public {
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.InvalidSender.selector, alice));
        hg.onReport(new bytes(64), abi.encode(uint8(3), leaseId, bytes("")));
    }

    function test_workflowOwnerCheck() public {
        address wfOwner = makeAddr("wfOwner");
        hg.setExpectedWorkflowOwner(wfOwner);
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);

        bytes memory badMeta = abi.encodePacked(bytes32(0), bytes10(0), address(0xdead), bytes2(0));
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.InvalidWorkflowOwner.selector, address(0xdead)));
        hg.onReport(badMeta, abi.encode(uint8(3), leaseId, bytes("")));

        bytes memory goodMeta = abi.encodePacked(bytes32(0), bytes10(0), wfOwner, bytes2(0));
        vm.prank(forwarder);
        hg.onReport(goodMeta, abi.encode(uint8(3), leaseId, bytes("")));
    }

    function test_multipleForwarders() public {
        address sim = makeAddr("creSimulationForwarder");
        hg.setForwarder(sim, true);
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        vm.prank(sim);
        hg.onReport(new bytes(64), abi.encode(uint8(1), leaseId, abi.encode(bytes("x"), "u")));
        hg.setForwarder(sim, false);
        vm.prank(sim);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.InvalidSender.selector, sim));
        hg.onReport(new bytes(64), abi.encode(uint8(3), leaseId, bytes("")));
    }

    function test_onlyOwnerManagesForwarders() public {
        vm.prank(alice);
        vm.expectRevert();
        hg.setForwarder(alice, true);
    }

    function test_cannotDoubleSettle() public {
        _buy(alice, 1);
        uint256 leaseId = _redeem(alice, 1);
        _report(3, leaseId, "");
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.BadLeaseState.selector, Hourglass.LeaseStatus.Slashed));
        hg.onReport(new bytes(64), abi.encode(uint8(3), leaseId, bytes("")));
    }

    function test_redeemMustFitWindow() public {
        _buy(alice, 5);
        vm.warp(block.timestamp + 7 days - 2 hours);
        vm.prank(alice);
        vm.expectRevert(Hourglass.OutsideDeliveryWindow.selector);
        hg.redeem(seriesId, 3, "k", bytes32(0));
        _redeem(alice, 2);
    }

    function test_releaseExpiredUnlocksUnredeemed() public {
        _buy(alice, 5);
        _redeem(alice, 2);
        vm.warp(block.timestamp + 7 days + 1);
        hg.releaseExpired(seriesId);
        (,,,, uint256 locked,,,) = hg.providers(provider);
        assertEq(locked, 2 * PENALTY); // open lease still locked
    }

    function test_slippageGuard() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Hourglass.PriceAboveMax.selector, 2 * PRICE, PRICE));
        hg.buyPrimary(seriesId, 2, PRICE, alice);
    }

    function testFuzz_settlementNeverOverpays(uint16 uptime, uint8 h) public {
        uptime = uint16(bound(uptime, 0, 10_000));
        vm.pauseGasMetering();
        h = uint8(bound(h, 1, 50));
        _buy(alice, h);
        uint256 leaseId = _redeem(alice, h);
        _provision(leaseId);
        _probe(leaseId, true, uptime / 100);
        _probe(leaseId, false, 100 - uptime / 100);
        vm.warp(block.timestamp + uint256(h) * 1 hours);
        uint256 before = usdc.balanceOf(alice);
        hg.settle(leaseId);
        assertLe(usdc.balanceOf(alice) - before, uint256(h) * PENALTY);
        (,,,, uint256 locked,,,) = hg.providers(provider);
        assertEq(locked, 0);
    }
}
