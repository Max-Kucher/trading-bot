import config from './config.js';
import { DefaultLogger, WebsocketClientV2, RestClientV2 } from "bitget-api";
import dotenv from 'dotenv';
dotenv.config();
import os from "os";

import { clearLogFiles
        , appendStringToFile
        , saveAccountSnapshot
        , getPriceLevel
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

let ordersByLevel = {
    // "SBTCSUSDT": [{levelStart: 50080, levelEnd: 50120, orders: [{orderId: 1, price: 50100}], ...}]
};

wsClient.on('update', (data) => {
    data.data.forEach(item => {
        placeOrder(item.instId, item.lastPr);
    });
});

config.tradingPairs.forEach(symbol => wsClient.subscribeTopic(instType, 'ticker', symbol));

let lastPrices = {};

function placeOrder(symbol, currentPrice) {
    const lastPrice = lastPrices[symbol] || currentPrice;
    const priceDifference = Math.abs(currentPrice - lastPrice);

    if (priceDifference >= config.step[symbol] || !lastPrices[symbol]) {
        lastPrices[symbol] = currentPrice; // Обновляем последнюю обработанную цену

        const { levelStart, levelEnd } = getPriceLevel(currentPrice, config.step[symbol]);
        const levelKey = `${levelStart}-${levelEnd}`;

        if (!ordersByLevel[symbol]) {
            ordersByLevel[symbol] = [];
        }

        let level = ordersByLevel[symbol].find(l => l.levelKey === levelKey);
        if (!level) {
            level = { levelKey, orders: [] };
            ordersByLevel[symbol].push(level);
        }

        if (level.orders.length < config.maxTrades) {
            const orderId = Math.floor(Math.random() * 1000) + '-' + currentPrice; // Эмуляция получения ID ордера
            const order = { orderId, price: currentPrice };
            level.orders.push(order);

            const str = `Разместили ордер для ${symbol} на уровне ${levelKey} с ценой ${currentPrice}. Order ID: ${orderId}`+os.EOL;
            console.log(str);
            appendStringToFile(config.files.logsFile, str);
        } else {
            const str = `Достигнуто максимальное количество ордеров (${config.maxTrades}) на уровне ${levelKey} для ${symbol}.`+os.EOL;
            console.log(str);
            appendStringToFile(config.files.logsFile, str);
        }
    } else {
        console.log(`Цена для ${symbol} изменилась недостаточно для создания нового ордера. Текущая цена: ${currentPrice}, последняя цена: ${lastPrice}.`);
    }
}


/**
 * @param {string} symbol
 * @param {string} orderId
 */
function removeOrder(symbol, orderId) {
    ordersByLevel[symbol].forEach(level => {
        const index = level.orders.findIndex(order => order.orderId === orderId);
        if (index !== -1) {
            level.orders.splice(index, 1);
            console.log(`Ордер ${orderId} для ${symbol} удален.`);
        }
    });
}
