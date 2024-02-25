
export default {
    tradingPairs: ["SBTCSUSDT"],
    // tradingPairs: ["BTCUSDT"],
    tradingAmounts: {
        SBTCSUSDT: 0.003,
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
    maxTrades: 2,
    files: {
        logsFile: "./logs/logs",
        assetsFile: "./logs/assets",
    },
    accountSnapshotsInterval: 1, // In minutes
};
