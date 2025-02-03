import constants from "./constants.js"
import environment from "./environment.js";
import interpretGS1scan from "./interpretGS1scan/interpretGS1scan.js";

function convertToLastMonthDay(date) {
    let expireDateConverted = date.replace("00", "01");
    expireDateConverted = new Date(expireDateConverted.replaceAll(' ', ''));
    expireDateConverted.setFullYear(expireDateConverted.getFullYear(), expireDateConverted.getMonth() + 1, 0);
    expireDateConverted = expireDateConverted.getTime();
    return expireDateConverted;
}

function getDateForDisplay(date) {
    if (date.slice(0, 2) === "00") {
        return date.slice(5);
    }
    return date;
}


function getExpiryTime(expiry) {
    let normalizedExpiryDate;
    let expiryTime;
    try {
        if (expiry.slice(0, 2) === "00") {
            normalizedExpiryDate = convertToLastMonthDay(expiry);
        } else {
            let expiryForDisplay = getDateForDisplay(expiry);
            normalizedExpiryDate = expiryForDisplay.replace(/\s/g, '')
        }

        //set expiry to the end of the day
        expiryTime = new Date(normalizedExpiryDate).setHours(23, 59, 59, 999);
        if (expiryTime > 0) {
            return expiryTime
        }
    } catch (err) {
        return null;
    }

    return null;

}

function isExpired(expiry) {
    let expiryTime = getExpiryTime(expiry);
    if (!expiryTime) {
        //expiry is incorrect date format, can not determine if is expired so it will be treated as not expired
        return false;
    }
    return !expiryTime || expiryTime <= Date.now()
}


function convertFromISOtoYYYY_HM(dateString, useFullMonthName, separator) {
    const splitDate = dateString.split('-');
    const month = parseInt(splitDate[1]);
    let separatorString = "-";
    if (typeof separator !== "undefined") {
        separatorString = separator;
    }
    if (useFullMonthName) {
        return `${splitDate[2]} ${separatorString} ${constants.monthNames[month - 1]} ${separatorString} ${splitDate[0]}`;
    }
    return `${splitDate[2]} ${separatorString} ${constants.monthNames[month - 1].slice(0, 3)} ${separatorString} ${splitDate[0]}`;
}

function validateGTIN(gtinValue) {
    const gtinMultiplicationArray = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3];

    if (!gtinValue || isNaN(gtinValue)) {
        return {
            isValid: false, message: "GTIN should be a numeric value", errorCode: constants.errorCodes.gtin_wrong_chars
        };
    }
    let gtinDigits = gtinValue.split("");

    // TO DO this check is to cover all types of gtin. For the moment we support just 14 digits length. TO update also in leaflet-ssapp
    /*
    if (gtinDigits.length !== 8 && gtinDigits.length !== 12 && gtinDigits.length !== 13 && gtinDigits.length !== 14) {

      return {isValid: false, message: "GTIN length should be 8, 12, 13 or 14"};
    }
    */

    if (gtinDigits.length !== 14) {
        return {isValid: false, message: "GTIN length should be 14", errorCode: constants.errorCodes.gtin_wrong_length};
    }
    let j = gtinMultiplicationArray.length - 1;
    let reszultSum = 0;
    for (let i = gtinDigits.length - 2; i >= 0; i--) {
        reszultSum = reszultSum + gtinDigits[i] * gtinMultiplicationArray[j];
        j--;
    }
    let validDigit = Math.floor((reszultSum + 10) / 10) * 10 - reszultSum;
    if (validDigit === 10) {
        validDigit = 0;
    }
    if (gtinDigits[gtinDigits.length - 1] != validDigit) {
        return {
            isValid: false,
            message: "Invalid GTIN. Last digit should be " + validDigit,
            errorCode: constants.errorCodes.gtin_wrong_digit
        };
    }

    return {isValid: true, message: "GTIN is valid"};
}

function goToPage(pageName) {

    if (!pageName || typeof pageName !== "string" || pageName[0] !== "/" || window.location.hash) {
        pageName = `/error.html?errorCode=${constants.errorCodes.url_redirect_error}`
    }
    let pagePath = window.location.pathname.replace(/\/[^\/]*$/, pageName)
    window.location.href = (window.location.origin + pagePath);
}

function goToErrorPage(errorCode, error) {
    console.error(error);

    let errCode = errorCode || "010";
    if (!error) {
        error = new Error("goToErrorPage called with partial args!")
    }
    const parseError = JSON.stringify(error, Object.getOwnPropertyNames(error));
    localStorage.setItem(constants.LAST_ERROR, parseError);
    window.history.pushState({}, "", "index.html");
    goToPage(`/error.html?errorCode=${errCode}`)
}

