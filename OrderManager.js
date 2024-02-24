import { appendStringToFile, clearLogFiles } from "./helpers.js";
import pkg from 'bitget-api';
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

        this.canTrade = false;
        this.prevPrice = 0;

        const o = this;
        this.logActiveActiveTrades = () => {
            const log = JSON.stringify(o.activeTrades, (key, value) => (value instanceof Map ? [...value] : value), 2);
            appendStringToFile(config.files.logsFile, log);
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

        let str = null;

        // Определяем, нужно ли добавить новый уровень и отменить ордера на самом дальнем уровне
        if (currentPrice > tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1].range.end + step) {
            // Цена поднялась выше верхнего уровня, добавляем новый уровень сверху
            const newLevelStart = tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1].range.end + step;
            const newLevelEnd = newLevelStart + 2 * step;
            this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'buy', tradeInfo);
            this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'sell', tradeInfo);

            // Отменяем ордера на самом нижнем уровне
            this.cancelOrdersAtLevel(tradeInfo.buyLevels[0], 'buy', tradeInfo);
            this.cancelOrdersAtLevel(tradeInfo.sellLevels[0], 'sell', tradeInfo);

            // Обновляем информацию о уровнях в tradeInfo
            tradeInfo.buyLevels.shift(); // Удаляем самый нижний buy уровень
            const bottomLevel = tradeInfo.sellLevels.shift(); // Удаляем самый нижний sell уровень

            str = `Удалили нижний уровень: ${bottomLevel.range.start} - ${bottomLevel.range.end}`;

        } else if (currentPrice < tradeInfo.sellLevels[0].range.start - step) {
            // Цена опустилась ниже нижнего уровня, добавляем новый уровень снизу
            const newLevelEnd = tradeInfo.sellLevels[0].range.start - step;
            const newLevelStart = newLevelEnd - 2 * step;
            this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'buy', tradeInfo);
            this.addNewLevel(symbol, newLevelStart, newLevelEnd, 'sell', tradeInfo);

            // Отменяем ордера на самом верхнем уровне
            this.cancelOrdersAtLevel(tradeInfo.buyLevels[tradeInfo.buyLevels.length - 1], 'buy');
            this.cancelOrdersAtLevel(tradeInfo.sellLevels[tradeInfo.sellLevels.length - 1], 'sell');

            // Обновляем информацию о уровнях в tradeInfo
            tradeInfo.buyLevels.pop(); // Удаляем самый верхний buy уровень
            const topLevel = tradeInfo.sellLevels.pop(); // Удаляем самый верхний sell уровень

            str = `Удалили верхний уровень: ${topLevel.range.start} - ${topLevel.range.end}`;

        } else {
            console.log(`Current ${symbol} price is ${currentPrice}`);
        }

        if (str !== null) {
            appendStringToFile(this.config.files.logsFile, str);
            console.log(str);
        }
    }

    // Функция для добавления нового уровня и ордеров
    addNewLevel(symbol, start, end, direction, tradeInfo) {
        const step = this.config.step[symbol];

        const price = direction === 'buy' ? start + step : end - step;
        const orderId = this._postOrder(price, direction);
        const newLevel = { range: { start, end }, orderIds: [orderId] };
        if (direction === 'buy') {
            tradeInfo.buyLevels.push(newLevel);
        } else {
            tradeInfo.sellLevels.push(newLevel);
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
        const orderId = `${direction.substring(0, 1).toUpperCase()}-${Math.random().toString(36).substring(2, 9)}`;

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
     * @private
     */
    async _getPendingOrders(params)
    {
        return await this.restClient.getFuturesOpenOrders(params);
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    async _fillTradesFromPendingOrders()
    {
        return this.config.tradingPairs.forEach(symbol => {
            this._getPendingOrders({
                symbol,
                productType: this.productType,
            }).then(data => {
                // Тут при инициализации торговли мы запонляем карту откртых ордеров.
            });
        });
    }
}
