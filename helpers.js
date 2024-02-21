
import config from "./config.js";
import { writeFile, appendFile } from 'fs';
import { RestClientV2 } from "bitget-api";
import os from 'os';
import { format } from 'date-fns';

/**
 * Formats a Date object into the specified format.
 * @param {Date} date The Date object to format.
 * @param {string} formatStr Format string, similar to the PHP date() function.
 * @returns {string} Formatted date string.
 */
function formatDate(date, formatStr) {
    return format(date, formatStr);
}

/**
 * Asynchronously appends a line to a file.
 * @param {string} filePath
 * @param {string} data
 */
export function appendStringToFile(filePath, data)
{
    appendFile(filePath, data, 'utf8', (err) => {
        if (err) {
            console.error('Err occurred', err);
        } else {
            // console.log('Data was appended in file', data);
        }
    });
}

/**
 * Clears a file by writing an empty string or the specified data.
 * @param {string} filePath Path to the file to be cleared.
 * @param {string} [data=''] Data that will be written to the file in place of the existing content.
 */
function clearFile(filePath, data = '')
{
    writeFile(filePath, data, 'utf8', (err) => {
        if (err) {
            console.error('Err occurred', err);
        } else {
            // console.log('Data was written in file', data);
        }
    });
}

/**
 * Clear all config files
 */
export function clearLogFiles()
{
    Object.values(config.files).forEach(file => clearFile(file));
}

/**
 *
 * @param {RestClientV2} restClient
 * @param {string} instType
 * @returns {Promise<void>}
 */
export async function saveAccountSnapshot(restClient, instType)
{
    await restClient.getFuturesAccountAssets({
        productType: instType,
    }).then(data => {
        let equity = [];
        data.data.forEach(coin => {
            equity.push(`Coin: ${coin.marginCoin}, usdtEquity: ${coin.usdtEquity}`);
        });

        const str = `${equity.join(os.EOL)}, time: ${formatDate(new Date(), 'yyyy-MM-dd HH:mm:ss')+os.EOL}------------${os.EOL}`;
        appendStringToFile(config.files.assetsFile, str);
    });
}
