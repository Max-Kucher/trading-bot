import config from './config.js';
import Binance from 'binance-api-node';
import dotenv from 'dotenv';
dotenv.config();

const clientOptions ={
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_SECRET_KEY,
};

if (process.env.BINANCE_NET === 'TESTNET') {
    clientOptions.httpBase = 'https://testnet.binance.vision/api';
    clientOptions.wsBase = 'wss://testnet.binance.vision/ws';
}

const client = Binance.default(clientOptions);

client.ws.aggTrades(config.tradingPairs, trade => {
    console.log(trade)
})
