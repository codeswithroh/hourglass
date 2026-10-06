// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Hourglass} from "./Hourglass.sol";

/// @title HourglassRouter
/// @notice "Spend this much stablecoin on GPU-hours" — the entry point for cross-chain deposit-and-execute
///         (Aurora Intents Connect). Intent solvers only know the delivered amount at execution time, so the
///         router converts an amount into whole hours, buys them for `recipient`, and returns the change.
contract HourglassRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    Hourglass public immutable hourglass;
    IERC20 public immutable collateral;

    event BoughtWithAmount(
        uint256 indexed seriesId, address indexed payer, address indexed recipient, uint256 hoursCount, uint256 spent, uint256 change
    );

    error AmountBelowOneHour(uint256 amount, uint256 pricePerHour);

    constructor(Hourglass hourglass_) {
        hourglass = hourglass_;
        collateral = hourglass_.collateral();
        collateral.forceApprove(address(hourglass_), type(uint256).max);
    }

    /// @param amount stablecoin the caller approved to this router (e.g. the intent's {MIN_AMOUNT_OUT})
    /// @param maxHours cap on hours bought (0 = no cap); anything above is refunded as change
    function buyWithAmount(uint256 seriesId, uint256 amount, uint256 maxHours, address recipient)
        external
        nonReentrant
        returns (uint256 hoursCount, uint256 change)
    {
        Hourglass.Series memory s = hourglass.getSeries(seriesId);
        if (s.primaryPrice == 0 || amount < s.primaryPrice) revert AmountBelowOneHour(amount, s.primaryPrice);

        hoursCount = amount / s.primaryPrice;
        if (hoursCount > s.primaryRemaining) hoursCount = s.primaryRemaining;
        if (maxHours != 0 && hoursCount > maxHours) hoursCount = maxHours;

        collateral.safeTransferFrom(msg.sender, address(this), amount);
        uint256 cost = hourglass.buyPrimary(seriesId, hoursCount, hoursCount * s.primaryPrice, recipient);
        change = amount - cost;
        if (change > 0) collateral.safeTransfer(recipient, change);
        emit BoughtWithAmount(seriesId, msg.sender, recipient, hoursCount, cost, change);
    }
}
