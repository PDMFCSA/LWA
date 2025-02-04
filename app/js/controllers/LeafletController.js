import {
    goToErrorPage, goToPage, isExpired, setTextDirectionForLanguage, enableConsolePersistence, escapeHTML, escapeHTMLAttribute
} from "../../../utils.js"
import constants from "../../../constants.js";
import LeafletService from "../services/LeafletService.js";
import environment from "../../../environment.js";
import {focusModalHeader, renderLeaflet, showExpired, renderProductInformation} from "../utils/leafletUtils.js"
import {translate, getTranslation} from "../translationUtils.js";
import {getCountry} from "../countriesUtils.js";

const DocumentsTypes = {
    LEAFLET: "leaflet",
    INFO: "info",
    PRESCRIBING_INFO: "prescribingInfo"
};

const parseEpiMarketValue = (epiMarket) => {
    return epiMarket === "unspecified" ? "" : epiMarket;
}

enableConsolePersistence();

window.onload = async (event) => {
    await translate();
    setTimeout(() => {
        document.querySelectorAll(".modal-header .close-modal").forEach(elem => {
            elem.style.position = "absolute";
        })
    }, 0);
}

const sanitationRegex = /(<iframe>([\s\S]*)<\/iframe>)|(<script>([\s\S]*)<\/script>)/g;

