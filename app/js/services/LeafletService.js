import environment from "../../../environment.js";
import constants from "../../../constants.js"
import CustomError from "../utils/CustomError.js";
import RequestWizard from "./RequestWizard.js";
import {ERROR_TYPES} from "./RequestWizard.js";
import LightSmartUrl from "../utils/LightSmartUrl.js";

import {goToErrorPage, sanitizeLogMessage, validateGTIN} from "../../../utils.js";

const DocumentsTypes = {
  LEAFLET: "leaflet",
  INFO: "info",
  PRESCRIBING_INFO: "prescribingInfo"
};

const buildMetadataQueryParams = function (gtin, batchNumber) {
  // Copy of fixedUrls "URL Builder" that constructs and orders parameters in a specific sequence.
  let converter = new URL("https://non.relevant.url.com");

  //let create a wrapper over append method to ensure that NO UNDEFINED variable will be added to the query
  let append = converter.searchParams.append;
  converter.searchParams.append = (name, value) => {
    if(typeof value === "undefined"){
      return;
    }
    append.call(converter.searchParams, name, value);
  }

  converter.searchParams.append("batch", batchNumber);
  converter.searchParams.append("gtin", gtin);

  converter.searchParams.sort();
  return converter.searchParams.toString();
}

const buildQueryParams = function (gtin, batchNumber, lang, leafletType, epiMarket) {
  // Copy of fixedUrls "URL Builder" that constructs and orders parameters in a specific sequence.
  let converter = new URL("https://non.relevant.url.com");

  //let create a wrapper over append method to ensure that NO UNDEFINED variable will be added to the query
  let append = converter.searchParams.append;
  converter.searchParams.append = (name, value)=>{
    if(typeof value === "undefined"){
      return;
    }
    append.call(converter.searchParams, name, value);
  }

  if((!epiMarket && leafletType === DocumentsTypes.LEAFLET && batchNumber !== "undefined"))
    converter.searchParams.append("batch", batchNumber);
  converter.searchParams.append("lang", lang);
  converter.searchParams.append("gtin", gtin);
  converter.searchParams.append("leaflet_type", leafletType);
  if(!!epiMarket)
    converter.searchParams.append("epiMarket",  epiMarket);
  converter.searchParams.sort();
  return converter.searchParams.toString();
}

const validateGtinOwnerResponse = function (response) {
  return new Promise((resolve) => {
    if (response.status === 200) {
      //we got info in Cache
      resolve(true);
      return;
    }
    if (response.status === 404) {
      goToErrorPage(constants.errorCodes.gtin_not_created, new Error(`Could not detect the owner of GTIN`));
      return;
    }
    resolve(false);
  });
}

const validateMtimeResponse = function (response) {
  return new Promise((resolve) => {
    resolve(true);
  });
}

const validateLeafletResponse = (response) => {
  return new Promise((resolve) => {
    if (response.status >= 500) {
      return resolve(false);
    }
    if (response.status === 404) {
      goToErrorPage(constants.errorCodes.no_uploaded_epi, new Error(`Product found but no associated leaflet`));
      return;
    }
    resolve(true);
  });
}

const prepareUrlsForMtimeCall = function (arrayOfUrls) {
  let newArray = [];
  for (let i = 0; i < arrayOfUrls.length; i++) {
    let smartUrl = new LightSmartUrl(arrayOfUrls[i]);
    smartUrl = smartUrl.concatWith("/mtime");
    newArray.push(this.getLeafletRequest(smartUrl));
  }
  return newArray;
}


class LeafletService {
  constructor(gtin, batch, expiry, leafletLang, epiDomain, epiMarket) {

    this.gtin = gtin;
    this.batch = batch;
    this.expiry = expiry;
    this.leafletLang = leafletLang;
    this.epiDomain = epiDomain;
    this.epiMarket = epiMarket;
    this.leafletType = "leaflet";
    this.metadata = undefined;

    this.bdnsCache = undefined;
    this.gtinOwnerCache = new Map();

    let gtinValidationResult = validateGTIN(this.gtin);
    if (!gtinValidationResult.isValid) {
      goToErrorPage(gtinValidationResult.errorCode, new Error(gtinValidationResult.message));
    }
  }