function setTextDirectionForLanguage(lang, selector) {
    let elementSelector = selector || "body";
    if (constants.rtlLangCodes.find((rtlLAng) => rtlLAng === lang)) {
        document.querySelector(elementSelector).setAttribute("dir", "RTL")
    } else {
        document.querySelector(elementSelector).setAttribute("dir", "LTR")
    }
}

function isQuotaExceededError(err) {
    return (err instanceof DOMException && (err.name === "QuotaExceededError" || // Firefox
        err.name === "NS_ERROR_DOM_QUOTA_REACHED"));
}

function updateLocalStorage(consoleArgs, nrToKeep = 20) {
    try {
        let devConsoleDebug = JSON.parse(localStorage.getItem(constants.DEV_DEBUG));
        devConsoleDebug.push({tabId: sessionStorage.tabID, ...consoleArgs});
        localStorage.setItem(constants.DEV_DEBUG, JSON.stringify(devConsoleDebug));

    } catch (e) {
        if (isQuotaExceededError(e) && nrToKeep > 1) {
            let devConsoleDebug = JSON.parse(localStorage.getItem(constants.DEV_DEBUG));
            devConsoleDebug = devConsoleDebug.slice(-1 * nrToKeep);
            localStorage.setItem(constants.DEV_DEBUG, JSON.stringify(devConsoleDebug));
            updateLocalStorage(consoleArgs, nrToKeep - 1);
        } else {
            console.log("Couldn't update localStorage", JSON.stringify(e, Object.getOwnPropertyNames(e)));
        }
    }
}

function enableConsolePersistence() {
    // console.originalLogFnc = console.log;
    // console.originalErrorFnc = console.error;
    // console.originalWarnFnc = console.warn;

    // sessionStorage.tabID ? sessionStorage.tabID : sessionStorage.tabID = Math.random();

    // if (!JSON.parse(localStorage.getItem(constants.DEV_DEBUG))) {
    //     localStorage.setItem(constants.DEV_DEBUG, JSON.stringify([]))
    // }

    // console.log = function () {
    //     // default &  console.log()
    //     console.originalLogFnc.apply(console, arguments);
    //     // new & array data
    //     updateLocalStorage(arguments);
    // }
    // console.error = function () {
    //     // default &  console.error()
    //     console.originalErrorFnc.apply(console, arguments);
    //     // new & array data
    //     updateLocalStorage(arguments);

    // }
    // console.warn = function () {
    //     // default &  console.warn()
    //     console.originalWarnFnc.apply(console, arguments);
    //     // new & array data
    //     updateLocalStorage(arguments);
    // }

}

function getFontSizeInMillimeters(element) {
    // Obțineți stilul computat pentru elementul dat
    const style = window.getComputedStyle(element);

    // Extrageți dimensiunea fontului în pixeli și convertiți-o într-un număr
    const fontSizeInPixels = parseFloat(style.fontSize);

    // Definiți conversia de la inch la milimetri
    const mmPerInch = 25.4;

    // Convertiți pixelii în puncte (1 punct = 1/72 inch), apoi în milimetri
    const fontSizeInMillimeters = fontSizeInPixels * (1 / 72) * mmPerInch;

    return fontSizeInMillimeters;
}

function updateFontZoom(value, ignoreBrowser) {
    let zoom = value || localStorage.getItem(constants.FONT_ZOOM)

    if (zoom >= 99 && zoom < 110) {
        zoom = 100;
    }

    if (zoom >= 110 && zoom < 114) {
        zoom = 110;
    }

    if (zoom >= 114 && zoom <= 130) {
        zoom = 130;
    }
    if (zoom > 130 && zoom <= 150) {
        zoom = 150;
    }

    if (zoom > 150 && zoom < 200) {
        zoom = 175;
    }
    if (zoom >= 200 && zoom < 250) {
        zoom = 200;
    }
    if (zoom >= 250 && zoom < 300) {
        zoom = 250;
    }
    if (zoom >= 300) {
        zoom = 300;
    }
    zoomFont(zoom.toString(), ignoreBrowser);
}

function getBrowser() {
    let userAgent = navigator.userAgent;

    if (userAgent.match(/chrome|chromium|crios/i)) {
        return "chrome"
    }
    if (userAgent.match(/firefox|fxios/i)) {
        return "firefox"
    }
    if (userAgent.match(/safari/i)) {
        return "safari"
    }
    if (userAgent.match(/opr/i)) {
        return "opera"
    }
}

