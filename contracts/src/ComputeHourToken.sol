// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ComputeHourToken
/// @notice One token = one GPU-hour of a single standardized contract
///         (GPU model, region, delivery window, SLA). Minted and burned only by the Hourglass core.
contract ComputeHourToken is ERC20 {
    address public immutable hourglass;
    uint256 public immutable seriesId;

    error OnlyHourglass();

    constructor(string memory name_, string memory symbol_, uint256 seriesId_) ERC20(name_, symbol_) {
        hourglass = msg.sender;
        seriesId = seriesId_;
    }

    /// @dev Whole hours only: fractional GPU-hours cannot be delivered.
    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != hourglass) revert OnlyHourglass();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != hourglass) revert OnlyHourglass();
        _burn(from, amount);
    }
}