  async getBDNS(skipCache) {
    if (this.bdnsCache && !skipCache)
      return this.bdnsCache;

    return await new Promise((resolve, reject) => {
      fetch(environment.bdnsUrl)
        .then(respond => {
          respond.json().then((result) => {
            this.bdnsCache = Object.freeze(result);
            resolve(result)
          }).catch(e => {
            console.log(sanitizeLogMessage(e));
            reject(e);
          })
        }).catch(err => {
        reject(err)
      })
    })
  }

  getAnchoringServices(bdnsResult, domain) {
    try {
      if (!bdnsResult[domain] || !bdnsResult[domain]["anchoringServices"] || !Array.isArray(bdnsResult[domain]["anchoringServices"])) {
        throw new Error("There is no valid associated BDNS configuration for " + domain)
      }
      return bdnsResult[domain]["anchoringServices"]
    } catch (e) {
      throw e
    }
  }

  prepareUrlsForGtinOwnerCall(arrayOfUrls, domain, gtin, asRequests = true) {
    let newArray = [];
    for (let i = 0; i < arrayOfUrls.length; i++) {
      let smartUrl = new LightSmartUrl(arrayOfUrls[i]);
      smartUrl = smartUrl.concatWith(`/gtinOwner/${domain}/${gtin}`);
      if (asRequests) {
        newArray.push(smartUrl.getRequest({
          method: "GET"
        }));
      } else {
        newArray.push(smartUrl);
      }
    }
    return newArray;
  }

  async detectGTINOwner(GTIN, bdnsResult, timePerCall, totalWaitTime) {
    if (this.gtinOwnerCache.has(`${GTIN}`))
      return this.gtinOwnerCache.get(`${GTIN}`);

    let anchoringServices = this.getAnchoringServices(bdnsResult, this.epiDomain);
    let validateResponse = function (response) {
      return new Promise((resolve) => {
        if (response.status === 200) {
          //we can consider a valid response only when 200 status code
          resolve(true);
          return;
        }
        if (response.status === 404) {
          goToErrorPage(constants.errorCodes.gtin_not_created, new Error(`Could not detect the owner of GTIN: ${GTIN}`));
          return;
        }
        resolve(false);
      });
    }

    return new Promise(async (resolve, reject) => {
      let requestWizard = new RequestWizard(timePerCall, totalWaitTime);
      try {
        let gtinOwnerResponse = await requestWizard.fetchMeAResponse(this.prepareUrlsForGtinOwnerCall(anchoringServices, this.epiDomain, GTIN), validateResponse);
        if (gtinOwnerResponse) {
          gtinOwnerResponse.json().then(result => {
            const gtinOwnerDomain = result.domain;
            this.gtinOwnerCache.set(`${GTIN}`, gtinOwnerDomain);
            resolve(gtinOwnerDomain);
          }).catch((err) => {
              console.log(sanitizeLogMessage(err));
              reject(new CustomError(constants.errorCodes.unknown_error));
              return;
          });
          return;
        }
        reject(new CustomError(constants.errorCodes.gtin_not_created));
        return;
      } catch (err) {
        if (err.code && err.code === ERROR_TYPES.TIMEOUT) {
          reject(new CustomError(constants.errorCodes.gto_timeout));
          return;
        }
        if (err.code && err.code === ERROR_TYPES.MISCONFIGURATION) {
          reject(new CustomError(constants.errorCodes.misconfiguration));
          return;
        }
        reject(err);
      }
    });
  }

