
export default {
    tradingPairs: ["SBTCSUSDT"],
    // tradingPairs: ["BTCUSDT"],
    tradingAmounts: {
        SBTCSUSDT: 0.03,
        BTCUSDT: 0.03,
    },
    profit: {  // TP
        SBTCSUSDT: 55,
        BTCUSDT: 55,
    },
    loss: {  // SL
        SBTCSUSDT: 50,
        BTCUSDT: 50,
    },
    step: {  // Step size
        SBTCSUSDT: 20,
        BTCUSDT: 10,
    },
    maxTrades: 5,
    files: {
        logsFile: "./logs/logs.txt",
        assetsFile: "./logs/assets.txt",
    },
    accountSnapshotsInterval: 1, // In minutes
};
