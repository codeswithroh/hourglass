// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ComputeHourToken} from "./ComputeHourToken.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";

/// @title Hourglass
/// @notice Physically-settled spot market for GPU-hours.
///
///  1. Providers post a bond in the collateral stablecoin.
///  2. Providers open a Series: a standardized contract (GPU model, region, delivery window, min uptime,
///     penalty per hour). Every hour minted locks `penaltyPerHour` of the provider's bond.
///  3. Hour tokens (ERC-20, 0 decimals) trade anywhere — primary sale here, secondary on a Kuru order book.
///  4. A holder redeems by burning tokens and posting an SSH key; a Chainlink CRE workflow provisions the
///     machine through the provider's API.
///  5. While the lease runs, the CRE DON probes the machine's health endpoint and writes batched probe
///     results onchain. Uptime is computed here from those probes — never self-reported by the provider.
///  6. Below the SLA, the bond pays the holder pro rata. Missed provisioning deadline => anyone can slash.
contract Hourglass is IReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    struct Provider {
        bool registered;
        string name;
        string metadataURI;
        uint256 bond;
        uint256 locked;
        uint64 hoursDelivered;
        uint32 leasesSettled;
        uint32 leasesSlashed;
    }

    struct Series {
        address provider;
        ComputeHourToken token;
        bytes32 gpuModel; // e.g. "H100-80GB-SXM"
        bytes32 region; // e.g. "US-EAST"
        uint64 deliveryStart;
        uint64 deliveryEnd;
        uint16 minUptimeBps;
        bool expiredReleased;
        uint256 penaltyPerHour; // collateral units locked per outstanding hour
        uint256 primaryPrice; // collateral units per hour, 0 = primary sale closed
        uint256 primaryRemaining;
    }

    enum LeaseStatus {
        None,
        Requested,
        Active,
        Settled,
        Slashed
    }

    struct Lease {
        uint256 seriesId;
        address holder;
        uint32 hoursCount;
        uint64 requestedAt;
        uint64 startedAt;
        uint16 uptimeBps;
        LeaseStatus status;
        uint32 probesTotal;
        uint32 probesUp;
        uint256 payout;
        string healthUrl;
    }

    uint8 internal constant REPORT_PROVISIONED = 1;
    uint8 internal constant REPORT_PROBES = 2;
    uint8 internal constant REPORT_FAILED = 3;
    uint16 internal constant BPS = 10_000;

    // ------------------------------------------------------------------ storage

    IERC20 public immutable collateral;

    address public forwarder;
    address public expectedWorkflowOwner;
    uint64 public provisionTimeout = 30 minutes;

    /// @dev Leases currently Active (provisioned, not yet settled) — what the CRE prober iterates.
    uint256[] internal _activeLeases;
    mapping(uint256 => uint256) internal _activeIndex; // leaseId => index + 1

    mapping(address => Provider) public providers;
    Series[] internal _series;
    Lease[] internal _leases;

    // ------------------------------------------------------------------ events

    event ProviderRegistered(address indexed provider, string name, string metadataURI);
    event BondDeposited(address indexed provider, uint256 amount, uint256 bond);
    event BondWithdrawn(address indexed provider, uint256 amount, uint256 bond);
    event SeriesCreated(
        uint256 indexed seriesId,
        address indexed provider,
        address token,
        bytes32 gpuModel,
        bytes32 region,
        uint64 deliveryStart,
        uint64 deliveryEnd,
        uint16 minUptimeBps,
        uint256 penaltyPerHour
    );
    event PrimaryOfferingSet(uint256 indexed seriesId, uint256 price, uint256 remaining);
    event HoursMinted(uint256 indexed seriesId, address indexed to, uint256 hoursCount, uint256 lockedAmount);
    event PrimaryPurchase(
        uint256 indexed seriesId, address indexed buyer, address indexed recipient, uint256 hoursCount, uint256 cost
    );
    event LeaseRequested(
        uint256 indexed leaseId,
        uint256 indexed seriesId,
        address indexed holder,
        address provider,
        uint32 hoursCount,
        string sshPublicKey,
        bytes32 encryptionPublicKey
    );
    event LeaseProvisioned(uint256 indexed leaseId, bytes encryptedAccess, string healthUrl);
    event LeaseProbed(uint256 indexed leaseId, bool up, uint32 probesTotal, uint32 probesUp);
    event LeaseSettled(uint256 indexed leaseId, uint16 uptimeBps, uint256 payoutToHolder);
    event LeaseSlashed(uint256 indexed leaseId, uint256 payoutToHolder, uint8 reason);
    event SeriesExpired(uint256 indexed seriesId, uint256 unredeemedHours, uint256 released);
    event ForwarderUpdated(address forwarder, address expectedWorkflowOwner);

    // ------------------------------------------------------------------ errors

    error NotProvider();
    error AlreadyRegistered();
    error InsufficientFreeBond(uint256 free, uint256 needed);
    error BadSeries();
    error NotSeriesProvider();
    error OutsideDeliveryWindow();
    error PrimaryClosed();
    error PriceAboveMax(uint256 cost, uint256 maxCost);
    error ZeroHours();
    error BadLeaseState(LeaseStatus status);
    error TooEarly();
    error InvalidSender(address sender);
    error InvalidWorkflowOwner(address owner);
    error UnknownReport(uint8 kind);
    error LengthMismatch();

    uint8 internal constant SLASH_REPORTED_FAILURE = 1;
    uint8 internal constant SLASH_PROVISION_TIMEOUT = 2;

    constructor(IERC20 collateral_, address forwarder_) Ownable(msg.sender) {
        collateral = collateral_;
        forwarder = forwarder_;
    }

    // ================================================================== providers

    function registerProvider(string calldata name, string calldata metadataURI) external {
        Provider storage p = providers[msg.sender];
        if (p.registered) revert AlreadyRegistered();
        p.registered = true;
        p.name = name;
        p.metadataURI = metadataURI;
        emit ProviderRegistered(msg.sender, name, metadataURI);
    }

    function depositBond(uint256 amount) external nonReentrant {
        Provider storage p = _provider(msg.sender);
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        p.bond += amount;
        emit BondDeposited(msg.sender, amount, p.bond);
    }

    function withdrawBond(uint256 amount) external nonReentrant {
        Provider storage p = _provider(msg.sender);
        uint256 free = p.bond - p.locked;
        if (amount > free) revert InsufficientFreeBond(free, amount);
        p.bond -= amount;
        collateral.safeTransfer(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount, p.bond);
    }

    function freeBond(address provider) public view returns (uint256) {
        Provider storage p = providers[provider];
        return p.bond - p.locked;
    }

    // ================================================================== series

    function createSeries(
        bytes32 gpuModel,
        bytes32 region,
        uint64 deliveryStart,
        uint64 deliveryEnd,
        uint16 minUptimeBps,
        uint256 penaltyPerHour,
        string calldata tokenName,
        string calldata tokenSymbol
    ) external returns (uint256 seriesId) {
        _provider(msg.sender);
        if (deliveryEnd <= deliveryStart || deliveryEnd <= block.timestamp) revert BadSeries();
        if (minUptimeBps == 0 || minUptimeBps > BPS || penaltyPerHour == 0) revert BadSeries();

        seriesId = _series.length;
        ComputeHourToken token = new ComputeHourToken(tokenName, tokenSymbol, seriesId);
        _series.push(
            Series({
                provider: msg.sender,
                token: token,
                gpuModel: gpuModel,
                region: region,
                deliveryStart: deliveryStart,
                deliveryEnd: deliveryEnd,
                minUptimeBps: minUptimeBps,
                expiredReleased: false,
                penaltyPerHour: penaltyPerHour,
                primaryPrice: 0,
                primaryRemaining: 0
            })
        );
        emit SeriesCreated(
            seriesId,
            msg.sender,
            address(token),
            gpuModel,
            region,
            deliveryStart,
            deliveryEnd,
            minUptimeBps,
            penaltyPerHour
        );
    }

    /// @notice Provider mints hours directly (OTC fills, seeding an order book). Locks bond.
    function mintHours(uint256 seriesId, address to, uint256 hoursCount) external nonReentrant {
        Series storage s = _seriesOf(seriesId);
        if (s.provider != msg.sender) revert NotSeriesProvider();
        _mintLocked(s, seriesId, to, hoursCount);
    }

    /// @notice Open (or close with price 0) the fixed-price primary offering. Hours are minted on purchase.
    function setPrimaryOffering(uint256 seriesId, uint256 pricePerHour, uint256 hoursAvailable) external {
        Series storage s = _seriesOf(seriesId);
        if (s.provider != msg.sender) revert NotSeriesProvider();
        s.primaryPrice = pricePerHour;
        s.primaryRemaining = hoursAvailable;
        emit PrimaryOfferingSet(seriesId, pricePerHour, hoursAvailable);
    }

    /// @notice Buy hours from the provider's primary offering. `recipient` lets intent solvers
    ///         (e.g. Aurora Intents Connect deposit-and-execute) buy on behalf of a user.
    function buyPrimary(uint256 seriesId, uint256 hoursCount, uint256 maxCost, address recipient)
        external
        nonReentrant
        returns (uint256 cost)
    {
        Series storage s = _seriesOf(seriesId);
        if (s.primaryPrice == 0) revert PrimaryClosed();
        if (hoursCount == 0) revert ZeroHours();
        if (hoursCount > s.primaryRemaining) revert InsufficientFreeBond(s.primaryRemaining, hoursCount);
        cost = hoursCount * s.primaryPrice;
        if (cost > maxCost) revert PriceAboveMax(cost, maxCost);

        s.primaryRemaining -= hoursCount;
        collateral.safeTransferFrom(msg.sender, s.provider, cost);
        _mintLocked(s, seriesId, recipient, hoursCount);
        emit PrimaryPurchase(seriesId, msg.sender, recipient, hoursCount, cost);
    }

    /// @notice After the delivery window closes, unredeemed hours can no longer be delivered: release their lock.
    function releaseExpired(uint256 seriesId) external {
        Series storage s = _seriesOf(seriesId);
        if (block.timestamp <= s.deliveryEnd) revert TooEarly();
        if (s.expiredReleased) revert BadSeries();
        s.expiredReleased = true;
        uint256 unredeemed = s.token.totalSupply();
        uint256 release = unredeemed * s.penaltyPerHour;
        providers[s.provider].locked -= release;
        emit SeriesExpired(seriesId, unredeemed, release);
    }

    // ================================================================== redemption

    /// @notice Burn hour tokens to request a machine.
    /// @param sshPublicKey OpenSSH-format public key (derived client-side from the user's passkey PRF).
    /// @param encryptionPublicKey X25519 key the provider encrypts connection details to.
    function redeem(uint256 seriesId, uint32 hoursCount, string calldata sshPublicKey, bytes32 encryptionPublicKey)
        external
        nonReentrant
        returns (uint256 leaseId)
    {
        Series storage s = _seriesOf(seriesId);
        if (hoursCount == 0) revert ZeroHours();
        if (
            s.expiredReleased || block.timestamp < s.deliveryStart
                || block.timestamp + uint256(hoursCount) * 1 hours > s.deliveryEnd
        ) revert OutsideDeliveryWindow();

        // Burning moves the lock from "outstanding token" to "open lease" — the provider's locked amount is unchanged.
        s.token.burn(msg.sender, hoursCount);

        leaseId = _leases.length;
        _leases.push(
            Lease({
                seriesId: seriesId,
                holder: msg.sender,
                hoursCount: hoursCount,
                requestedAt: uint64(block.timestamp),
                startedAt: 0,
                uptimeBps: 0,
                status: LeaseStatus.Requested,
                probesTotal: 0,
                probesUp: 0,
                payout: 0,
                healthUrl: ""
            })
        );
        emit LeaseRequested(
            leaseId, seriesId, msg.sender, s.provider, hoursCount, sshPublicKey, encryptionPublicKey
        );
    }

    /// @notice Permissionless: provider missed the provisioning deadline — holder receives the full penalty.
    function claimProvisionTimeout(uint256 leaseId) external nonReentrant {
        Lease storage l = _leaseOf(leaseId);
        if (l.status != LeaseStatus.Requested) revert BadLeaseState(l.status);
        if (block.timestamp <= l.requestedAt + provisionTimeout) revert TooEarly();
        _slash(leaseId, l, SLASH_PROVISION_TIMEOUT);
    }

    /// @notice Permissionless: once the lease term is over, settle it against the DON-attested probe record.
    ///         Uptime = probesUp / probesTotal. With no probes recorded (oracle outage), the provider is not penalized.
    function settle(uint256 leaseId) external nonReentrant {
        Lease storage l = _leaseOf(leaseId);
        if (l.status != LeaseStatus.Active) revert BadLeaseState(l.status);
        if (block.timestamp < l.startedAt + uint256(l.hoursCount) * 1 hours) revert TooEarly();
        uint16 uptimeBps = l.probesTotal == 0 ? BPS : uint16((uint256(l.probesUp) * BPS) / l.probesTotal);
        _settle(leaseId, l, uptimeBps);
    }

    /// @notice Uptime so far, in basis points (10_000 when nothing has been probed yet).
    function currentUptimeBps(uint256 leaseId) external view returns (uint16) {
        Lease storage l = _leaseOf(leaseId);
        return l.probesTotal == 0 ? BPS : uint16((uint256(l.probesUp) * BPS) / l.probesTotal);
    }

    // ================================================================== CRE receiver

    /// @inheritdoc IReceiver
    /// @dev report = abi.encode(uint8 kind, uint256 leaseId, bytes payload)
    ///      PROVISIONED payload: abi.encode(bytes encryptedAccess, string healthUrl)
    ///      PROBES      payload: abi.encode(uint256[] leaseIds, bool[] up)   (leaseId arg ignored)
    ///      FAILED      payload: (empty)
    function onReport(bytes calldata metadata, bytes calldata report) external override nonReentrant {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender);
        if (expectedWorkflowOwner != address(0)) {
            // metadata = workflowId (32) | workflowName (10) | workflowOwner (20) | reportId (2)
            address wfOwner = address(bytes20(metadata[42:62]));
            if (wfOwner != expectedWorkflowOwner) revert InvalidWorkflowOwner(wfOwner);
        }

        (uint8 kind, uint256 leaseId, bytes memory payload) = abi.decode(report, (uint8, uint256, bytes));

        if (kind == REPORT_PROBES) {
            _recordProbes(payload);
            return;
        }

        Lease storage l = _leaseOf(leaseId);
        if (kind == REPORT_PROVISIONED) {
            if (l.status != LeaseStatus.Requested) revert BadLeaseState(l.status);
            (bytes memory encryptedAccess, string memory healthUrl) = abi.decode(payload, (bytes, string));
            l.status = LeaseStatus.Active;
            l.startedAt = uint64(block.timestamp);
            l.healthUrl = healthUrl;
            _activeLeases.push(leaseId);
            _activeIndex[leaseId] = _activeLeases.length;
            emit LeaseProvisioned(leaseId, encryptedAccess, healthUrl);
        } else if (kind == REPORT_FAILED) {
            if (l.status != LeaseStatus.Requested && l.status != LeaseStatus.Active) revert BadLeaseState(l.status);
            _slash(leaseId, l, SLASH_REPORTED_FAILURE);
        } else {
            revert UnknownReport(kind);
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ================================================================== admin

    function setForwarder(address forwarder_, address expectedWorkflowOwner_) external onlyOwner {
        forwarder = forwarder_;
        expectedWorkflowOwner = expectedWorkflowOwner_;
        emit ForwarderUpdated(forwarder_, expectedWorkflowOwner_);
    }

    function setProvisionTimeout(uint64 provisionTimeout_) external onlyOwner {
        provisionTimeout = provisionTimeout_;
    }

    // ================================================================== views

    function seriesCount() external view returns (uint256) {
        return _series.length;
    }

    function leaseCount() external view returns (uint256) {
        return _leases.length;
    }

    function getSeries(uint256 seriesId) external view returns (Series memory) {
        return _seriesOf(seriesId);
    }

    function getLease(uint256 leaseId) external view returns (Lease memory) {
        return _leaseOf(leaseId);
    }

    /// @notice Active leases and their health endpoints — read by the CRE probe workflow each tick.
    function activeLeases() external view returns (uint256[] memory ids, string[] memory healthUrls) {
        uint256 n = _activeLeases.length;
        ids = new uint256[](n);
        healthUrls = new string[](n);
        for (uint256 i; i < n; ++i) {
            ids[i] = _activeLeases[i];
            healthUrls[i] = _leases[ids[i]].healthUrl;
        }
    }

    // ================================================================== internal

    function _mintLocked(Series storage s, uint256 seriesId, address to, uint256 hoursCount) internal {
        if (hoursCount == 0) revert ZeroHours();
        if (s.expiredReleased || block.timestamp > s.deliveryEnd) revert OutsideDeliveryWindow();
        Provider storage p = providers[s.provider];
        uint256 lockAmount = hoursCount * s.penaltyPerHour;
        uint256 free = p.bond - p.locked;
        if (lockAmount > free) revert InsufficientFreeBond(free, lockAmount);
        p.locked += lockAmount;
        s.token.mint(to, hoursCount);
        emit HoursMinted(seriesId, to, hoursCount, lockAmount);
    }

    function _recordProbes(bytes memory payload) internal {
        (uint256[] memory ids, bool[] memory up) = abi.decode(payload, (uint256[], bool[]));
        if (ids.length != up.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            if (ids[i] >= _leases.length) continue;
            Lease storage l = _leases[ids[i]];
            // Only count probes inside the paid term; stale or late reports are ignored rather than reverting the batch.
            if (l.status != LeaseStatus.Active) continue;
            if (block.timestamp > l.startedAt + uint256(l.hoursCount) * 1 hours) continue;
            l.probesTotal += 1;
            if (up[i]) l.probesUp += 1;
            emit LeaseProbed(ids[i], up[i], l.probesTotal, l.probesUp);
        }
    }

    function _deactivate(uint256 leaseId) internal {
        uint256 idx = _activeIndex[leaseId];
        if (idx == 0) return;
        uint256 lastId = _activeLeases[_activeLeases.length - 1];
        _activeLeases[idx - 1] = lastId;
        _activeIndex[lastId] = idx;
        _activeLeases.pop();
        delete _activeIndex[leaseId];
    }

    function _settle(uint256 leaseId, Lease storage l, uint16 uptimeBps) internal {
        Series storage s = _series[l.seriesId];
        Provider storage p = providers[s.provider];
        uint256 lockAmount = uint256(l.hoursCount) * s.penaltyPerHour;

        // Below the SLA, the holder is compensated in proportion to downtime.
        uint256 payout = uptimeBps >= s.minUptimeBps ? 0 : (lockAmount * (BPS - uptimeBps)) / BPS;

        _deactivate(leaseId);
        l.status = LeaseStatus.Settled;
        l.uptimeBps = uptimeBps;
        l.payout = payout;
        p.locked -= lockAmount;
        p.bond -= payout;
        p.hoursDelivered += uint64((uint256(l.hoursCount) * uptimeBps) / BPS);
        p.leasesSettled += 1;

        if (payout > 0) collateral.safeTransfer(l.holder, payout);
        emit LeaseSettled(leaseId, uptimeBps, payout);
    }

    function _slash(uint256 leaseId, Lease storage l, uint8 reason) internal {
        Series storage s = _series[l.seriesId];
        Provider storage p = providers[s.provider];
        uint256 lockAmount = uint256(l.hoursCount) * s.penaltyPerHour;

        _deactivate(leaseId);
        l.status = LeaseStatus.Slashed;
        l.payout = lockAmount;
        p.locked -= lockAmount;
        p.bond -= lockAmount;
        p.leasesSlashed += 1;

        collateral.safeTransfer(l.holder, lockAmount);
        emit LeaseSlashed(leaseId, lockAmount, reason);
    }

    function _provider(address who) internal view returns (Provider storage p) {
        p = providers[who];
        if (!p.registered) revert NotProvider();
    }

    function _seriesOf(uint256 seriesId) internal view returns (Series storage) {
        if (seriesId >= _series.length) revert BadSeries();
        return _series[seriesId];
    }

    function _leaseOf(uint256 leaseId) internal view returns (Lease storage) {
        if (leaseId >= _leases.length) revert BadLeaseState(LeaseStatus.None);
        return _leases[leaseId];
    }
}