  getLeafletRequest(leafletApiUrl, subDomain) {
    let smartUrl = new LightSmartUrl(leafletApiUrl);
    let urlPart = `/leaflets/${this.epiDomain}`;
    if(subDomain){
      urlPart += `/${subDomain}`;
    }

    let isBatchLevel = true;
    let batch = this.batch;

    // Check batch level
    if(this.metadata 
      && this.metadata.availableDocuments 
      && this.metadata.availableDocuments[this.leafletType] 
      && this.metadata.availableDocuments[this.leafletType][this.epiMarket ? this.epiMarket : "unspecified"]) {

        const docs = this.metadata.availableDocuments[this.leafletType][this.epiMarket? this.epiMarket : "unspecified"];
        const doc = docs.find((d) => {
          return d.value === this.leafletLang;
        })

        if(doc){
          isBatchLevel = doc.batch || false;
        }

      }
    

    if(!isBatchLevel)
      batch = undefined;

    const queryParams = buildQueryParams(this.gtin, batch, this.leafletLang, this.leafletType, this.epiMarket);
    smartUrl = smartUrl.concatWith(`${urlPart}?${queryParams}`);

    let header = {"epiProtocolVersion": environment.epiProtocolVersion || "1"};

    return smartUrl.getRequest({
      method: "GET", headers: header
    });
  }

  getLeafletMetadataRequest(leafletApiUrl, subDomain) {
    let smartUrl = new LightSmartUrl(leafletApiUrl);
    let urlPart = `/metadata/leaflet/${this.epiDomain}`;
    if(subDomain){
      urlPart += `/${subDomain}`;
    }

    const queryParams = buildMetadataQueryParams(this.gtin, this.batch);
    smartUrl = smartUrl.concatWith(`${urlPart}?${queryParams}`);

    const header = {"epiProtocolVersion": environment.epiProtocolVersion || "1"};
    return smartUrl.getRequest({
      method: "GET", headers: header
    });
  }

  prepareUrlsForLeafletCall(arrayOfUrls, subDomain) {
    let newArray = [];
    for (let i = 0; i < arrayOfUrls.length; i++) {
      newArray.push(this.getLeafletRequest(arrayOfUrls[i], subDomain));
    }
    return newArray;
  }

