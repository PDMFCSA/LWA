import {setTextDirectionForLanguage} from "../../utils.js";
import constants from "../../constants.js";

function getLangSubtypesMap(languageCodesMap) {
    let result = {}
    Object.keys(languageCodesMap).forEach(key => {
        languageCodesMap[key].forEach(langSubtype => {
            result[langSubtype] = key
        })
    });
    return result
}

const supportedLanguageCodesMap = {
    'ar': ["ar-ae", "ar-bh", "ar-dz", "ar-eg", "ar-iq", "ar-jo", "ar-kw", "ar-lb", "ar-ly", "ar-ma", "ar-om", "ar-qa", "ar-sa", "ar-sy", "ar-tn", "ar-ye"],
    'bg': ["bg-bg"],
    'cs': ["cs-cz"],
    'da': ["da-dk"],
    'de': ["de-de"],
    'el': ["el-gr"],
    'en': ["en-au", "en-bz", "en-ca", "en-gb", "en-ie", "en-jm", "en-nz", "en-ph", "en-tt", "en-us", "en-za", "en-zw"],
    'es': ["es-es"],
    'es-419': ["es-419", "es-ar", "es-bo", "es-cl", "es-co", "es-cr", "es-do", "es-ec", "es-gt", "es-mx", "es-ni", "es-pa", "es-pe", "es-pr", "es-py", "es-sv", "es-us", "es-uy", "es-ve"],
    'et': ["et-ee"],
    'fi': ["fi-fi"],
    'fr': ["fr-be", "fr-ca", "fr-fr"],
    'hr': ["hr-ba", "hr-hr"],
    'hu': ["hu-hu"],
    'it': ["it-ch", "it-it"],
    'ko': ["ko-kr"],
    'lt': ["lt-lt"],
    'lv': ["lv-lv"],
    'nl': ["nl-nl"],
    'no': ["nb", "nb-no", "nn", "nn-no"],
    'pl': ["pl-pl"],
    'pt': ["pt", "pt-pt"],
    'pt-br': [],
    'ro': ["ro-md", "ro-ro"],
    'sk': ["sk-sk"],
    'sl': ["sl-si"],
    'sv': ["sv-fi", "sv-se"],
    'tr': ["tr-tr"],
    'uk': ["uk-ua"]
    // 'zh': ["zh-cn", "zh-hans", "zh-hant", "zh-hk"]
}

const langSubtypesMap = getLangSubtypesMap(supportedLanguageCodesMap);


function transformToISOStandardLangCode(code) {
    //language codes on phones have "_" instead of "-" and for base languages ends with "_"
    let replaceValue = "-";
    if (code.slice(-1) === "_") {
        replaceValue = "";
    }
    return code.replace("_", replaceValue);
}

async function fetchTranslation(langCode) {
    try {
        const dataModule = await import(`./../translations/${langCode}.js`);
        return dataModule.default
        // You can now use the 'translations' object for localization in your application
    } catch (error) {
        alert(`An error has occurred: ${error.message} on fetching translation for ${langCode} 
    Possible network issue!!! Check your network connection and try again`);
    }
}

let currentAppTranslation, fallbackTranslation;

function setDefaultLanguage() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    let appLang = urlParams.get("lang") || window.navigator.language.toLowerCase() || localStorage.getItem(constants.APP_LANG);
    appLang = transformToISOStandardLangCode(appLang);
    appLang = langSubtypesMap[appLang.toLowerCase()] || appLang;
    appLang = Object.keys(supportedLanguageCodesMap).includes(appLang) ? appLang : "en";
    localStorage.setItem(constants.APP_LANG, appLang);
    document.querySelector("body").setAttribute("app-lang", appLang);
    document.documentElement.lang = appLang;
    setTextDirectionForLanguage(appLang);
}

export async function translate() {
    setDefaultLanguage();
    let matches = document.querySelectorAll("[translate]");
    currentAppTranslation = await fetchTranslation(localStorage.getItem(constants.APP_LANG));
    if(!fallbackTranslation)
        fallbackTranslation = await fetchTranslation("en");
    matches.forEach((item) => {
        item.innerHTML = currentAppTranslation[item.getAttribute('translate')] || fallbackTranslation[item.getAttribute('translate')];
    });
}

export function getTranslation(key, ...args) {
    setDefaultLanguage();
    if (!currentAppTranslation) {
        fetchTranslation(localStorage.getItem(constants.APP_LANG)).then(result => {
            currentAppTranslation = result;
            return parseResult(currentAppTranslation[key], key, args);
        });
    } else {
        return parseResult(currentAppTranslation[key], key, args);
    }
}

function parseResult(result, key, ...args) {
    if(!result || result === undefined) 
       return parseResult(fallbackTranslation[key], key, args);

    if(!args)
        return result;
    return stringFormat(result, args);
    
};

export function stringFormat(text, ...args) {
    return (text || "").replace(/{(\d+)}/g, function(match, number) {
        return typeof args[number] !== 'undefined'
            ? args[number]
            : match;
    });
};
