import {getLanguageFallback} from "../app/js/translationUtils";

const LanguagesFallback = {
    'ar': ["ar","ar-ae", "ar-bh", "ar-dz", "ar-eg", "ar-iq", "ar-jo", "ar-kw", "ar-lb", "ar-ly", "ar-ma", "ar-om", "ar-qa", "ar-sa", "ar-sy", "ar-tn", "ar-ye"],
    'bg': ["bg", "bg-bg"],
    'cs': ["cs","cs-cz"],
    'da': ["da","da-dk"],
    'de': ["de","de-de", "de-li", "de-at", "de-ch", "de-be"],
    'el': ["el","el-gr"],
    'en': ["en","en-au", "en-bz", "en-ca", "en-gb", "en-ie", "en-jm", "en-nz", "en-ph", "en-tt", "en-us", "en-za", "en-zw", "en-in", "en-sg"],
    'es': ["es","es-es"],
    'es-419': ["es-419", "es-ar", "es-bo", "es-cl", "es-co", "es-cr", "es-do", "es-ec", "es-gt", "es-mx", "es-ni", "es-pa", "es-pe", "es-pr", "es-py", "es-sv", "es-us", "es-uy", "es-ve"],
    'et': ["et","et-ee"],
    'fi': ["fi","fi-fi"],
    'fr': ["fr","fr-be", "fr-ca", "fr-fr","fr-ch"],
    'hr': ["hr","hr-ba", "hr-hr"],
    'hu': ["hu","hu-hu"],
    'it': ["it","it-ch", "it-it"],
    'ko': ["ko","ko-kr"],
    'lt': ["lt","lt-lt"],
    'lv': ["lv","lv-lv"],
    'nl': ["nl","nl-nl","nl-be"],
    'no': ["no","nb", "nb-no", "nn", "nn-no"],
    'pl': ["pl","pl-pl"],
    'pt': ["pt", "pt-pt"],
    'pt-br': ["pt-br"],
    'ro': ["ro","ro-md", "ro-ro"],
    'sk': ["sk","sk-sk"],
    'sl': ["sl","sl-si"],
    'sv': ["sv","sv-fi", "sv-se"],
    'tr': ["tr","tr-tr"],
    'uk': ["uk","uk-ua"],
    'en': ["gn"] // not supported one to fallback to english
}

describe("fallback languages", () => {
    let fallback;
    Object.entries(LanguagesFallback).forEach(([key,value]) => {
        value.forEach((value,index) => {
            test(`falls back from ${value} to ${key}`, () => {
                fallback = getLanguageFallback(value);
                expect(fallback).toBe(key);
            })
        })
    })
})
