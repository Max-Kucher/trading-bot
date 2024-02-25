import { appendStringToFile, clearLogFiles, formatDate } from "./helpers.js";
import pkg from 'bitget-api';
import os from "os";
const { WebsocketClientV2, RestClientV2, APIResponse } = pkg;

export class OrderManager {
    /**
     *
     * @param {RestClientV2} restClient
     * @param {WebsocketClientV2} wsClient
     * @param {object} config
     * @param {object} env
     * @param {string} productType
     */
    constructor(restClient, wsClient, config, env, productType) {
        clearLogFiles();

        this.restClient = restClient;
        // this.wsClient = wsClient;

        this.config = config;
        // this.env = env;
        this.productType = productType;
        this.marginCoin = productType.replace('-FUTURES', '');

        this.activeTrades = new Map(); // Хранит информацию о активных торговых операциях и лимитках для каждого символа.
        this.activeOrders = new Map();

        this.canTrade = false;
        this.prevPrice = 0;

        this.logsFileName = `${config.files.logsFile}-${formatDate(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.txt`;

        // const o = this;
        // this.logActiveActiveTrades = (obj) => {
        //     const log = JSON.stringify(obj, (key, value) => (value instanceof Map ? [...value] : value), 2);
        //     appendStringToFile(o.logsFileName, log);
        //     console.log(log);
        // };
    }

    // Метод для начала торговли или обработки изменения цены.
    async handlePriceUpdate(symbol, currentPrice) {
        if (this.prevPrice === currentPrice) {
            return;
        }

        this.prevPrice = currentPrice;
        let tradeInfo = this.activeTrades.get(symbol);

        if (tradeInfo && this.canTrade) {
            // this.updateTrade(symbol, currentPrice, tradeInfo);
        } else {
            const o = this;
            await this._fillTradesFromPendingOrders().finally(() => {
                o.startNewTrade(symbol, currentPrice);
                this.canTrade = true;
            });
        }
    }

    startNewTrade(symbol, currentPrice) {
        const step = this.config.step[symbol];
        // Определяем диапазоны для каждого уровня
        const lowRange = { start: currentPrice - 3 * step / 2, end: currentPrice - step / 2 };
        const currentRange = { start: currentPrice - step / 2, end: currentPrice + step / 2 };
        const highRange = { start: currentPrice + step / 2, end: currentPrice + 3 * step / 2 };

        // Создаем ордера на покупку и продажу для каждого диапазона
        // const buyLowOrderId = this._postOrder(symbol, (lowRange.start + lowRange.end) / 2, 'Buy');
        // const sellLowOrderId = this._postOrder(symbol, (lowRange.start + lowRange.end) / 2, 'Sell');

        const buyCurrentOrderId = this._postOrder(symbol, currentPrice, 'Buy');
        // const sellCurrentOrderId = this._postOrder(symbol, currentPrice, 'Sell');

        // const buyHighOrderId = this._postOrder(symbol, (highRange.start + highRange.end) / 2, 'Buy');
        // const sellHighOrderId = this._postOrder(symbol, (highRange.start + highRange.end) / 2, 'Sell');

        // Структурируем tradeInfo с учетом диапазонов и разделяем buy и sell levels
        const tradeInfo = {
            buyLevels: [
                // { range: lowRange, orderIds: [buyLowOrderId] },
                { range: currentRange, orderIds: [buyCurrentOrderId] },
                // { range: highRange, orderIds: [buyHighOrderId] }
            ],
            sellLevels: [
                // { range: lowRange, orderIds: [sellLowOrderId] },
                // { range: currentRange, orderIds: [sellCurrentOrderId] },
                // { range: highRange, orderIds: [sellHighOrderId] }
            ]
        };

        this.activeTrades.set(symbol, tradeInfo);
    }

    // Обновление торговых уровней и ордеров в зависимости от текущей цены
    updateTrade(symbol, currentPrice, tradeInfo) {
        const step = this.config.step[symbol];

        const topPriceCheck = tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1].range.end - step / 2;
        const bottomPriceCheck = tradeInfo.sellLevels[0].range.start + step / 2;

        const _str = `Current ${symbol} price is ${currentPrice}`;
        console.log(_str);
        appendStringToFile(this.logsFileName, _str);

        let str = '';

        // Определяем, нужно ли добавить новый уровень и отменить ордера на самом дальнем уровне
        if (currentPrice > topPriceCheck) {
            let newLevelStart = tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1].range.end;
            let newLevelEnd = newLevelStart + step;
            let levelsToAdd = Math.floor((currentPrice - newLevelEnd) / step) + 1;

