import {
    goToErrorPage, goToPage, isExpired, setTextDirectionForLanguage, enableConsolePersistence, escapeHTML, escapeHTMLAttribute
} from "../../../utils.js"
import constants from "../../../constants.js";
import LeafletService from "../services/LeafletService.js";
import environment from "../../../environment.js";
import {focusModalHeader, renderLeaflet, showExpired, renderProductInformation, showIncorrectDate} from "../utils/leafletUtils.js"
import {translate, getTranslation} from "../translationUtils.js";
import {getCountry} from "../countriesUtils.js";

const DocumentsTypes = {
    LEAFLET: "leaflet",
    INFO: "info",
    PRESCRIBING_INFO: "prescribingInfo"
};

const parseEpiMarketValue = (epiMarket) => {
    return epiMarket === "default" ? "" : epiMarket;
}

enableConsolePersistence();

window.onload = async (event) => {
    await translate();
    setTimeout(() => {
        localStorage.removeItem(constants.LIST_OF_EXCIPIENTS);
        document.querySelectorAll(".modal-header .close-modal").forEach(elem => {
            elem.style.position = "absolute";
        })
    }, 0);
}

const sanitationRegex = /(<iframe>([\s\S]*)<\/iframe>)|(<script>([\s\S]*)<\/script>)/g;

