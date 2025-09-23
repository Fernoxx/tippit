// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import {
    AdminUpgradeabilityProxy
} from "./AdminUpgradeabilityProxy.sol";

/**
 * @title PitTippingProxy
 * @dev This contract proxies PitTipping calls and enables PitTipping upgrades
 * Based on Noice's FiatTokenProxy structure
 */
contract PitTippingProxy is AdminUpgradeabilityProxy {
    constructor(address implementationContract)
        public
        AdminUpgradeabilityProxy(implementationContract)
    {}
}