// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Hourglass} from "../src/Hourglass.sol";
import {HourglassRouter} from "../src/HourglassRouter.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @notice Deploys Hourglass and seeds a demo provider + two GPU-hour series.
/// env: PRIVATE_KEY, CRE_FORWARDER, COLLATERAL (optional; deploys MockUSDC when unset),
///      BOND (collateral units, default 50,000), PENALTY_H100 / PENALTY_A100 (per-hour lock)
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
        // Extra report senders: CRE production KeystoneForwarder and/or a dev oracle key.
        address extraFwd = vm.envOr("EXTRA_FORWARDER", address(0));
        if (extraFwd != address(0)) hg.setForwarder(extraFwd, true);
        address prodFwd = vm.envOr("CRE_PROD_FORWARDER", address(0));
        if (prodFwd != address(0)) hg.setForwarder(prodFwd, true);

        // Demo provider = deployer. In production each GPU cloud registers itself.
        hg.registerProvider("Hourglass Demo Cloud", "https://hourglass.compute/providers/demo.json");
        collateral.approve(address(hg), type(uint256).max);
        uint256 bond = vm.envOr("BOND", uint256(50_000e6));
        hg.depositBond(bond);

        uint64 start = uint64(block.timestamp);
        uint64 end = start + 14 days;
        uint256 h100 = hg.createSeries(
            "H100-80GB-SXM", "US-EAST", start, end, 9_900, vm.envOr("PENALTY_H100", uint256(6e6)), "Hourglass H100 US-East 2wk", "gH100-USE"
        );
        hg.setPrimaryOffering(h100, 2.49e6, vm.envOr("CAP_H100", uint256(2_000)));
        uint256 a100 = hg.createSeries(
            "A100-80GB-PCIE", "EU-WEST", start, end, 9_800, vm.envOr("PENALTY_A100", uint256(3e6)), "Hourglass A100 EU-West 2wk", "gA100-EUW"
        );
        hg.setPrimaryOffering(a100, 1.29e6, vm.envOr("CAP_A100", uint256(2_000)));
        HourglassRouter router = new HourglassRouter(hg);

        vm.stopBroadcast();

        console2.log("collateral", address(collateral));
        console2.log("hourglass ", address(hg));
        console2.log("gH100-USE ", address(hg.getSeries(h100).token));
        console2.log("gA100-EUW ", address(hg.getSeries(a100).token));
        console2.log("router    ", address(router));
    }
}
