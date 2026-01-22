const { ethers } = require('ethers');
const axios = require('axios');
require('dotenv').config();

const provider = new ethers.providers.JsonRpcProvider('https://rpc.pulsechain.com'); // pulsechain

const Token = require('./ERC20.json');
const CoinFlip = require('./CoinFlip.json');

const coinFlipAddress = "0x54e239D5F012FDD8544b26f7A4D0dbfcb9FF19C1"; // Mainnet

async function saveBetResult(betDetails) {
    try {
        const response = await axios.post('/api/placeBet', betDetails);
        const data = response.data;
        console.log(data.message);
    } catch (error) {
        console.error("Error saving bet result:", error);
    }
}

async function checkAndApprove(signer, amountInWei, tokenAddress) {
    const BettingToken = new ethers.Contract(tokenAddress, Token.abi, signer);
    const address = await signer.getAddress();
    const currentAllowance = await BettingToken.allowance(address, coinFlipAddress);

    if (currentAllowance.lt(amountInWei)) {
        try {
            const tx = await BettingToken.approve(coinFlipAddress, amountInWei);
            await tx.wait();
            console.log(`Approval transaction hash: ${tx.hash}`);
        } catch (error) {
            console.error("Approval failed:", error);
            throw error; // Zorg dat de fout doorgegeven wordt
        }
    } else {
        console.log("Sufficient allowance exists. No need for new approval.");
    }
}

async function balanceOf(signer, tokenAddress) {
    const BettingToken = new ethers.Contract(tokenAddress, Token.abi, signer);
    const address = await signer.getAddress();
    const balanceWei = await BettingToken.balanceOf(address);
    
    // Converteer van wei naar ether (voor leesbaarheid)
    const balanceEther = ethers.utils.formatEther(balanceWei);
    
    return balanceEther;
}

async function placeBet(userSigner, multiplier, amountInEther, tokenAddress, tokenSymbol) {
    const amountInWei = ethers.utils.parseEther(amountInEther.toString());
    
    // Goedkeuring regelen
    await checkAndApprove(userSigner, amountInWei, tokenAddress);
    
    const Game = new ethers.Contract(coinFlipAddress, CoinFlip.abi, userSigner);
    
    try {
        // Geen signature meer nodig!
        const txResponse = await Game.placeBet(multiplier, amountInWei, tokenAddress);
        
        const txReceipt = await txResponse.wait();
        
        const betResultEvent = txReceipt.events?.find(event => event.event === "BetResult");
        
        if (betResultEvent) {
            const win = betResultEvent.args.win;
            console.log(`Bet result: ${win ? 'Win' : 'Lose'}`);
            
            // Bereid details voor om op te slaan (bijv. backend)
            const betDetails = {
                transactionHash: txReceipt.transactionHash,
                tokenSymbol,
                amount: amountInEther,
                multiplier,
                win
            };
            
            await saveBetResult(betDetails);
            
            return { success: true, win };
        } else {
            console.log("BetResult event not found in transaction receipt.");
            return { success: false, error: "BetResult event not found" };
        }
    } catch (error) {
        console.error("Placing bet failed:", error);
        
        // Probeer een betere foutmelding te geven
        let errorMessage = "Transaction failed";
        if (error.reason) errorMessage = error.reason;
        else if (error.message) errorMessage = error.message;
        
        return { success: false, error: errorMessage };
    }
}

module.exports = {
    placeBet,
    balanceOf
};
