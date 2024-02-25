import config from './config.js';
import { DefaultLogger, WebsocketClientV2, RestClientV2 } from "bitget-api";
import dotenv from 'dotenv';
dotenv.config();
import os from "os";

import { clearLogFiles
        , saveAccountSnapshot
} from "./helpers.js";

clearLogFiles();

const clientOptions = {
    apiKey: process.env.BITGET_API_KEY,
    apiSecret: process.env.BITGET_API_SECRET,
    apiPass: process.env.BITGET_API_PASSWORD,
    logger: {
        ...DefaultLogger,
        silly: (...params) => console.log('silly', ...params),
    },
};

const restClient = new RestClientV2(clientOptions);

// tickers
const instType = process.env.BITGET_NET.toLowerCase() === 'testnet' ? 'SUSDT-FUTURES' : 'USDT-FUTURES';

await saveAccountSnapshot(restClient, instType);
setInterval(async () => {
    await saveAccountSnapshot(restClient, instType);
}, 1000 * config.accountSnapshotsInterval * 60);


const wsClient = new WebsocketClientV2(clientOptions);

import { OrderManager } from "./OrderManager.js";
const productType = process.env.BITGET_NET.toLowerCase() === 'testnet' ? 'SUSDT-FUTURES' : 'USDT-FUTURES';
const orderManager = new OrderManager(restClient, wsClient, config, process.env, productType);

// restClient.futuresSubmitOrder({
//     productType,
//     marginMode: 'isolated',
//     symbol: 'SBTCSUSDT',
//     marginCoin: 'SUSDT',
//     size: 0.03,
//     side: 'Buy',
//     tradeSide: 'Open',
//     price: '40000',
//     orderType: 'limit',
//     force: 'FOK',
// }).then(data => {
//     console.log(data);
// }).catch(err => {
//     console.log(err);
// });

// restClient.getFuturesHistoricOrders({
//     productType
// }).then(data => {
//     console.log(data.data.entrustedList);
// }).catch(err => {
//     console.log(err);
// });

// restClient.futuresCancelOrder({
//     productType,
//     symbol: 'SBTCSUSDT',
//     orderId: '1145714211255119873'
// }).then(data => {
//     console.log(data);
// }).catch(err => {
//     console.log(err);
// });

// restClient.getFuturesPositions({
//     productType,
//     marginCoin: 'SUSDT',
// }).then(data => {
//     console.log(data);
// }).catch(err => {
//     console.log(err);
// });
// orderManager._fillTradesFromPendingOrders();

wsClient.on('update', (data) => {
    if (data.arg.channel === 'ticker') {
        data.data.forEach(async (item) => {
            await orderManager.handlePriceUpdate(item.instId, parseFloat(item.lastPr));
        });
    } else if (data.arg.channel === 'orders') {
        console.log(data);
    }
});

wsClient.on('exception', (data) => {
    console.log('Exception', data);
});

config.tradingPairs.forEach(symbol => wsClient.subscribeTopic(instType, 'ticker', symbol));
config.tradingPairs.forEach(symbol => wsClient.subscribeTopic(instType, 'orders', symbol));