  /**
   * Retrieves leaflet metadata with configurable timeouts.
   *
   * @param {number} timePerCall - Time per API call (ms).
   * @param {number} totalWaitTime - Max total wait time (ms).
   * @param {number} gto_TimePerCall - Time per GTO API call (ms).
   * @param {number} gto_TotalWaitTime - Max total wait time for GTO (ms).
   * @param {boolean} legacyMode - Made the request using v3.0 endpoints
   *
   * @returns {Promise<{
   *   productData: {
   *     productCode: string,
   *     epiProtocol: string,
   *     lockId: string,
   *     internalMaterialCode: string,
   *     inventedName: string,
   *     nameMedicinalProduct: string,
   *     productRecall: boolean,
   *     strengths: string[],
   *     markets: string[],
   *     description: string,
   *     name: string,
   *     productPhoto: string
   *   },
   *   availableDocuments: Record<string, Record<string, { label: string, value: string, nativeName: string }[]>>
   * }>} Resolves to an object containing product metadata and available documents.
   */
  async getLeafletMetadata(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime, legacyMode = false) {
    const self = this;
    const method = legacyMode ? this.getLeafletRequest : this.getLeafletMetadataRequest;

    const legacyParser = (type, status, languagesAvailableArr, marketsAvailableArr) => {
        const result = { [type]: {} };
        if(status === "xml_found" && !languagesAvailableArr?.length)
            languagesAvailableArr = [{"value": navigator.language}]
        if (languagesAvailableArr.length > 0)
          result[type].unspecified = languagesAvailableArr;

        // for (const key in marketsAvailableArr) {
        //   if (marketsAvailableArr[key].length > 0) {
        //     result[type][key] = marketsAvailableArr[key];
        //   }
        // }

        if (Object.keys(result[type]).length === 0)
          delete result[type];

        return result;
    }

    const prepareUrlsForLeafletCall = (arrayOfUrls, subDomain) => {
      let newArray = [];
      for (let i = 0; i < arrayOfUrls.length; i++) {
        newArray.push(method.call(self, arrayOfUrls[i], subDomain));
      }
      return newArray;
    }

    return new Promise(async (resolve, reject) => {
      let leafletResult = null;
      let globalTimer = setTimeout(() => {
        if (!leafletResult) {
          reject({errorCode: constants.errorCodes.leaflet_timeout});
          return
        }
      }, totalWaitTime);

      let bdns = await this.getBDNS();
      let ownerDomain;
      try {
        ownerDomain = await this.detectGTINOwner(this.gtin, bdns, gto_TimePerCall, gto_TotalWaitTime);
      } catch (e) {
        console.error(e);
        let errorCode = e.code ? e.code : constants.errorCodes.gtin_not_created;
        reject({errorCode});
        return;
      }
      if (ownerDomain) {
        let leafletSources = this.getAnchoringServices(bdns, ownerDomain);
        let targets = prepareUrlsForLeafletCall(leafletSources);

        let validateResponse = (response) => {
          return new Promise((resolve) => {
            if (response.status >= 500) {
              return resolve(false);
            }
            if (response.status === 404) {
              //goToErrorPage(constants.errorCodes.no_uploaded_epi, new Error(`Product found but no associated leaflet for GTIN : ${this.gtin}`));
              return resolve(true);
            }
            resolve(true);
          });
        }

        let requestWizard = new RequestWizard(timePerCall, totalWaitTime);
        try {
          let leafletResponse;
          try {
            leafletResponse = await requestWizard.fetchMeAResponse(targets, validateResponse);
          } catch (error) {
            if (!legacyMode) {
              console.warn("Metadata not found. Retrying with legacy mode...");
              return this.getLeafletMetadata(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime, true).then(resolve).catch(reject);
            }
          }
          
          if (!leafletResponse) {
            return reject({errorCode: constants.errorCodes.unknown_error});
          }

          switch (leafletResponse.status) {
            case 400:
              leafletResponse.text().then(errorJSON => {
                try {
                  errorJSON = JSON.parse(errorJSON);
                } catch (err) {
                  errorJSON = {code: constants.errorCodes.unknown_error};
                }
                return reject({errorCode: errorJSON.code});
              }).catch(err => {
                reject({errorCode: constants.errorCodes.unknown_error});
              });
            case 404:
              if (!legacyMode) {
                console.warn("Metadata not found. Retrying with legacy mode...");
                return this.getLeafletMetadata(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime, true).then(resolve).catch(reject);
              }
              return reject({errorCode: constants.errorCodes.no_uploaded_epi});
            case 529:
              return reject({errorCode: constants.errorCodes.get_dsu_timeout});
            case 304:
            case 200:
              if (globalTimer) {
                clearTimeout(globalTimer);
              }
              leafletResponse.json().then(leaflet => {
                if (legacyMode) {
                  console.warn("Received response for legacy mode. Parsing the result...");
                  const parse = leaflet?.resultStatus === "xml_found" ? leaflet?.resultStatus : legacyParser("leaflet", leaflet?.resultStatus, leaflet?.availableLanguages, leaflet?.availableEpiMarkets);
                  return resolve (Object.assign(leaflet, {availableDocuments: parse}))
                //   return resolve ({
                //     productData: leaflet?.productData,
                //     availableDocuments: parse
                //   })
                }
                resolve(leaflet);
              }).catch(err => {
                reject({errorCode: constants.errorCodes.unknown_error});
              });
              return;
            default:
              reject({errorCode: constants.errorCodes.unknown_error});
          }
        } catch (err) {
          if (err.code && err.code === ERROR_TYPES.MISCONFIGURATION) {
            reject({errorCode: constants.errorCodes.misconfiguration});
            return;
          }
          if (err.code && err.code === ERROR_TYPES.TIMEOUT) {
            reject({errorCode: constants.errorCodes.leaflet_timeout});
            return;
          }
          if (!err.errorCode) {
            err.errorCode = constants.errorCodes.unknown_error;
          }
          reject(err);
        }

        return;
      }

      reject({errorCode: constants.errorCodes.unknown_error});
    })
  }

