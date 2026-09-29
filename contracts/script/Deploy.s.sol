// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hourglass} from "../src/Hourglass.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys Hourglass and seeds a demo provider + two GPU-hour series.
/// env: PRIVATE_KEY, CRE_FORWARDER, COLLATERAL (optional; deploys MockUSDC when unset)
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        // Monad testnet CRE MockKeystoneForwarder (simulation with --broadcast)
        address forwarder = vm.envOr("CRE_FORWARDER", address(0xB9F79d863261869B234c481D1f9A7af84AeAd192));
        address collateralAddr = vm.envOr("COLLATERAL", address(0));

        vm.startBroadcast(pk);

        IERC20 collateral;
        if (collateralAddr == address(0)) {
            MockUSDC m = new MockUSDC();
            m.mint(deployer, 1_000_000e6);
            collateral = IERC20(address(m));
        } else {
            collateral = IERC20(collateralAddr);
        }

        Hourglass hg = new Hourglass(collateral, forwarder);

        // Demo provider = deployer. In production each GPU cloud registers itself.
        hg.registerProvider("Hourglass Demo Cloud", "https://hourglass.compute/providers/demo.json");
        collateral.approve(address(hg), type(uint256).max);
        hg.depositBond(50_000e6);

        uint64 start = uint64(block.timestamp);
        uint64 end = start + 14 days;
        uint256 h100 = hg.createSeries(
            "H100-80GB-SXM", "US-EAST", start, end, 9_900, 6e6, "Hourglass H100 US-East 2wk", "gH100-USE"
        );
        hg.setPrimaryOffering(h100, 2.49e6, 2_000);
        uint256 a100 = hg.createSeries(
            "A100-80GB-PCIE", "EU-WEST", start, end, 9_800, 3e6, "Hourglass A100 EU-West 2wk", "gA100-EUW"
        );
        hg.setPrimaryOffering(a100, 1.29e6, 2_000);

        vm.stopBroadcast();

        console2.log("collateral", address(collateral));
        console2.log("hourglass ", address(hg));
        console2.log("gH100-USE ", address(hg.getSeries(h100).token));
        console2.log("gA100-EUW ", address(hg.getSeries(a100).token));
    }
}
