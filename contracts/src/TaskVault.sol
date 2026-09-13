// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal ERC-20 surface the vault needs.
interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// @dev Uniswap V3 SwapRouter02.exactInputSingle (no deadline field in 02).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title TaskVault — the only asset authority of a CustodIA task.
 *
 * The owner funds it and installs the limits of the mandate they signed.
 * The agent can never touch it directly: only the execution signer may call
 * `executeSwap`, and only with an action the policy signer approved (EIP-712,
 * short-lived, bound to this vault and this exact action). Every limit is
 * enforced here again regardless of what any server believes: allowed assets,
 * per-trade and cumulative caps in raw token units, cooldown, expiry, nonce,
 * the one allow-listed router, and output landing in the vault.
 *
 * Trust boundary: owner → withdraw / revoke / install; execution signer →
 * executeSwap only; policy signer → makes one bounded action executable for
 * two minutes. No key other than the owner's can move funds out.
 */
contract TaskVault {
    // ─── Immutable configuration ──────────────────────────────────────────

    address public immutable owner;
    address public immutable executionSigner;
    address public immutable policySigner;
    ISwapRouter02 public immutable router;
    IWETH public immutable weth;
    IERC20 public immutable usdc;
    uint24 public immutable poolFee;

    // ─── Mandate ──────────────────────────────────────────────────────────

    struct Cap {
        uint128 maxTrade; // raw units of the input token per action
        uint128 maxCumulative; // raw units of the input token over the mandate
    }

    struct Mandate {
        bytes32 hash; // keccak of the signed mandate (also published on ENS)
        uint64 version;
        uint64 expiry; // unix seconds
        uint32 minIntervalS; // cooldown between actions
        bool active;
    }

    Mandate public mandate;
    mapping(address => Cap) public caps; // tokenIn => caps
    mapping(address => uint256) public spent; // tokenIn => cumulative raw spent
    uint64 public actionNonce;
    uint64 public lastActionAt;

    // ─── Policy approval (EIP-712) ────────────────────────────────────────

    struct Action {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
        uint64 nonce;
        uint64 deadline;
        bytes32 mandateHash;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ACTION_TYPEHASH = keccak256(
        "Action(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint64 nonce,uint64 deadline,bytes32 mandateHash)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ─── Events & errors ──────────────────────────────────────────────────

    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event MandateInstalled(bytes32 indexed hash, uint64 version, uint64 expiry);
    event MandateRevoked(bytes32 indexed hash);
    event Executed(
        uint64 indexed nonce, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );

    error NotOwner();
    error NotExecutionSigner();
    error MandateInactive();
    error MandateMismatch();
    error MandateExpired();
    error BadNonce();
    error ActionExpired();
    error Cooldown();
    error AssetNotAllowed();
    error ExceedsTradeCap();
    error ExceedsCumulativeCap();
    error BadPolicySignature();
    error InsufficientOutput();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _owner,
        address _executionSigner,
        address _policySigner,
        ISwapRouter02 _router,
        IWETH _weth,
        IERC20 _usdc,
        uint24 _poolFee
    ) {
        owner = _owner;
        executionSigner = _executionSigner;
        policySigner = _policySigner;
        router = _router;
        weth = _weth;
        usdc = _usdc;
        poolFee = _poolFee;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("CustodIA TaskVault"), keccak256("1"), block.chainid, address(this))
        );
    }

    // ─── Owner: funding ───────────────────────────────────────────────────

    /// @notice Deposit ETH; it is held as WETH so both legs are plain ERC-20 swaps.
    function deposit() external payable {
        weth.deposit{value: msg.value}();
        emit Deposited(address(weth), msg.value);
    }

    /// @notice Deposit USDC (caller must have approved the vault).
    function depositUsdc(uint256 amount) external {
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(address(usdc), amount);
    }

    /// @notice Owner takes ETH out (unwraps WETH). Works whether or not a mandate is active.
    function withdrawEth(uint256 amount, address payable to) external onlyOwner {
        weth.withdraw(amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(address(weth), to, amount);
    }

    function withdrawUsdc(uint256 amount, address to) external onlyOwner {
        if (!usdc.transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(address(usdc), to, amount);
    }

    receive() external payable {} // WETH.withdraw sends ETH back here

    // ─── Owner: mandate lifecycle ─────────────────────────────────────────

    /// @notice Install the signed mandate's limits. Replaces any previous mandate and resets counters.
    function installMandate(
        bytes32 hash,
        uint64 version,
        uint64 expiry,
        uint32 minIntervalS,
        Cap calldata wethCap,
        Cap calldata usdcCap
    ) external onlyOwner {
        mandate = Mandate({hash: hash, version: version, expiry: expiry, minIntervalS: minIntervalS, active: true});
        caps[address(weth)] = wethCap;
        caps[address(usdc)] = usdcCap;
        spent[address(weth)] = 0;
        spent[address(usdc)] = 0;
        actionNonce = 0;
        lastActionAt = 0;
        emit MandateInstalled(hash, version, expiry);
    }

    /// @notice Stop all execution. The owner can still withdraw; a new mandate needs a new install.
    function revoke() external onlyOwner {
        mandate.active = false;
        emit MandateRevoked(mandate.hash);
    }

    // ─── Execution signer: the one bounded operation ──────────────────────

    /// @notice Swap inside the boundary. Reverts on any limit; output stays in the vault.
    function executeSwap(Action calldata a, bytes calldata policySig) external returns (uint256 amountOut) {
        if (msg.sender != executionSigner) revert NotExecutionSigner();
        Mandate memory m = mandate;
        if (!m.active) revert MandateInactive();
        if (a.mandateHash != m.hash) revert MandateMismatch();
        if (block.timestamp > m.expiry) revert MandateExpired();
        if (a.nonce != actionNonce) revert BadNonce();
        if (block.timestamp > a.deadline) revert ActionExpired();
        if (lastActionAt != 0 && block.timestamp < uint256(lastActionAt) + m.minIntervalS) revert Cooldown();
        bool wethToUsdc = a.tokenIn == address(weth) && a.tokenOut == address(usdc);
        bool usdcToWeth = a.tokenIn == address(usdc) && a.tokenOut == address(weth);
        if (!wethToUsdc && !usdcToWeth) revert AssetNotAllowed();
        Cap memory cap = caps[a.tokenIn];
        if (a.amountIn > cap.maxTrade) revert ExceedsTradeCap();
        if (spent[a.tokenIn] + a.amountIn > cap.maxCumulative) revert ExceedsCumulativeCap();
        if (!_policyApproved(a, policySig)) revert BadPolicySignature();

        // Effects before the external call.
        spent[a.tokenIn] += a.amountIn;
        actionNonce = a.nonce + 1;
        lastActionAt = uint64(block.timestamp);

        uint256 before = IERC20(a.tokenOut).balanceOf(address(this));
        IERC20(a.tokenIn).approve(address(router), a.amountIn);
        amountOut = router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: a.tokenIn,
                tokenOut: a.tokenOut,
                fee: poolFee,
                recipient: address(this),
                amountIn: a.amountIn,
                amountOutMinimum: a.minOut,
                sqrtPriceLimitX96: 0
            })
        );
        IERC20(a.tokenIn).approve(address(router), 0);
        // Trust the balance, not the router's word.
        uint256 received = IERC20(a.tokenOut).balanceOf(address(this)) - before;
        if (received < a.minOut) revert InsufficientOutput();
        emit Executed(a.nonce, a.tokenIn, a.tokenOut, a.amountIn, received);
        return received;
    }

    // ─── Views ────────────────────────────────────────────────────────────

    function balances() external view returns (uint256 wethBalance, uint256 usdcBalance) {
        return (weth.balanceOf(address(this)), usdc.balanceOf(address(this)));
    }

    function actionDigest(Action calldata a) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        ACTION_TYPEHASH, a.tokenIn, a.tokenOut, a.amountIn, a.minOut, a.nonce, a.deadline, a.mandateHash
                    )
                )
            )
        );
    }

    function _policyApproved(Action calldata a, bytes calldata sig) private view returns (bool) {
        if (sig.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // Reject malleable signatures (EIP-2).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return false;
        if (v != 27 && v != 28) return false;
        address signer = ecrecover(actionDigest(a), v, r, s);
        return signer != address(0) && signer == policySigner;
    }
}
