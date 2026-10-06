// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Hourglass} from "../src/Hourglass.sol";
import {HourglassRouter} from "../src/HourglassRouter.sol";

/// env: PRIVATE_KEY, HOURGLASS
contract DeployRouter is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        HourglassRouter r = new HourglassRouter(Hourglass(vm.envAddress("HOURGLASS")));
        vm.stopBroadcast();
        console2.log("router    ", address(r));
    }
}