function LeafletController() {

    const urlParams = new URLSearchParams(window.location.search);
    this.gtin = urlParams.get("gtin");
    this.batch = urlParams.get("batch");
    this.expiry = urlParams.get("expiry");

    this.lsEpiDomain = (environment.enableEpiDomain ? localStorage.getItem(constants.EPI_DOMAIN) : environment.epiDomain) || environment.epiDomain;
    this.timePerCall = environment.timePerCall || 10000;
    this.totalWaitTime = environment.totalWaitTime || 60000;
    this.gto_TimePerCall = environment.gto_TimePerCall || 3000;
    this.gto_TotalWaitTime = environment.gto_TotalWaitTime || 15000;

    this.loader = document.querySelector(".loader-container");
    this.activeModal;
    this.defaultLanguage;
    this.selectedLanguage;
    this.selectedDocument;
    this.selectedEpiMarket;
    this.lastModal;
    this.metadata = undefined;

    this.defaultLanguage = localStorage.getItem(constants.APP_LANG) || "en";
    this.leafletService = new LeafletService(this.gtin, this.batch, this.expiry, this.defaultLanguage, this.lsEpiDomain);

    function generateFileName(){
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        let gtin = urlParams.get("gtin");
        let batch = urlParams.get("batch");
        let lang = localStorage.getItem(constants.APP_LANG) || "en"
        return `leaflet_${gtin.toLowerCase()}${batch ? `_${batch.toUpperCase()}`: ""}_${lang}`;
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

    const getLeafletMetadata = () => {
        this.showLoader(true);
        this.leafletService.getLeafletMetadata(this.timePerCall, this.totalWaitTime, this.gto_TimePerCall, this.gto_TotalWaitTime).then((data) => {
            //check for injections in result
            const tmp = JSON.stringify(data);
            if (!tmp || sanitationRegex.test(tmp))
                return goToErrorPage(constants.errorCodes.unsupported_response, new Error("Response unsupported format or contains forbidden content"));

            this.metadata = data;
            showAvailableDocuments(data);
        }).catch(err => {
            console.error(err);
            goToErrorPage(err.errorCode, err)
        }).finally(() =>  this.showLoader(false))
    };

    const getLeafletXML = () => {
        this.showLoader(true);
        this.leafletService.leafletLang = this.selectedLanguage;
        this.leafletService.epiMarket = parseEpiMarketValue(this.selectedEpiMarket);
        this.leafletService.leafletType = this.selectedDocument === DocumentsTypes.INFO ? DocumentsTypes.PRESCRIBING_INFO : this.selectedDocument;

        this.leafletService.getLeafletUsingCache(this.timePerCall, this.totalWaitTime, this.gto_TimePerCall, this.gto_TotalWaitTime).then((result) => {
            //check for injections in result
            const tmp = JSON.stringify(result);
            if (!tmp || sanitationRegex.test(tmp))
                return goToErrorPage(constants.errorCodes.unsupported_response, new Error("Response unsupported format or contains forbidden content"));

            try {
                showDocumentModal(result);
            } catch (e) {
                console.error(e);
                goToErrorPage(e.errorCode, e)
            } finally {
                this.showLoader(false);
            }

            showRecalledMessage(result);

        }).catch(err => {
            console.error(err);
            goToErrorPage(err.errorCode, err)
        });
    }

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

    /**
     * @param {string[]} availableMarkets
     * @returns void
     */
    const showAvailableMarkets = (availableMarkets) => {
        if (availableMarkets.length === 1)
            return this.setSelectEpiMarket(availableMarkets[0]);

        this.showLoader(true);

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
            const label = item !== "unspecified" ? getCountry(item, true) : getTranslation("epi_markets_modal_no_market");

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
    };

    /**
     * @param {string} selectedMarket
     */
    this.setSelectEpiMarket = function (selectedMarket) {
        this.selectedEpiMarket = selectedMarket;
        const availableLanguages = this.metadata.availableDocuments[this.selectedDocument][this.selectedEpiMarket];
        showAvailableLanguages(availableLanguages);
    }

    const showDocumentModal = (result) => {
        try {
            if (this.selectedDocument === DocumentsTypes.INFO) {
                this.showModal("product-modal");
                renderProductInformation(result);
                return;
            }
            setTextDirectionForLanguage(this.selectedLanguage, "#settings-modal");
            this.showModal("settings-modal");
            renderLeaflet(result);
            if (isExpired(this.expiry))
                return showExpired(this.selectedLanguage);
            showRecalledMessage(result, this.selectedLanguage);
        } catch (e) {
            console.error(e);
            goToErrorPage(constants.errorCodes.xml_parse_error, new Error("Unsupported format for XML file."))
        }

    };

    /**
     * @param {{ productData: Object, availableDocuments: Record<string, Record<string, { label: string, value: string, nativeName: string }[]>> }} result
     * @returns {void}
     */
    const showAvailableDocuments = (result) => {
        let documents = [
            {text: 'document_product_info', value: DocumentsTypes.INFO},
            {text: 'document_patient_info', value: DocumentsTypes.LEAFLET},
            {text: 'document_prescribing_info', value: DocumentsTypes.PRESCRIBING_INFO},
        ];

        const productDocuments = Object.keys(result?.availableDocuments || {});
        const hasLeaflet = productDocuments.includes(DocumentsTypes.LEAFLET);
        const hasPrescribingInfo = productDocuments.includes(DocumentsTypes.PRESCRIBING_INFO);

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
        });
    };

    /**
     * @param selectedDocument
     * @returns void
     */
    this.setSelectedDocument = function (selectedDocument = null) {
        this.selectedDocument = selectedDocument ? selectedDocument : document.querySelector("input[name='documents']:checked")?.value;
        if (this.selectedDocument === DocumentsTypes.INFO) {
            this.selectedEpiMarket = "";
            showAvailableLanguages([{
                "label": "English",
                "value": "en",
                "nativeName": "English"
            }]);
            return;
        }

        let marketsWithResult = [];
        for(const [key, value] of Object.entries(this.metadata.availableDocuments[this.selectedDocument])) {
            if(value && value?.length) 
                marketsWithResult.push(key);
        }  
        return showAvailableMarkets(marketsWithResult);
    };


    /**
     * Retrieves the browser's language in a standardized format.
     *
     * @returns {string} The detected language, formatted as a lowercase ISO 639-1 code.
     */
    this.getLanguageFromBrowser = function(){
        let browserLang = navigator.language.toLowerCase().replace("_", "-");
        switch (browserLang) {
            case "en-us":
                browserLang = "en";
                break;
        }
        return browserLang;
    }

    /**
     * @param {string} lang
     */
    const setSelectedLanguage = (lang) => {
        this.defaultLanguage = lang;
        this.leafletLang = lang;
        this.selectedLanguage = lang;
        getLeafletXML();
    }

    /**
     *
     * @param {{label: string, value: string, nativeName: string}[]} languages
     */
    const showAvailableLanguages = (languages) => {
        
        this.showLoader(true);

        const browserLang = this.getLanguageFromBrowser();
        if (languages.length >= 1) {
            if (languages.map(r => r.value.toLowerCase()).includes(browserLang)) {
                return setSelectedLanguage(browserLang);
            }

            const modal = this.showModal('leaflet-lang-select');
            if(this.selectedDocument === DocumentsTypes.INFO) {
                modal.querySelector('#language-message').textContent = getTranslation("document_lang_select_message")
                modal.querySelector('#lang-title').textContent = getTranslation("document_lang_select_title");
            }

            modal.querySelector("#proceed-button").addEventListener("click", () => {
                let lang = document.querySelector("input[name='languages']:checked").value;
                setSelectedLanguage(lang);
            })

            // modal.querySelector("#go-back-button").addEventListener("click", () => {
            //     this.showModal('documents-modal');
            // });

            modal.querySelector(".proceed-button.no-leaflet").classList.add("hiddenElement");
            //  document.querySelector(".text-section.no-leaflet").setAttribute('style', 'display:none');
            let languagesContainer = document.querySelector(".languages-container");
            /* site for flags https://flagpedia.net/download */
            let selectedItem = null;
            languages.forEach((lang, index) => {

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
            this.showLoader(false);
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
            if(!evt.target.document)
                evt.target.document = {title: ""};
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
            if(!evt.target.document)
                evt.target.document = {title: ""};
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

    addEventListeners();
    getLeafletMetadata();
}


const leafletController = new LeafletController();


window.leafletController = leafletController;
