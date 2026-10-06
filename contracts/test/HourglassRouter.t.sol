// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Hourglass} from "../src/Hourglass.sol";
import {HourglassRouter} from "../src/HourglassRouter.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

contract HourglassRouterTest is Test {
    Hourglass hg;
    HourglassRouter router;
    MockUSDC usdc;
    address provider = makeAddr("provider");
    address intermediary = makeAddr("auroraIntermediary");
    address user = makeAddr("user");
    uint256 sid;

    function setUp() public {
        usdc = new MockUSDC();
        hg = new Hourglass(usdc, makeAddr("fwd"));
        router = new HourglassRouter(hg);
        usdc.mint(provider, 1_000e6);
        vm.startPrank(provider);
        hg.registerProvider("p", "");
        usdc.approve(address(hg), type(uint256).max);
        hg.depositBond(500e6);
        sid = hg.createSeries("H100", "US", uint64(block.timestamp), uint64(block.timestamp + 7 days), 9900, 6e6, "n", "s");
        hg.setPrimaryOffering(sid, 2.49e6, 10);
        vm.stopPrank();
        usdc.mint(intermediary, 100e6);
        vm.prank(intermediary);
        usdc.approve(address(router), type(uint256).max);
    }

    function test_buysWholeHoursAndRefundsChange() public {
        vm.prank(intermediary);
        (uint256 h, uint256 change) = router.buyWithAmount(sid, 10e6, 0, user);
        assertEq(h, 4); // 4 * 2.49 = 9.96
        assertEq(change, 0.04e6);
        assertEq(hg.getSeries(sid).token.balanceOf(user), 4);
        assertEq(usdc.balanceOf(user), 0.04e6);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(intermediary), 90e6);
    }

    function test_capsAtRemainingAndMaxHours() public {
        vm.prank(intermediary);
        (uint256 h, uint256 change) = router.buyWithAmount(sid, 50e6, 3, user);
        assertEq(h, 3);
        assertEq(change, 50e6 - 3 * 2.49e6);
        vm.prank(intermediary);
        (h,) = router.buyWithAmount(sid, 50e6, 0, user); // only 7 left
        assertEq(h, 7);
    }

    function test_revertsBelowOneHour() public {
        vm.prank(intermediary);
        vm.expectRevert(abi.encodeWithSelector(HourglassRouter.AmountBelowOneHour.selector, 1e6, 2.49e6));
        router.buyWithAmount(sid, 1e6, 0, user);
    }
}
