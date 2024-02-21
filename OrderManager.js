export class OrderManager {
    constructor(config) {
        this.config = config;
        this.activeTrades = new Map(); // хранит информацию о активных трейдах и лимитках для каждого символа
    }

    // Метод для начала торговли или обработки изменения цены
    handlePriceUpdate(symbol, currentPrice) {
        let tradeInfo = this.activeTrades.get(symbol);

        if (!tradeInfo) {
            // Если торговля по этой паре еще не началась, начинаем торговлю
            this.startNewTrade(symbol, currentPrice);
        } else {
            // Обработка изменения цены для активной торговой пары
            this.updateTrade(symbol, currentPrice, tradeInfo);
        }
    }

    startNewTrade(symbol, currentPrice) {
        // Размещаем начальные ордера на покупку и продажу
        const buyPrice = currentPrice - this.config.step[symbol];
        const sellPrice = currentPrice + this.config.step[symbol];

        // Симуляция размещения ордеров
        console.log(`Placing initial buy order for ${symbol} at ${buyPrice}`);
        console.log(`Placing initial sell order for ${symbol} at ${sellPrice}`);

        // Сохраняем информацию об ордерах
        const tradeInfo = {
            initialOrderPlaced: true,
            buyLevels: [buyPrice],
            sellLevels: [sellPrice],
            tradeCount: 1, // Счетчик сделок для ограничения количества повторений
        };

        this.activeTrades.set(symbol, tradeInfo);
    }

    updateTrade(symbol, currentPrice, tradeInfo) {
        const { buyLevels, sellLevels, tradeCount } = tradeInfo;
        const step = this.config.step[symbol];
        const maxTrades = this.config.maxTrades;

        // Проверка на достижение лимита торгов
        if (tradeCount >= maxTrades) {
            console.log(`Max trade count reached for ${symbol}. Waiting for significant price movement.`);
            return;
        }

        let newLevelRequired = false;
        let direction = null;

        // Проверка на необходимость добавления новых уровней
        if (currentPrice >= sellLevels[sellLevels.length - 1] + step) {
            newLevelRequired = true;
            direction = 'up';
        } else if (currentPrice <= buyLevels[buyLevels.length - 1] - step) {
            newLevelRequired = true;
            direction = 'down';
        }

        if (newLevelRequired) {
            // Размещаем новые ордера в зависимости от направления движения цены
            this.placeNewOrders(symbol, currentPrice, direction, tradeInfo);
        } else {
            console.log(`Price movement within the existing levels for ${symbol}. No new orders placed.`);
        }
    }

    placeNewOrders(symbol, currentPrice, direction, tradeInfo) {
        const step = this.config.step[symbol];
        const newBuyPrice = currentPrice - step;
        const newSellPrice = currentPrice + step;

        // Симуляция отмены предыдущих ордеров, если направление изменилось
        if (direction === 'up') {
            // Отменяем ордер на покупку
            console.log(`Canceling previous buy orders for ${symbol}`);
        } else if (direction === 'down') {
            // Отменяем ордер на продажу
            console.log(`Canceling previous sell orders for ${symbol}`);
        }

        console.log(`Placing new buy order for ${symbol} at ${newBuyPrice}`);
        console.log(`Placing new sell order for ${symbol} at ${newSellPrice}`);

        // Обновляем информацию о трейде
        tradeInfo.buyLevels.push(newBuyPrice);
        tradeInfo.sellLevels.push(newSellPrice);
        tradeInfo.tradeCount += 1;

        this.activeTrades.set(symbol, tradeInfo);
    }

    // Метод для симуляции удаления ордеров (не реализован в этом примере)
    cancelOrders(symbol) {
        console.log(`Canceling orders for ${symbol}`);
        // Реализация удаления ордеров здесь
    }
}