            for (let i = 0; i < levelsToAdd; i++) {
                // Добавляем новый уровень сверху
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'Buy', tradeInfo);
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'Sell', tradeInfo);

                str += os.EOL + `Новый уровень сверху: ${newLevelStart} - ${newLevelEnd}`;

                // Подготавливаем параметры для следующего уровня
                newLevelStart = newLevelEnd;
                newLevelEnd = newLevelStart + step;

                // Отменяем ордера на самом нижнем уровне, так как добавлены новые уровни
                this.cancelOrdersAtLevel(tradeInfo.buyLevels[0], 'Buy', tradeInfo);
                this.cancelOrdersAtLevel(tradeInfo.sellLevels[0], 'Sell', tradeInfo);

                // Удаляем самый нижний buy и sell уровни
                tradeInfo.buyLevels.shift();
                tradeInfo.sellLevels.shift();
            }
        } else if (currentPrice < bottomPriceCheck) {
            let newLevelEnd = tradeInfo.sellLevels[0].range.start;
            let newLevelStart = newLevelEnd - step;
            let levelsToAdd = Math.floor((newLevelStart - currentPrice) / step) + 1;

            for (let i = 0; i < levelsToAdd; i++) {
                // Добавляем новый уровень снизу
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'Buy', tradeInfo, true);
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'Sell', tradeInfo, true);

                str += os.EOL + `Новый уровень снизу: ${newLevelStart} - ${newLevelEnd}`;

                // Подготавливаем параметры для следующего уровня
                newLevelEnd = newLevelStart;
                newLevelStart = newLevelEnd - step;

                // Отменяем ордера на самом верхнем уровне, так как добавлены новые уровни снизу
                this.cancelOrdersAtLevel(tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1], 'Buy');
                this.cancelOrdersAtLevel(tradeInfo.sellLevels[tradeInfo.sellLevels.length - 1], 'Sell');

                // Удаляем самый верхний buy и sell уровни
                tradeInfo.buyLevels.pop();
                tradeInfo.sellLevels.pop();
            }
        }

        if (str.length > 0) {
            appendStringToFile(this.logsFileName, str);
            console.log(str);
        }
    }

    // Функция для добавления нового уровня и ордеров
    addNewLevel(symbol, start, end, direction, tradeInfo, isPriceGoingDown) {
        const price = direction === 'Buy' ? start + (this.config.step[symbol] / 2) : end - (this.config.step[symbol] / 2);
        const orderId = this._postOrder(symbol, price, direction);
        const newLevel = { range: { start, end }, orderIds: [orderId] };

        if (direction === 'Buy') {
            if (isPriceGoingDown) {
                tradeInfo.buyLevels.unshift(newLevel);
            } else {
                tradeInfo.buyLevels.push(newLevel);
            }
        } else { // direction === 'Sell'
            if (isPriceGoingDown) {
                tradeInfo.sellLevels.unshift(newLevel);
            } else {
                tradeInfo.sellLevels.push(newLevel);
            }
        }
    }


    // Функция для отмены ордеров на указанном уровне
    cancelOrdersAtLevel(level) {
        const o = this;
        level.orderIds.forEach(orderId => {
            // Предполагается, что функция cancelOrder возвращает true при успешной отмене
            if (o.cancelOrder(orderId)) {
                const str = `Order ${orderId} cancelled successfully.`;
                appendStringToFile(this.logsFileName, str);
                console.log(str);
            }
        });
    }

    /**
     *
     * @param {string }symbol
     * @param {number} price
     * @param {string} direction
     * @returns {string}
     * @private
     */
    async _postOrder(symbol, price, direction) {
        let presetStopSurplusPrice,
            presetStopLossPrice;

        if (direction === 'Buy') {
            presetStopSurplusPrice = price + this.config.profit[symbol];
            presetStopLossPrice = price - this.config.loss[symbol];
        } else {
            presetStopSurplusPrice = price - this.config.profit[symbol];
            presetStopLossPrice = price + this.config.loss[symbol];
        }

        const clientOid = `${symbol}-${direction.substring(0, 1).toUpperCase()}-${Math.random().toString(36).substring(2, 9)}`;
        let orderData = await this.restClient.futuresSubmitOrder({
            productType: this.productType,
            marginMode: 'isolated',
            symbol,
            marginCoin: this.marginCoin,
            size: this.config.tradingAmounts[symbol],
            side: direction,
            tradeSide: 'Open',
            price,
            orderType: 'limit',
            force: 'GTC',
            presetStopSurplusPrice,
            presetStopLossPrice,
            clientOid,
        });

        if (orderData.msg !== 'success') {
            throw `Error on creating order (#${orderData.code}): ${orderData.msg}`;
        }

        const orderId = orderData.data.orderId;
        const str = `Order posted: ${orderId} (clientOid: ${clientOid}) at price ${price} for ${direction}`;

        console.log(str);
        appendStringToFile(this.logsFileName, str);

        return orderId;
    }

    cancelOrder(symbol, orderId) {
        // console.log(`Canceling orders for ${symbol}: ${orderId}`);
        // Реализация удаления ордеров здесь.
        return true;
    }

    /**
     *
     * @param {object} params
     * @returns {Promise<APIResponse<any>>}
     */
    async _getPendingOrders(params)
    {
        return await this.restClient.getFuturesOpenOrders(params);
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async _fillTradesFromPendingOrders()
    {
        return this.config.tradingPairs.forEach(symbol => {
            this._getPendingOrders({
                symbol,
                productType: this.productType,
            }).then(data => {
                // console.log(data.data.entrustedList);
                // Тут при инициализации торговли мы запонляем карту откртых ордеров.
            });
        });
    }
}
