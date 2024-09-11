require('dotenv').config();
const { ethers } = require('ethers');

// Load environment variables
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const PRIVATE_KEYS = process.env.PRIVATE_KEYS.split(',');
const NETWORK = process.env.NETWORK || 'mainnet';

// Uniswap Router and token addresses
const UNISWAP_ROUTER_ADDRESS = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap V2 Router
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // Wrapped Ether (WETH)
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS; // Load from environment variable

// Load Uniswap Router ABI
const UNISWAP_ROUTER_ABI = [
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
];

// Initialize provider
const provider = new ethers.providers.InfuraProvider(NETWORK, INFURA_PROJECT_ID);

// Create wallet signers
const wallets = PRIVATE_KEYS.map(key => new ethers.Wallet(key, provider));

// Create Uniswap Router contract instance
const uniswapRouter = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, provider);

// Utility function to delay execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to execute random trades
const randomTrade = async (wallet) => {
    const signer = wallet.connect(provider);
    const randomAmountETH = ethers.utils.parseEther((Math.random() * 0.01).toFixed(18)); // Trade up to 0.01 ETH
    const buyOrSell = Math.random() < 0.7 ? 'buy' : 'sell'; // 70% chance to buy

    try {
        if (buyOrSell === 'buy') {
            console.log(`Executing buy for wallet ${wallet.address}`);
            await buyTokens(signer, randomAmountETH);
        } else {
            console.log(`Executing sell for wallet ${wallet.address}`);
            const randomAmountTokens = ethers.utils.parseUnits((Math.random() * 10).toFixed(18), 18); // Sell up to 10 tokens
            await sellTokens(signer, randomAmountTokens);
        }
    } catch (error) {
        console.error(`Error executing trade for wallet ${wallet.address}:`, error);
    }
};

// Function to buy tokens with ETH
const buyTokens = async (signer, amountETH) => {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes deadline
    const path = [WETH_ADDRESS, TOKEN_ADDRESS];

    try {
        // Get expected amount out
        const [, expectedAmountOut] = await uniswapRouter.getAmountsOut(amountETH, path);
        const minAmountOut = expectedAmountOut.mul(95).div(100); // 5% slippage tolerance

        const tx = await uniswapRouter.connect(signer).swapExactETHForTokens(
            minAmountOut,
            path,
            signer.address,
            deadline,
            { value: amountETH, gasLimit: 300000 }
        );

        console.log(`Buy transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Buy transaction confirmed. Gas used: ${receipt.gasUsed.toString()}`);
    } catch (error) {
        console.error('Error in buyTokens:', error);
    }
};

// Function to sell tokens for ETH
const sellTokens = async (signer, amountTokens) => {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes deadline
    const path = [TOKEN_ADDRESS, WETH_ADDRESS];

    try {
        // Approve Uniswap to spend tokens
        const tokenContract = new ethers.Contract(TOKEN_ADDRESS, [
            "function approve(address spender, uint256 amount) public returns (bool)",
            "function allowance(address owner, address spender) public view returns (uint256)"
        ], signer);

        const currentAllowance = await tokenContract.allowance(signer.address, UNISWAP_ROUTER_ADDRESS);
        if (currentAllowance.lt(amountTokens)) {
            const approveTx = await tokenContract.approve(UNISWAP_ROUTER_ADDRESS, amountTokens);
            await approveTx.wait();
            console.log('Token approval confirmed');
        }

        // Get expected amount out
        const [, expectedAmountOut] = await uniswapRouter.getAmountsOut(amountTokens, path);
        const minAmountOut = expectedAmountOut.mul(95).div(100); // 5% slippage tolerance

        const tx = await uniswapRouter.connect(signer).swapExactTokensForETH(
            amountTokens,
            minAmountOut,
            path,
            signer.address,
            deadline,
            { gasLimit: 300000 }
        );

        console.log(`Sell transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`Sell transaction confirmed. Gas used: ${receipt.gasUsed.toString()}`);
    } catch (error) {
        console.error('Error in sellTokens:', error);
    }
};

// Main loop to schedule random trades
const startBot = async () => {
    console.log(`Starting trading bot on ${NETWORK}`);
    while (true) {
        for (const wallet of wallets) {
            await randomTrade(wallet);
            await sleep(Math.random() * 60000 + 30000); // Random delay between 30 and 90 seconds
        }
    }
};

// Error handling for the main loop
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

startBot().catch(error => {
    console.error('Fatal error in startBot:', error);
    process.exit(1);
});