  async getLeafletResult(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime) {
    return new Promise(async (resolve, reject) => {
      let leafletResult = null;
      let globalTimer = setTimeout(() => {
        if (!leafletResult) {
          reject({errorCode: constants.errorCodes.leaflet_timeout});
          return
        }
      }, totalWaitTime);

      let bdns = await this.getBDNS();
      let ownerDomain;
      try {
        ownerDomain = await this.detectGTINOwner(this.gtin, bdns, gto_TimePerCall, gto_TotalWaitTime);
      } catch (e) {
        console.error(e);
        let errorCode = e.code ? e.code : constants.errorCodes.gtin_not_created;
        reject({errorCode});
        return;
      }
      if (ownerDomain) {
        let leafletSources = this.getAnchoringServices(bdns, ownerDomain);
        let targets = this.prepareUrlsForLeafletCall(leafletSources);

        let validateResponse = (response) => {
          return new Promise((resolve) => {
            if (response.status >= 500) {
              return resolve(false);
            }
            if (response.status === 404) {
              goToErrorPage(constants.errorCodes.no_uploaded_epi, new Error(`Product found but no associated leaflet for GTIN : ${this.gtin}`));
              return;
            }
            resolve(true);
          });
        }

        let requestWizard = new RequestWizard(timePerCall, totalWaitTime);
        try {
          let leafletResponse = await requestWizard.fetchMeAResponse(targets, validateResponse);
          if (!leafletResponse) {
            return reject({errorCode: constants.errorCodes.unknown_error});
          }

          switch (leafletResponse.status) {
            case 400:
              leafletResponse.text().then(errorJSON => {
                try {
                  errorJSON = JSON.parse(errorJSON);
                } catch (err) {
                  errorJSON = {code: constants.errorCodes.unknown_error};
                }
                return reject({errorCode: errorJSON.code});
              }).catch(err => {
                reject({errorCode: constants.errorCodes.unknown_error});
              });
            case 404:
              return reject({errorCode: constants.errorCodes.no_uploaded_epi});
            case 529:
              return reject({errorCode: constants.errorCodes.get_dsu_timeout});
            case 304:
            case 200:
              if (globalTimer) {
                clearTimeout(globalTimer);
              }
              leafletResponse.json().then(leaflet => {
                resolve(leaflet);
              }).catch(err => {
                reject({errorCode: constants.errorCodes.unknown_error});
              });
              return;
            default:
              reject({errorCode: constants.errorCodes.unknown_error});
          }
        } catch (err) {
          if (err.code && err.code === ERROR_TYPES.MISCONFIGURATION) {
            reject({errorCode: constants.errorCodes.misconfiguration});
            return;
          }
          if (err.code && err.code === ERROR_TYPES.TIMEOUT) {
            reject({errorCode: constants.errorCodes.leaflet_timeout});
            return;
          }
          if (!err.errorCode) {
            err.errorCode = constants.errorCodes.unknown_error;
          }
          reject(err);
        }

        return;
      }

      reject({errorCode: constants.errorCodes.unknown_error});
    })
  }

  async getDomainInfo(domain) {
    let bdns = await this.getBDNS();
    return bdns[domain];
  }

