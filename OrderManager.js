import { appendStringToFile, clearLogFiles } from "./helpers.js";
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

        this.activeTrades = new Map(); // Хранит информацию о активных торговых операциях и лимитках для каждого символа.
        // this.tradesList = {
        //     buy: [],
        //     sell: [],
        //     activeBuy: [],
        //     activeSell: [],
        // };

        this.canTrade = false;
        this.prevPrice = 0;

        const o = this;
        this.logActiveActiveTrades = (obj) => {
            const log = JSON.stringify(obj, (key, value) => (value instanceof Map ? [...value] : value), 2);
            appendStringToFile(config.files.logsFile, log);
            console.log(log);
        };
    }

    // Метод для начала торговли или обработки изменения цены.
    async handlePriceUpdate(symbol, currentPrice) {
        if (this.prevPrice === currentPrice) {
            return;
        }

        this.prevPrice = currentPrice;
        let tradeInfo = this.activeTrades.get(symbol);

        if (tradeInfo && this.canTrade) {
            this.updateTrade(symbol, currentPrice, tradeInfo);
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
        const buyLowOrderId = this._postOrder((lowRange.start + lowRange.end) / 2, 'buy');
        const sellLowOrderId = this._postOrder((lowRange.start + lowRange.end) / 2, 'sell');

        const buyCurrentOrderId = this._postOrder(currentPrice, 'buy');
        const sellCurrentOrderId = this._postOrder(currentPrice, 'sell');

        const buyHighOrderId = this._postOrder((highRange.start + highRange.end) / 2, 'buy');
        const sellHighOrderId = this._postOrder((highRange.start + highRange.end) / 2, 'sell');

        // Структурируем tradeInfo с учетом диапазонов и разделяем buy и sell levels
        const tradeInfo = {
            buyLevels: [
                { range: lowRange, orderIds: [buyLowOrderId] },
                { range: currentRange, orderIds: [buyCurrentOrderId] },
                { range: highRange, orderIds: [buyHighOrderId] }
            ],
            sellLevels: [
                { range: lowRange, orderIds: [sellLowOrderId] },
                { range: currentRange, orderIds: [sellCurrentOrderId] },
                { range: highRange, orderIds: [sellHighOrderId] }
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
        appendStringToFile(this.config.files.logsFile, _str);

        let str = '';

        // Определяем, нужно ли добавить новый уровень и отменить ордера на самом дальнем уровне
        if (currentPrice > topPriceCheck) {
            let newLevelStart = tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1].range.end;
            let newLevelEnd = newLevelStart + step;
            let levelsToAdd = Math.floor((currentPrice - newLevelEnd) / step) + 1;

            for (let i = 0; i < levelsToAdd; i++) {
                // Добавляем новый уровень сверху
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'buy', tradeInfo);
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'sell', tradeInfo);

                str += os.EOL + `Новый уровень сверху: ${newLevelStart} - ${newLevelEnd}`;

                // Подготавливаем параметры для следующего уровня
                newLevelStart = newLevelEnd;
                newLevelEnd = newLevelStart + step;

                // Отменяем ордера на самом нижнем уровне, так как добавлены новые уровни
                this.cancelOrdersAtLevel(tradeInfo.buyLevels[0], 'buy', tradeInfo);
                this.cancelOrdersAtLevel(tradeInfo.sellLevels[0], 'sell', tradeInfo);

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
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'buy', tradeInfo, true);
                this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'sell', tradeInfo, true);

                str += os.EOL + `Новый уровень снизу: ${newLevelStart} - ${newLevelEnd}`;

                // Подготавливаем параметры для следующего уровня
                newLevelEnd = newLevelStart;
                newLevelStart = newLevelEnd - step;

                // Отменяем ордера на самом верхнем уровне, так как добавлены новые уровни снизу
                this.cancelOrdersAtLevel(tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1], 'buy');
                this.cancelOrdersAtLevel(tradeInfo.sellLevels[tradeInfo.sellLevels.length - 1], 'sell');

                // Удаляем самый верхний buy и sell уровни
                tradeInfo.buyLevels.pop();
                tradeInfo.sellLevels.pop();
            }
        }

        if (str.length > 0) {
            appendStringToFile(this.config.files.logsFile, str);
            console.log(str);
        }
    }

    // Функция для добавления нового уровня и ордеров
    addNewLevel(symbol, start, end, direction, tradeInfo, isPriceGoingDown) {
        const price = direction === 'buy' ? start + this.config.step[symbol] : end - this.config.step[symbol];
        const orderId = this._postOrder(price, direction);
        const newLevel = { range: { start, end }, orderIds: [orderId] };

        if (direction === 'buy') {
            if (isPriceGoingDown) {
                // Если цена идет вниз, добавляем новый уровень в начало массива buyLevels
                tradeInfo.buyLevels.unshift(newLevel);
            } else {
                // Если цена идет вверх, добавляем новый уровень в конец массива buyLevels
                tradeInfo.buyLevels.push(newLevel);
            }
        } else { // direction === 'sell'
            if (isPriceGoingDown) {
                // Если цена идет вниз, добавляем новый уровень в начало массива sellLevels
                tradeInfo.sellLevels.unshift(newLevel);
            } else {
                // Если цена идет вверх, добавляем новый уровень в конец массива sellLevels
                tradeInfo.sellLevels.push(newLevel);
            }
        }
    }


    // Функция для отмены ордеров на указанном уровне
    cancelOrdersAtLevel(level, direction) {
        const o = this;
        level.orderIds.forEach(orderId => {
            // Предполагается, что функция cancelOrder возвращает true при успешной отмене
            if (o.cancelOrder(orderId)) {
                const str = `Order ${orderId} cancelled successfully.`;
                appendStringToFile(this.config.files.logsFile, str);
                console.log(str);

                // Удаление идентификатора ордера из списка, если требуется
            }
        });
        level.orderIds = [];
    }


    _postOrder(price, direction) {
        // Симулируем размещение ордера и возвращаем рандомный идентификатор ордера.
        const orderId = `${direction.substring(0, 1).toUpperCase()}-${Math.random().toString(36).substring(2, 13)}`;

        const str = `Order posted: ${orderId} at price ${price} for ${direction}`;
        console.log(str);
        appendStringToFile(this.config.files.logsFile, str);

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
                // console.log(data);
                // Тут при инициализации торговли мы запонляем карту откртых ордеров.
            });
        });
    }
}