function LeafletController() {

    this.loader = document.querySelector(".loader-container");
    this.documents;
    this.activeModal;
    this.defaultLanguage;
    this.selectedLanguage;
    this.selectedDocument;
    this.selectedEpiMarket;
    this.lastModal;
    this.lastResponse;

    function generateFileName(){
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        let gtin = urlParams.get("gtin");
        let batch = urlParams.get("batch");
        let lang = localStorage.getItem(constants.APP_LANG) || "en"
        return `leaflet_${gtin.toLowerCase()}${batch ? `_${batch.toUpperCase()}`: ""}_${lang}`;
    }

    this.getLangLeaflet = (lang) => {
        this.showLoader(true);
        getLeaflet(lang);
        setTextDirectionForLanguage(lang, "#leaflet-content");
        setTextDirectionForLanguage(lang, ".modal-body .page-header");
        document.querySelector("#leaflet-lang-select").classList.add("hiddenElement");
    }

    this.getMarketLeaflet = (lang) => {
        this.showLoader(true);
        const currentUrl = new URL(window.location.href);
        window.history.replaceState(null, "", currentUrl.toString());
        getLeaflet(lang);
        document.querySelector("#epi-markets-modal").classList.add("hiddenElement");
    }

    this.getActiveModal = function() {
        if(!this.activeModal)
            this.activeModal = document.querySelector(".page-container:not(.hiddenElement), .popup-modal:not(.hiddenElement)");
        return this.activeModal;
    };

    this.showModal = function (modalId)  {
        const body = document.body;
        const activeModal = this.getActiveModal();
        const modal = document.querySelector(`#${modalId}`);
        this.showLoader(false);
        if(activeModal)
            activeModal.classList.add("hiddenElement");
        setTimeout(() => {
            modal.classList.remove("hiddenElement");
        }, 0);
        return this.activeModal = modal;
    };

    this.showLoader = function (show) {
        this.loader.hidden = !show;
    };

    this.printContent = function(evt){
        // get active modal
        const modal = this.getActiveModal();
        this.closeModal(evt)
        this.showPrintVersion(modal.id);
    }

    const getLeaflet = (lang) => {

        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        let gtin = urlParams.get("gtin");
        let batch = urlParams.get("batch");
        let expiry = urlParams.get("expiry");
        let epiMarket = urlParams.get("epiMarket");
        let lsEpiDomain = environment.enableEpiDomain ? localStorage.getItem(constants.EPI_DOMAIN) : environment.epiDomain;
        lsEpiDomain = lsEpiDomain || environment.epiDomain;
        let timePerCall = environment.timePerCall || 10000;
        let totalWaitTime = environment.totalWaitTime || 60000;
        let gto_TimePerCall = environment.gto_TimePerCall || 3000;
        let gto_TotalWaitTime = environment.gto_TotalWaitTime || 15000;

        let leafletService = new LeafletService(gtin, batch, expiry, lang || this.defaultLanguage, lsEpiDomain, parseEpiMarketValue(this.selectedEpiMarket));

        this.showLoader(true);

        if (this.selectedDocument && this.selectedDocument !== DocumentsTypes.INFO)
            leafletService.leafletType = this.selectedDocument;

        leafletService.getLeafletUsingCache(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime).then((result) => {
            //check for injections in result
            let tmp = JSON.stringify(result);
            if (!tmp || sanitationRegex.test(tmp)) {
                goToErrorPage(constants.errorCodes.unsupported_response, new Error("Response unsupported format or contains forbidden content"));
                return;
            }

            this.lastResponse = Object.assign(this.lastResponse || {}, result);
            result = this.lastResponse;

            // first await user select document type
            if(!this.documents) {
                this.documents = showAvailableDocuments(result);
                return;
            }

            if (Object.keys(result?.availableEpiMarkets || {}).length > 0 && !this.selectedEpiMarket) {
                const language = this.selectedLanguage || this.defaultLanguage;
                // let languages = [];

                let availableEpiMarkets = Object.keys(result?.availableEpiMarkets);
                if (result?.availableLanguages?.length > 0) {
                    availableEpiMarkets = ["", ...availableEpiMarkets]
                }

                if (availableEpiMarkets.length === 1) {
                    return this.setSelectEpiMarket(availableEpiMarkets[0]);
                }
                // this.lastResponse = Object.assign(this.lastResponse, { parsedMarkets });
                return showAvailableMarkets(language, availableEpiMarkets);
            }


            if(result.resultStatus === "xml_found" || result.resultStatus.trim() === "has_no_leaflet") {
                try {
                    showDocumentModal(result, result.resultStatus === "xml_found");
                    if (isExpired(expiry) && this.selectedDocument === DocumentsTypes.LEAFLET)
                        showExpired();
                    /* removed for  MVP1
                    if (!getExpiryTime(expiry)) {
                      showIncorrectDate();
                    }*/
                } catch (e) {
                    console.error(e);
                    goToErrorPage(e.errorCode, e)
                }
            }

            if(result.resultStatus === "no_xml_for_lang")
                return !this.selectedLanguage ? showAvailableLanguages(result) : showDocumentModal(result, false);

            return showRecalledMessage(result);


        }).catch(err => {
            console.error(err);
            goToErrorPage(err.errorCode, err)
        })
    };

    this.scanAgainHandler = function () {
        goToPage("/scan.html")
    }

    this.goHome = function () {
        goToPage("/main.html")
    }

    this.closeModal = function (evt) {
        const modalId = (typeof evt === "string") ? evt : evt.currentTarget.getAttribute("modal-id")
        if (['leaflet-lang-select', 'documents-modal', 'epi-markets-modal'].includes(modalId))
            return goToPage("/main.html");
        document.querySelector("#" + modalId).classList.add("hiddenElement");

        // document.getElementById("settings-modal").classList.remove("hiddenElement");
    }

    const showAvailableMarkets = (lang, availableMarkets) => {
        const modal = document.querySelector('#epi-markets-modal');
        const container = modal.querySelector("#content-container");
        container.innerHTML = "";
        let selectedItem = null;
        const radionParent = document.createElement('div');
        availableMarkets.forEach((item, index) => {
            const radioInput = document.createElement('input');
            radioInput.setAttribute("type", "radio");
            radioInput.setAttribute("name", "epi-market");
            radioInput.setAttribute("value", escapeHTMLAttribute(item));
            radioInput.setAttribute("id", escapeHTMLAttribute(item));
            radioInput.defaultChecked = index === 0;

            // Create the div element for the label
            const label = item.length ? getCountry(item, true) : getTranslation("epi_markets_modal_no_market");

            const labelDiv = document.createElement('div');
            labelDiv.classList.add("radio-label");
            labelDiv.setAttribute("radio-label", escapeHTMLAttribute(label));
            labelDiv.textContent = label;

            const radioFragment = document.createElement('label');
            radioFragment.classList.add("radio-item-container");
            radioFragment.setAttribute("role", "radio");
            radioFragment.setAttribute("tabindex", "0");
            radioFragment.setAttribute("aria-checked", new Boolean(index === 0).toString());
            radioFragment.setAttribute("aria-label", escapeHTMLAttribute(label));

            // Append the radioInput and label elements to the container
            radioFragment.appendChild(radioInput);
            radioFragment.appendChild(labelDiv);

            if (index === 0)
                selectedItem = index;

            radioFragment.querySelector("input").addEventListener("change", (event) => {
                if (selectedItem)
                    selectedItem.setAttribute("aria-checked", "false");
                radioFragment.setAttribute("aria-checked", "true");
                selectedItem = radioFragment;
            })

            radioFragment.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ")
                    radioFragment.querySelector("input").checked = true;
            })

            radionParent.appendChild(radioFragment);
        })
        container.appendChild(radionParent);
        this.showModal('epi-markets-modal');
        modal.querySelector('#epi-market-go-back-button').addEventListener('click', () => {
            window.location.href = decodeURIComponent(window.location.href);
        });

        modal.querySelector('#epi-market-proceed-button').addEventListener('click', () => {
            const value = modal.querySelector("input[name='epi-market']:checked")?.value;
            this.setSelectEpiMarket(value);
        });

        return availableMarkets;
    };

    this.setSelectEpiMarket = function (selectedMarket = null) {
        this.selectedEpiMarket = selectedMarket;
        const availableLanguages = this.lastResponse.availableEpiMarkets?.[this.selectedEpiMarket];
        if(!availableLanguages || !this.selectedEpiMarket) {
            this.selectedEpiMarket = "default";
            return showAvailableLanguages(this.lastResponse);
        }
        showAvailableLanguages({availableLanguages});
    }

    const showDocumentModal = (result, hasLeaflet = true) => {
        try {
            if(this.selectedDocument === DocumentsTypes.LEAFLET || this.selectedDocument === DocumentsTypes.PRESCRIBING_INFO) {
                this.showModal("settings-modal");
                return renderLeaflet(result);
            }
            this.showModal("product-modal");
            renderProductInformation(result, hasLeaflet);
        } catch (e) {
            console.error(e);
            goToErrorPage(constants.errorCodes.xml_parse_error, new Error("Unsupported format for XML file."))
        }

    };

    const showAvailableDocuments = (result) => {

        let hasLeaflet = result.availableTypes?.length || result?.resultStatus === 'xml_found' || false;

        if(result?.availableTypes?.length && !result?.availableTypes?.includes(DocumentsTypes.LEAFLET))
            hasLeaflet = false;

        const hasPrescribingInfo  = result?.availableTypes?.includes(DocumentsTypes.PRESCRIBING_INFO);
        let documents = [
            {text: 'document_product_info', value: DocumentsTypes.INFO},
            {text: 'document_patient_info', value: DocumentsTypes.LEAFLET},
            {text: 'document_prescribing_info', value: DocumentsTypes.PRESCRIBING_INFO},
        ];

        if(!hasLeaflet)
            documents = documents.filter(doc => doc.value !== DocumentsTypes.LEAFLET);

        if(!hasPrescribingInfo)
            documents = documents.filter(doc => doc.value !== DocumentsTypes.PRESCRIBING_INFO);

        const {markets} = result?.productData;

        if(!markets || markets.length < 1 || !markets.some(market => constants.MARKETS_WITH_PRODUCT_INFORMATION.includes(market.marketId)))
            documents = documents.filter(doc => doc.value !== DocumentsTypes.INFO);

        if(!documents?.length)
            return goToErrorPage(constants.errorCodes.no_uploaded_epi, new Error(`Has not documents for product`));

        if(documents.length === 1)
            return this.setSelectedDocument(documents[0].value);

        const modal = document.querySelector('#documents-modal');
        const container = modal.querySelector("#content-container");
        container.innerHTML = "";
        let selectedItem = null;
        const radionParent = document.createElement('div');
        documents.forEach((item, index) => {
            const radioInput = document.createElement('input');
            radioInput.setAttribute("type", "radio");
            radioInput.setAttribute("name", "documents");
            radioInput.setAttribute("value", escapeHTMLAttribute(item.value));
            radioInput.setAttribute("id", escapeHTMLAttribute(item.value));
            radioInput.defaultChecked = index === 0;

            // Create the div element for the label
            const label =  getTranslation(item.text);

            const labelDiv = document.createElement('div');
            labelDiv.classList.add("radio-label");
            labelDiv.setAttribute("radio-label", escapeHTMLAttribute(label));
            labelDiv.textContent = label;

            const radioFragment = document.createElement('label');
            radioFragment.classList.add("radio-item-container");
            radioFragment.setAttribute("role", "radio");
            radioFragment.setAttribute("tabindex", "0");
            radioFragment.setAttribute("aria-checked", new Boolean(index === 0).toString());
            radioFragment.setAttribute("aria-label", escapeHTMLAttribute(label));

            // Append the radioInput and label elements to the container
            radioFragment.appendChild(radioInput);
            radioFragment.appendChild(labelDiv);

            if (index === 0)
                selectedItem = radioFragment;

            radioFragment.querySelector("input").addEventListener("change", (event) => {
                if (selectedItem)
                    selectedItem.setAttribute("aria-checked", "false");
                radioFragment.setAttribute("aria-checked", "true");
                selectedItem = radioFragment;
            })

            radioFragment.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ")
                    radioFragment.querySelector("input").checked = true;
            })

            radionParent.appendChild(radioFragment);
        })
        container.appendChild(radionParent);
        this.showModal('documents-modal');
        document.querySelector('#button-exit').addEventListener('click', () => {
            window.location.href = decodeURIComponent(window.location.href);
            // goToPage(decodeURIComponent(window.location.href));
            // this.documents = undefined;
            // this.selectedLanguage = undefined;
            // this.leafletLang = undefined;
            // getLeaflet(this.defaultLanguage);
        });
        return documents;
    };

    this.setSelectedDocument = async function (selectedDocument = null) {

        this.selectedDocument = selectedDocument ?
            selectedDocument : document.querySelector("input[name='documents']:checked")?.value;

        const browserLanguage = this.getLanguageFromBrowser();
        if(this.selectedDocument === DocumentsTypes.INFO) {
            this.selectedLanguage = this.defaultLanguage = browserLanguage;

            if(!this.selectedLanguage.includes('en')) {
                // force show product information in english
                return showAvailableLanguages({availableLanguages: [{
                        "label": "English",
                        "value": "en",
                        "nativeName": "English"
                    }]})
            }
        }

        getLeaflet(this.defaultLanguage);

    };

    this.getLanguageFromBrowser = function(){
        let browserLang = navigator.language.toLowerCase().replace("_", "-");
        switch (browserLang) {
            case "en-us":
                browserLang = "en";
                break;

        }
        return browserLang;
    }

    const showLeafletForLang = (lang) => {
        this.defaultLanguage = lang;
        this.leafletLang = lang;
        this.selectedLanguage = lang;
        this.getLangLeaflet(lang)
    }

    /**
     *
     * @param {{resultStatus: string, xmlContent: string, leafletImages: {}, productData: {}, availableLanguages: {label: string, value: string, nativeName: string}[]}} result
     */
    const showAvailableLanguages = (result) => {

        this.showLoader(false);
        const browserLang = this.getLanguageFromBrowser()
        if (result.availableLanguages.length >= 1) {
            if (result.availableLanguages.map(r => r.value.toLowerCase()).includes(browserLang)) {
                return showLeafletForLang(browserLang)
            }

            const modal = this.showModal('leaflet-lang-select');
            if(this.selectedDocument === DocumentsTypes.INFO) {
                modal.querySelector('#language-message').textContent = getTranslation("document_lang_select_message")
                modal.querySelector('#lang-title').textContent = getTranslation("document_lang_select_title");
            }

            modal.querySelector("#proceed-button").addEventListener("click", () => {
                let lang = document.querySelector("input[name='languages']:checked").value;
                showLeafletForLang(lang)
            })

            // modal.querySelector("#go-back-button").addEventListener("click", () => {
            //     this.showModal('documents-modal');
            // });

            modal.querySelector(".proceed-button.no-leaflet").classList.add("hiddenElement");
            //  document.querySelector(".text-section.no-leaflet").setAttribute('style', 'display:none');
            let languagesContainer = document.querySelector(".languages-container");
            /*
              site for flags https://flagpedia.net/download
            */
            let selectedItem = null;
            result.availableLanguages.forEach((lang, index) => {

                // Create the radio input element
                let radioInput = document.createElement('input');
                radioInput.setAttribute("type", "radio");
                radioInput.setAttribute("name", "languages");
                radioInput.setAttribute("value", escapeHTMLAttribute(lang.value));
                radioInput.setAttribute("id", escapeHTMLAttribute(lang.value));
                radioInput.defaultChecked = index === 0;

                // Create the div element for the label
                let labelDiv = document.createElement('div');
                labelDiv.classList.add("radio-label");
                labelDiv.setAttribute("radio-label", escapeHTMLAttribute(lang.label));
                labelDiv.textContent = escapeHTML(`${lang.label} - (${lang.nativeName})`);

                let radioFragment = document.createElement('label');
                radioFragment.classList.add("radio-item-container");
                radioFragment.setAttribute("role", "radio");
                radioFragment.setAttribute("tabindex", "0");
                radioFragment.setAttribute("aria-checked", new Boolean(index === 0).toString());
                radioFragment.setAttribute("aria-label", escapeHTMLAttribute(lang.label) + " language");

                // Append the radioInput and label elements to the container
                radioFragment.appendChild(radioInput);
                radioFragment.appendChild(labelDiv);

                if (index === 0) {
                    selectedItem = radioFragment;
                }

                radioFragment.querySelector("input").addEventListener("change", (event) => {
                    if (selectedItem) {
                        selectedItem.setAttribute("aria-checked", "false");
                    }
                    radioFragment.setAttribute("aria-checked", "true");
                    selectedItem = radioFragment;
                })

                radioFragment.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        radioFragment.querySelector("input").checked = true;
                    }
                })

                languagesContainer.appendChild(radioFragment);
            });

            focusModalHeader();
        } else {
            goToErrorPage(constants.errorCodes.no_uploaded_epi, new Error(`Product found but no associated leaflet`));
            /*      document.querySelector(".proceed-button.has-leaflets").setAttribute('style', 'display:none');
                  document.querySelector(".text-section.has-leaflets").setAttribute('style', 'display:none');*/
        }
    };

    let showRecalledMessage = function (result) {
        const {productData} = result;
        const {productRecall, batchData} = productData;
        const recalled = productRecall || batchData?.batchRecall;
        const recalledContainer = document.querySelector("#recalled-modal");
        const modalLeaflet = document.getElementById("settings-modal");
        const recalledBar = document.querySelector('#recalled-bar');
        modalLeaflet.classList.remove('recalled');
        if (recalled) {
            const batchRecalled = batchData?.batchRecall;
            const recalledMessageContainer = document.querySelector(".recalled-message-container");

            modalLeaflet.classList.add('recalled');
            recalledBar.classList.add('visible');
            recalledContainer.classList.remove("hiddenElement");

            if (batchRecalled) {
                recalledContainer.querySelector("#recalled-title").textContent = getTranslation('recalled_batch_title');
                recalledMessageContainer.innerHTML = getTranslation("recalled_batch_message",  `<strong>${batchData?.batch || batchData.batchNumber}</strong><br />`);
                // recallInformation.innerHTML += getTranslation('recalled_batch_name',  `<strong>${batchData?.batch || batchData.batchNumber}</strong><br />`);
                recalledBar.querySelector('#recalled-bar-content').textContent =  getTranslation('leaflet_recalled_batch');
                recalledMessageContainer.innerHTML += "<br /><br />"+getTranslation('recalled_product_name', `<strong>${result.productData.nameMedicinalProduct}</strong>`);
            } else {
                recalledMessageContainer.innerHTML += getTranslation('recalled_product_message',  `<strong>${result.productData.nameMedicinalProduct}</strong>`);
            }

            // recalledMessageContainer.appendChild(recallInformation);

            recalledContainer.querySelector(".close-modal").onclick = function() {
                recalledContainer.classList.add("hiddenElement");
                modalLeaflet.classList.remove('recalled');
            };
            recalledContainer.querySelector("#recalled-modal-procced").onclick = function() {
                recalledContainer.classList.add("hiddenElement");
                modalLeaflet.classList.remove('recalled');
            };
            recalledContainer.querySelector("#recalled-modal-exit").onclick = function() {
                goToPage("/main.html")
            };
        }

    }

    this.showPrintModal = () => {
        this.showLoader(false)
        const modal = document.querySelector("#print-modal")
        modal.classList.remove("hiddenElement");
        document.querySelector(".proceed-button.no-leaflet").classList.add("hiddenElement");
    }

    this.showPrintVersion = (modal = 'settings-modal') => {
        const windowName = window.document.title;
        const content =  document.querySelector(`#${modal} .content-to-print`);
        const printContent =  document.querySelector('#print-content');
        window.onbeforeprint = (evt) => {
            evt.target.document.title = generateFileName();
            // removing html attributes to make table not responsive
            content.querySelectorAll('[style], [nowrap]').forEach(element => {
                element.removeAttribute('style');
                element.removeAttribute('nowrap');
                element.removeAttribute('xmlns');

            });
            printContent.innerHTML = content.innerHTML;
        }
        window.print();
        window.onafterprint = (evt) => {
            evt.target.document.title = windowName;
            printContent.innerHTML = "";
        }
    };

    const addEventListeners = () => {
        document.getElementById("scan-again-button").addEventListener("click", this.scanAgainHandler);
        document.getElementById("modal-print-button").addEventListener("click", this.printContent.bind(this));
        document.querySelectorAll("#print-modal-button").forEach(button => button.addEventListener("click", this.showPrintModal));
        document.getElementById("modal-scan-again-button").addEventListener("click", this.scanAgainHandler);
        document.querySelectorAll("#go-back-button").forEach(button =>  button.addEventListener("click", this.goHome));
        document.getElementById("modal-print-go-back-button").addEventListener("click", this.closeModal);
        document.querySelectorAll(".modal-container.popup-modal .close-modal").forEach(item => {
            item.addEventListener("click", this.closeModal);
        });
        document.querySelector("#documents-modal #proceed-button").addEventListener("click", () => {
            this.setSelectedDocument();
        })

    }
    this.defaultLanguage = localStorage.getItem(constants.APP_LANG) || "en";
    addEventListeners();
    // // to remove
    // this.lastResponse = {
    //     availableEpiMarkets: {"en": ["US", "BR"], "pt-BR": ["BR"], "pt": ["PT", "ES"]},
    //     productData: [],
    //     availableTypes: ["leaflet", "prescribingInfo"]
    // };
    getLeaflet(this.defaultLanguage);

}


const leafletController = new LeafletController();


window.leafletController = leafletController;
