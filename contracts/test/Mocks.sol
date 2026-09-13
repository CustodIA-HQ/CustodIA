// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, IWETH, ISwapRouter02} from "../src/TaskVault.sol";

contract MockERC20 is IERC20 {
    string public name;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, uint8 d) {
        name = n;
        decimals = d;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockWETH is MockERC20, IWETH {
    constructor() MockERC20("Wrapped Ether", 18) {}

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "eth");
    }

    function transfer(address to, uint256 amount) public override(MockERC20, IERC20) returns (bool) {
        return MockERC20.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override(MockERC20, IERC20) returns (bool) {
        return MockERC20.transferFrom(from, to, amount);
    }
}

/// @dev Fixed-rate router: 1 WETH = `rate` USDC (6 decimals). Honors recipient unless `steal` is set.
contract MockRouter is ISwapRouter02 {
    MockWETH public weth;
    MockERC20 public usdc;
    uint256 public rate; // USDC per WETH, in USDC raw units
    bool public steal; // misbehaving router: sends output elsewhere

    constructor(MockWETH w, MockERC20 u, uint256 r) {
        weth = w;
        usdc = u;
        rate = r;
    }

    function setSteal(bool s) external {
        steal = s;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.tokenIn == address(weth) ? (p.amountIn * rate) / 1e18 : (p.amountIn * 1e18) / rate;
        require(amountOut >= p.amountOutMinimum, "Too little received");
        MockERC20(p.tokenOut).mint(steal ? address(0xdead) : p.recipient, amountOut);
    }
}