  async getLeafletUsingCache(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime) {
    if (!environment.cacheUrl) {
      console.log("No cacheUrl property available in environment. Fallback to default impl.");
      return this.getLeafletResult(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime);
    }

    let targetEndpoints = [environment.cacheUrl];
    const TAG_IDENTIFIER = "tag=KKKK";
    let identifyGtinOwner = (epiDomain, gtin) => {
      return new Promise(async (resolve, reject) => {
        let targetSubDomains = [];
        try {
          const bdns = await this.getBDNS();
          for (let domain of Object.keys(bdns)) {
            if (domain.startsWith(epiDomain)) {
              targetSubDomains.push(domain);
            }
          }
        } catch (err) {
          console.log("Caught error during bdns reading");
          goToErrorPage(constants.errorCodes.unknown_error, new Error(`Could not read BDNS information.`));
          return;
        }

        const gtinOwnerCache = this.prepareUrlsForGtinOwnerCall(targetEndpoints, epiDomain, gtin, false);
        const cacheTargetBase = gtinOwnerCache.pop();
        for (let targetSubDomain of targetSubDomains) {
          gtinOwnerCache.push(cacheTargetBase.concatWith(`/${targetSubDomain}`).getRequest({
              method: "GET"
            }));
        }
        let requestWizard = new RequestWizard(gto_TimePerCall, gto_TotalWaitTime);
        let error;
        try {
          let cachedGtinOwnerResponse = await requestWizard.fetchMeAResponse(gtinOwnerCache, validateGtinOwnerResponse);
          if (cachedGtinOwnerResponse) {
            let result = await cachedGtinOwnerResponse.json();
            return resolve(result.domain);
          }
        } catch (err) {
          console.log("Caught error during gtinOwner request", err);
          error = err;
        }

        return reject(new CustomError(constants.errorCodes.unknown_error, undefined, error));
      });
    }

    let getMtimeForLeaflet = (domain) => {
      return new Promise(async (resolve, reject) => {
        try {
          let bdns = await this.getBDNS();
          let requestWizard = new RequestWizard(gto_TimePerCall, gto_TotalWaitTime);
          let mtimeResponse = await requestWizard.fetchMeAResponse(prepareUrlsForMtimeCall.call(this, this.getAnchoringServices(bdns, domain)), validateMtimeResponse);
          if (mtimeResponse.status === 200) {
            let mtime = await mtimeResponse.text();
            return resolve(mtime);
          }
        } catch (err) {
          console.log("Caught an error during mtime request", err);
        }
        console.log("Not able to determine mtime. Setting mtime to date.now()");
        resolve(Date.now().toString());
      });
    }

    let retrieveLeaflet = (domain, mtime) => {
      return new Promise(async (resolve, reject) => {
        let leafletCache = this.prepareUrlsForLeafletCall(targetEndpoints, domain);
        //we ensure to add the specific cache tag identifier
        //based on this tag the cache will know which apihub to target for the specific request
        for (let index in leafletCache) {
          let target = leafletCache[index].smartUrl;
          target = target.concatWith(`&${TAG_IDENTIFIER}${domain}`);
          if (mtime) {
            target = target.concatWith(`&mtime=${mtime}`);
          }
          leafletCache[index] = target.getRequest();
        }
        let requestWizard = new RequestWizard(timePerCall, totalWaitTime);
        let error;
        try {
          let cachedLeaflet = await requestWizard.fetchMeAResponse(leafletCache, validateLeafletResponse);
          if (cachedLeaflet) {
            return resolve(cachedLeaflet);
          }
        } catch (err) {
          console.log("Caught error during leaflet request", err);
          error = err;
        }

        return reject(new CustomError(constants.errorCodes.unknown_error, undefined, error));
      });
    }

    return new Promise(async (resolve, reject) => {
      let globalTimer = setTimeout(() => {
        return reject({errorCode: constants.errorCodes.leaflet_timeout});
      }, totalWaitTime);

      try {
        let gtinOwnerDomain = await identifyGtinOwner(this.epiDomain, this.gtin);
        let mtime = await getMtimeForLeaflet(gtinOwnerDomain);
        let leafletResponse = await retrieveLeaflet(gtinOwnerDomain, mtime);

        if (!leafletResponse) {
          return reject({errorCode: constants.errorCodes.unknown_error});
        }
        switch (leafletResponse.status) {
          case 400:
            leafletResponse.text().then(errorJSON => {
              try {
                errorJSON = JSON.parse(errorJSON);
              } catch (err) {
                errorJSON = {code: constants.errorCodes.unknown_error};
              }
              return reject({errorCode: errorJSON.code});
            }).catch(err => {
              reject({errorCode: constants.errorCodes.unknown_error});
            });
          case 404:
            return reject({errorCode: constants.errorCodes.no_uploaded_epi});
          case 529:
            return reject({errorCode: constants.errorCodes.get_dsu_timeout});
          case 304:
          case 200:
            if (globalTimer) {
              clearTimeout(globalTimer);
            }
            leafletResponse.json().then(leaflet => {
              resolve(leaflet);
            }).catch(err => {
              reject({errorCode: constants.errorCodes.unknown_error});
            });
            return;
          default:
            reject({errorCode: constants.errorCodes.unknown_error});
        }
      } catch (err) {
        console.log("Unable to properly retrieve leaflet due to error", err);
        reject({errorCode: constants.errorCodes.unknown_error});
      }
    });
  }
}

export default LeafletService;