function getComputeFontZoom() {
    let userAgent = navigator.userAgent;
    if (getBrowser() === "chrome") {
        return Math.round(parseFloat(getComputedStyle(document.querySelector("#font-control")).height) / 0.16)
    }

    if (getBrowser() === "safari") {
        return window.visualViewport.scale * 100;
    }
    if (getBrowser() === "firefox" || getBrowser() === "opera") {
        //TO DO
        return 100;
    }

}

function saveFontZoom() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    let zoom = urlParams.get("zoom") || getComputeFontZoom() || localStorage.getItem(constants.FONT_ZOOM);
    localStorage.setItem(constants.FONT_ZOOM, zoom);
}

function zoomFont(scaleFactor, ignoreBrowser) {
    let visualViewportDelta = window.visualViewport.scale;// > 2 ? window.visualViewport.scale / 2 : 1
    let currentBrowser = ignoreBrowser ? "safari" : getBrowser();
    document.documentElement.style.setProperty('--font-size--basic', constants.FONT_SCALE_MAP.basic_font[scaleFactor][currentBrowser]);
    document.documentElement.style.setProperty('--font-size--M', constants.FONT_SCALE_MAP.m_font[scaleFactor][currentBrowser]);
    document.documentElement.style.setProperty('--font-size--L', constants.FONT_SCALE_MAP.l_font[scaleFactor][currentBrowser]);
    document.documentElement.style.setProperty('--font-size--XL', constants.FONT_SCALE_MAP.xl_font[scaleFactor][currentBrowser]);
}

let resizeListener;

function addResizeListener() {
    if (!resizeListener) {
        resizeListener = window.visualViewport.addEventListener("resize", (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            localStorage.setItem(constants.FONT_ZOOM, evt.target.scale * 100);
            updateFontZoom();
        })
    }
}

function setFontSize() {
    let testFontContainer = document.querySelector("#font-control");
    testFontContainer.classList.remove("hiddenElement");
    testFontContainer.getClientRects();
    saveFontZoom();
    updateFontZoom();
    addResizeListener();
    testFontContainer.classList.add("hiddenElement");
}

function loadAppVersion() {
    let appRootPage = `/app/main.html`;
    if (environment.enableRootVersion) {
        appRootPage = `/${environment.appBuildVersion}/main.html`;
    }
    goToPage(appRootPage);
}

function parseGS1Code(scannedBarcode) {
    let gs1FormatFields;
    try {
        gs1FormatFields = interpretGS1scan.interpretScan(scannedBarcode);
    } catch (e) {
        throw e;
        return;
    }

    return parseGs1Fields(gs1FormatFields.ol);
}

function parseGs1Fields(orderedList) {
    const gs1Fields = {};
    const fieldsConfig = {
        "GTIN": "gtin",
        "BATCH/LOT": "batchNumber",
        "SERIAL": "serialNumber",
        "USE BY OR EXPIRY": "expiry"
    };

    orderedList.map(el => {
        let fieldName = fieldsConfig[el.label];
        gs1Fields[fieldName] = el.value;
    })

    if (gs1Fields.expiry) {
        try {
            gs1Fields.expiry = convertFromISOtoYYYY_HM(gs1Fields.expiry);
        } catch (e) {
            gs1Fields.expiry = null;
        }

    }

    return gs1Fields;
}

function escapeHTML(value) {
    if (value != null) {
        let div = document.createElement("div");
        let text = document.createTextNode(value);
        div.appendChild(text);
        return div.innerHTML;
    }
    return '';
}

function escapeHTMLAttribute(value) {
    if (value != null) {
        return ('' + value).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n/g, '&#13;').replace(/[\r\n]/g, '&#13;');
    }
    return '';
}

function sanitizeLogMessage(message) {
    if (typeof message !== 'string') {
        try {
            if (message instanceof Error) {
                message = JSON.stringify(message, Object.getOwnPropertyNames(message));
            } else {
                message = JSON.stringify(message);
            }
        } catch (e) {
            return message;
        }
    }
// Implement sanitization logic
// For example, stripping out potentially dangerous characters
    return message.replace('\\n', '').replace('\\r', '');
}

export {
    convertFromISOtoYYYY_HM,
    convertToLastMonthDay,
    getDateForDisplay,
    isExpired,
    getExpiryTime,
    goToPage,
    validateGTIN,
    goToErrorPage,
    setTextDirectionForLanguage,
    enableConsolePersistence,
    updateFontZoom,
    getFontSizeInMillimeters,
    saveFontZoom,
    setFontSize,
    zoomFont,
    loadAppVersion,
    parseGs1Fields,
    parseGS1Code,
    escapeHTML,
    escapeHTMLAttribute,
    sanitizeLogMessage
}
