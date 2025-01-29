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
            const label = getCountry(item.toUpperCase());

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

        let hasLeaflet = result.availableLanguages?.length || result?.resultStatus === 'xml_found' || false;

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
/*
{
    "resultStatus": "xml_found",
    "xmlContent": "<root>\r\n  <p page=\"0\" left=\"0.30165\" top=\"0.06790\" width=\"0.39671\" height=\"0.01807\" class=\"Type\">\r\n    <b>Package Insert: Information for Patients</b>\r\n  </p>\r\n  <p page=\"0\" left=\"0.34192\" top=\"0.09794\" width=\"0.31616\" height=\"0.04811\" class=\"Product_Name\">\r\n    <b>Product A® 24 mg/26 mg film-coated tablets Product A® 49 mg/51 mg film-coated tablets Product A® 97 mg/103 mg film-coated tablets </b>\r\n  </p>\r\n  <p page=\"0\" left=\"0.46049\" top=\"0.14301\" width=\"0.07902\" height=\"0.01758\" class=\"Ingredient Substance\">YYY/ZZZ</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.17305\" width=\"0.72005\" height=\"0.03309\" class=\"Read Instructions\">\r\n    <b>Please read the entire package insert carefully before starting to take this medication, as it contains important information.</b>\r\n  </p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.20310\" width=\"0.70076\" height=\"0.01758\" class=\"Read Instructions\">- Keep the package insert for future reference. You may want to read it again later.</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.21812\" width=\"0.66994\" height=\"0.03261\" class=\"Read Instructions\">- If you have any further questions, please consult your doctor, pharmacist, or medical professional.</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.24817\" width=\"0.75715\" height=\"0.03261\" class=\"Read Instructions\">- This medication has been prescribed specifically for you. Do not give it to others, as it may cause harm to other people, even if they have the same symptoms as you.</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.27821\" width=\"0.75412\" height=\"0.04763\" class=\"Read Instructions\">- If you notice any side effects, contact your doctor or pharmacist. This applies even to side effects not listed in this package insert. See Section 4 for more information.</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.33830\" width=\"0.28537\" height=\"0.01807\" class=\"Table of Content\">\r\n    <b>What is included in this package insert:</b>\r\n  </p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.36835\" width=\"0.42320\" height=\"0.01758\" class=\"Table of Content\">1. What is Product A and what is it used for?</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.38337\" width=\"0.49042\" height=\"0.01758\" class=\"Table of Content\">2. What should you consider before taking Product A?</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.39839\" width=\"0.29186\" height=\"0.01758\" class=\"Table of Content\">3. How should Product A be taken?</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.41342\" width=\"0.34470\" height=\"0.01758\" class=\"Table of Content\">4. What are the possible side effects?</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.42844\" width=\"0.30619\" height=\"0.01758\" class=\"Table of Content\">5. How should Product A be stored?</p>\r\n  <p page=\"0\" left=\"0.11909\" top=\"0.44346\" width=\"0.38880\" height=\"0.01758\" class=\"Table of Content\">6. Contents of the package and additional information.</p>\r\n  <section level=\"1\" page=\"0\" left=\"0.11909\" top=\"0.48853\" width=\"0.44794\" height=\"0.01807\">\r\n    <header>\r\n      <b>1. What is Product A and what is it used for?</b>\r\n    </header>\r\n    <p page=\"0\" left=\"0.11909\" top=\"0.51857\" width=\"0.68036\" height=\"0.03261\">Product A belongs to a group of medications that contain angiotensin-receptor-neprilysin inhibitors. It delivers the two active ingredients YYY and ZZZ.</p>\r\n    <p page=\"0\" left=\"0.11909\" top=\"0.56364\" width=\"0.66235\" height=\"0.03261\">Product A is used for the treatment of a specific type of chronic heart failure in adults.</p>\r\n    <p page=\"0\" left=\"0.11909\" top=\"0.60871\" width=\"0.74296\" height=\"0.04763\">This type of heart failure occurs when the heart is weak and unable to pump enough blood to the lungs and the rest of the body. The most common symptoms of heart failure are shortness of breath, fatigue, exhaustion, and swollen ankles.</p>\r\n  </section>\r\n  <section level=\"1\" page=\"0\" left=\"0.11909\" top=\"0.68382\" width=\"0.51928\" height=\"0.01807\">\r\n    <header>\r\n      <b>2. What should you consider before taking Product A?</b>\r\n    </header>\r\n    <p page=\"0\" left=\"0.11909\" top=\"0.71387\" width=\"0.34692\" height=\"0.01807\">\r\n      <b>Product A must not be taken if,</b>\r\n    </p>\r\n    <ul page=\"0\" data-type=\"•\" left=\"0.16670\" top=\"0.72983\" width=\"0.71112\" height=\"0.16968\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"0\" left=\"0.16670\" top=\"0.72983\" width=\"0.66037\" height=\"0.03261\">You are allergic to YYY, ZZZ, or any of the other ingredients listed in Section 6 of this medication.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"0\" left=\"0.16670\" top=\"0.76081\" width=\"0.71112\" height=\"0.07767\">You are taking another type of medication called an ACE inhibitor (e.g., Enalapril, Lisinopril, or Ramipril). ACE inhibitors are used to treat high blood pressure or heart failure. If you have been taking an ACE inhibitor, you should wait at least 36 hours after the last dose before starting Product A (see \"Taking Product A with other medications\").\r\n</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"0\" left=\"0.16670\" top=\"0.83686\" width=\"0.69171\" height=\"0.06265\">You or a family member have experienced a condition called angioedema (swelling of the face, lips, tongue, and/or throat, difficulty breathing) in response to taking an ACE inhibitor or an angiotensin receptor blocker (ARB) (e.g., ZZZ, Telmisartan, or Irbesartan).</p>\r\n      </li>\r\n    </ul>\r\n    <ul page=\"1\" data-type=\"•\" left=\"0.11909\" top=\"0.06883\" width=\"0.76062\" height=\"0.12510\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.06883\" width=\"0.68547\" height=\"0.04763\">You have diabetes or kidney impairment and are being treated with a blood pressure-lowering medication that contains Aliskiren (see \"Taking Product A with other medications\").\r\n</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.11335\" width=\"0.40569\" height=\"0.01907\">You have a severe liver disease.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.13080\" width=\"0.76062\" height=\"0.06314\">You are in the third trimester of pregnancy (it is advisable to avoid taking this medication even in early pregnancy, see \"Pregnancy and breastfeeding\"). <b>If any of the mentioned points apply to you, do not take Product A and consult your doctor.\r\n</b></p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"1\" left=\"0.11909\" top=\"0.20591\" width=\"0.71419\" height=\"0.04763\">\r\n      <b>Warnings and Precautions:</b> Please consult your doctor, pharmacist, or medical professional before or during the intake of Product A:</p>\r\n    <ul page=\"1\" data-type=\"•\" left=\"0.11909\" top=\"0.25192\" width=\"0.73666\" height=\"0.18939\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.25192\" width=\"0.68088\" height=\"0.03261\">If you are being treated with an angiotensin receptor blocker (ARB) or Aliskiren (see \"Product A must not be taken\").</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.28290\" width=\"0.63315\" height=\"0.03261\">If you have previously experienced angioedema (see \"Product A must not be taken\" and Section 4 \"Possible side effects\").</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.31388\" width=\"0.68905\" height=\"0.04763\">If you have low blood pressure or are taking other blood pressure-lowering medications (such as a diuretic) or if you are experiencing vomiting or diarrhea, especially if you are 65 years or older, have kidney disease, or have low blood pressure.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.35840\" width=\"0.40879\" height=\"0.01907\">If you have a severe kidney disease.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.37436\" width=\"0.34110\" height=\"0.01907\">If you are experiencing dehydration.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.39031\" width=\"0.35028\" height=\"0.01907\">If your kidney artery is narrowed.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.40627\" width=\"0.33646\" height=\"0.01907\">If you have liver disease.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.42223\" width=\"0.72997\" height=\"0.01907\">If you are experiencing hallucinations, paranoia, or changes in sleep behavior.</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"1\" left=\"0.11909\" top=\"0.45377\" width=\"0.74507\" height=\"0.03261\">Your doctor may monitor the potassium levels in your blood regularly during treatment with Product A.</p>\r\n    <p page=\"1\" left=\"0.11909\" top=\"0.49884\" width=\"0.70412\" height=\"0.03309\">\r\n      <b>If any of the mentioned points apply to you, please inform your doctor, pharmacist, or medical professional before taking Product A.</b>\r\n    </p>\r\n    <p page=\"1\" left=\"0.11909\" top=\"0.54390\" width=\"0.73627\" height=\"0.04763\">\r\n      <b>Children and adolescents</b> Do not administer this medication to children (under 18 years old) as it has not been studied in this age group.</p>\r\n    <p page=\"1\" left=\"0.11909\" top=\"0.60399\" width=\"0.76083\" height=\"0.09270\">\r\n      <b>Taking Product A together with other medications</b> Informieren Sie iis zu äre für folgende Arzneimittel:Inform your doctor, pharmacist, or medical professional if you are taking any other medications, have recently taken any other medications, or intend to take any other medications. It may be necessary to adjust the dose, take additional precautions, or even discontinue one of the medications. This applies especially to the following medications:</p>\r\n    <ul page=\"1\" data-type=\"•\" left=\"0.11909\" top=\"0.69507\" width=\"0.74847\" height=\"0.23259\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.69507\" width=\"0.68700\" height=\"0.07767\">ACE inhibitors. Do not take Product A together with ACE inhibitors. If you have been taking an ACE inhibitor, you should wait at least 36 hours after the last dose of the ACE inhibitor before starting Product A (see \"Product A must not be taken\"). If you stop taking Product A, wait 36 hours after the last dose of Product A before taking an ACE inhibitor.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.77112\" width=\"0.67879\" height=\"0.04763\">Other medications for the treatment of heart failure or blood pressure reduction, such as angiotensin receptor blockers or Aliskiren (see \"Product A must not be taken\").</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.81712\" width=\"0.62286\" height=\"0.03261\">Some medications known as statins are used to lower high cholesterol levels (e.g., Atorvastatin).</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.11909\" top=\"0.84661\" width=\"0.73313\" height=\"0.01907\">Sildenafil, a medication used for the treatment of erectile dysfunction or pulmonary hypertension.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.86406\" width=\"0.67933\" height=\"0.03261\">Medications that increase the amount of potassium in the blood. This includes potassium supplements, potassium-containing salt substitutes, potassium-sparing medications, and Heparin.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"1\" left=\"0.16670\" top=\"0.89505\" width=\"0.70086\" height=\"0.03261\">Non-steroidal anti-inflammatory drugs (NSAIDs) or selective cyclooxygenase-2 (COX-2) inhibitors. </p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"2\" left=\"0.16671\" top=\"0.06790\" width=\"0.65983\" height=\"0.03261\"> If you are taking any of these medications, your doctor may want to monitor your kidney function at the beginning or during the treatment (see \"Warnings and precautions\").</p>\r\n    <ul page=\"2\" data-type=\"•\" left=\"0.11909\" top=\"0.09739\" width=\"0.74956\" height=\"0.15851\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"2\" left=\"0.11909\" top=\"0.09739\" width=\"0.66384\" height=\"0.01907\">Lithium, a medication used for the treatment of certain psychiatric conditions.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"2\" left=\"0.16670\" top=\"0.11484\" width=\"0.68084\" height=\"0.03261\">Furosemide, a medication belonging to the group of diuretics used to increase urine production.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"2\" left=\"0.11909\" top=\"0.14433\" width=\"0.55816\" height=\"0.01907\">Nitroglycerin, a medication used for the treatment of angina pectoris.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"2\" left=\"0.16670\" top=\"0.16178\" width=\"0.70195\" height=\"0.04763\">Certain types of antibiotics (Rifamycin group), Ciclosporin (used to prevent organ transplant rejection), or antiviral agents such as Ritonavir (used for the treatment of HIV/AIDS).</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"2\" left=\"0.11909\" top=\"0.20779\" width=\"0.70412\" height=\"0.04811\">Metformin, a medication used for the treatment of diabetes. <b>If any of the mentioned points apply to you, inform your doctor or pharmacist before taking Product A.\r\n</b></p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.26788\" width=\"0.23404\" height=\"0.01807\">\r\n      <b>Pregnancy and Lactation</b>\r\n    </p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.29792\" width=\"0.73731\" height=\"0.07767\">You must inform your doctor if you think you are pregnant (or planning to become pregnant). In general, your doctor will advise you to discontinue the use of this medication before becoming pregnant or as soon as you know you are pregnant, and recommend an alternative medication instead of Product A.</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.38806\" width=\"0.75935\" height=\"0.04763\">This medication is not recommended during early pregnancy and should not be taken if you are already more than 3 months pregnant, as it can cause serious harm to your child if used after the third month of pregnancy.</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.44815\" width=\"0.73272\" height=\"0.04763\">Product A is not recommended for breastfeeding women. Inform your doctor if you are breastfeeding or planning to start breastfeeding soon.</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.50824\" width=\"0.76094\" height=\"0.09270\">\r\n      <b>Driving and operating machinery</b> Before driving vehicles, using tools or machinery, or performing other activities that require concentration, make sure you know how Product A affects you. If you feel dizzy or excessively tired during the use of this medication, do not drive vehicles, ride bicycles, or use tools or machinery.</p>\r\n  </section>\r\n  <section level=\"1\" page=\"2\" left=\"0.11909\" top=\"0.62842\" width=\"0.30730\" height=\"0.01807\">\r\n    <header>\r\n      <b>3. How to take Product A?</b>\r\n    </header>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.65846\" width=\"0.73060\" height=\"0.03261\">Always take this medication exactly as directed by your doctor or pharmacist. If you are unsure, ask your doctor or pharmacist for clarification.</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.70353\" width=\"0.75366\" height=\"0.06265\">Usually, you start with a dose of 24 mg/26 mg or 49 mg/51 mg twice daily (one tablet in the morning and one tablet in the evening). Your doctor will determine the exact starting dose based on the medications you have taken previously. Depending on your response to the treatment, your doctor will then adjust the dose until the optimal dose is found for you.</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.77864\" width=\"0.69520\" height=\"0.03261\">The typically recommended target dose is 97 mg/103 mg twice daily (one tablet in the morning and one tablet in the evening).</p>\r\n    <p page=\"2\" left=\"0.11909\" top=\"0.82371\" width=\"0.75369\" height=\"0.07767\">Patients taking Product A may experience low blood pressure (dizziness, lightheadedness), high potassium levels in the blood (which would be detected by a blood test conducted by your doctor), or decreased kidney function. If this happens, your doctor may reduce the dose of one of the other medications you are taking, temporarily reduce your Product A dose, or completely stop your treatment with Product A.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.06790\" width=\"0.76197\" height=\"0.03261\">Swallow the tablets with a glass of water. You can take Product A regardless of meals. Splitting or crushing the tablets is not recommended.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.11296\" width=\"0.75988\" height=\"0.07767\">\r\n      <b>If you have taken a larger amount of Product A than you should have:</b> Contact your doctor immediately if you have accidentally taken too many Product A tablets or if someone else has taken your tablets. If you experience severe dizziness and/or fainting, inform your doctor as soon as possible and lie down.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.20310\" width=\"0.73731\" height=\"0.07767\">\r\n      <b>If you forget to take Product A:</b> It is recommended to take your medication at the same time every day. However, if you forget to take a dose, simply take the next tablet at the scheduled time. Do not take a double dose if you have missed the previous dose.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.29324\" width=\"0.75419\" height=\"0.06265\">\r\n      <b>If you stop taking Product A:</b> Discontinuing treatment with Product A may worsen your condition. Do not stop taking your medication unless instructed to do so by your doctor.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.36835\" width=\"0.73110\" height=\"0.03261\">If you have any further questions about taking this medication, consult your doctor or pharmacist.</p>\r\n  </section>\r\n  <section level=\"1\" page=\"3\" left=\"0.11909\" top=\"0.42844\" width=\"0.36020\" height=\"0.01807\">\r\n    <header>\r\n      <b>4. What side effects are possible?</b>\r\n    </header>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.45848\" width=\"0.75519\" height=\"0.03261\">Like all medicines, this medicine can have side effects, but not everyone gets them.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.50355\" width=\"0.36698\" height=\"0.01807\">\r\n      <b>Some symptoms can be serious.</b>\r\n    </p>\r\n    <ul page=\"3\" data-type=\"•\" left=\"0.16670\" top=\"0.51951\" width=\"0.70034\" height=\"0.07767\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.16670\" top=\"0.51951\" width=\"0.70034\" height=\"0.07767\">Stop taking Product A and seek immediate medical attention if you notice swelling of the face, lips, tongue, and/or throat, which may cause difficulty breathing or swallowing. These may be signs of angioedema (an occasional side effect that may affect 1 in 100 patients).</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.60965\" width=\"0.72081\" height=\"0.04763\">\r\n      <b>Other possible side effects:</b> If any of the side effects listed below worsen, please inform your doctor or pharmacist.</p>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.66974\" width=\"0.45000\" height=\"0.01807\">\r\n      <b>Very common</b> (may affect more than 1 in 10 patients)</p>\r\n    <ul page=\"3\" data-type=\"•\" left=\"0.11909\" top=\"0.68421\" width=\"0.54637\" height=\"0.05099\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.68421\" width=\"0.45707\" height=\"0.01907\">Low blood pressure (dizziness, lightheadedness)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.70017\" width=\"0.54637\" height=\"0.01907\">High potassium levels in the blood (detected by blood test)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.71613\" width=\"0.44680\" height=\"0.01907\">Decreased kidney function (renal impairment)</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"3\" left=\"0.11909\" top=\"0.74766\" width=\"0.39303\" height=\"0.01807\">\r\n      <b>Common </b> (may affect up to 1 in 10 patients)</p>\r\n    <ul page=\"3\" data-type=\"•\" left=\"0.11909\" top=\"0.76213\" width=\"0.61713\" height=\"0.16271\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.76213\" width=\"0.09996\" height=\"0.01907\">Cough</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.77809\" width=\"0.17283\" height=\"0.01907\">Dizziness</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.79405\" width=\"0.11842\" height=\"0.01907\">Diarrhea</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.81001\" width=\"0.61713\" height=\"0.01907\">Low red blood cell count (detected by blood test)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.82597\" width=\"0.12461\" height=\"0.01907\">Fatigue</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.84193\" width=\"0.44416\" height=\"0.01907\">(Acute) kidney failure (severe kidney disease)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.85789\" width=\"0.57098\" height=\"0.01907\">Low potassium levels in the blood (detected by blood test)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.87385\" width=\"0.16459\" height=\"0.01907\">Headache</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.88981\" width=\"0.12459\" height=\"0.01907\">Fainting</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"3\" left=\"0.11909\" top=\"0.90577\" width=\"0.12252\" height=\"0.01907\">Weakness</p>\r\n      </li>\r\n    </ul>\r\n    <ul page=\"4\" data-type=\"•\" left=\"0.11909\" top=\"0.06734\" width=\"0.70797\" height=\"0.09793\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.06734\" width=\"0.11125\" height=\"0.01907\">Nausea</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.16670\" top=\"0.08479\" width=\"0.66035\" height=\"0.03261\">Low blood pressure (dizziness, lightheadedness) upon standing up from a sitting or lying position</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.11429\" width=\"0.33032\" height=\"0.01907\">Gastritis (stomach pain, nausea)</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.13025\" width=\"0.15947\" height=\"0.01907\">Vertigo</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.14621\" width=\"0.53606\" height=\"0.01907\">Low blood sugar levels (detected by blood test)</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"4\" left=\"0.11909\" top=\"0.17774\" width=\"0.44637\" height=\"0.01807\">\r\n      <b>Uncommon</b> (may affect up to 1 in 100 patients)</p>\r\n    <ul page=\"4\" data-type=\"•\" left=\"0.11909\" top=\"0.19221\" width=\"0.53970\" height=\"0.03503\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.19221\" width=\"0.40833\" height=\"0.01907\">Allergic reaction with rash and itching</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.20817\" width=\"0.53970\" height=\"0.01907\">Dizziness upon standing up from a sitting position</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"4\" left=\"0.11909\" top=\"0.23970\" width=\"0.40996\" height=\"0.01807\">\r\n      <b>Rare </b> (may affect up to 1 in 1,000 patients)</p>\r\n    <ul page=\"4\" data-type=\"•\" left=\"0.11909\" top=\"0.25417\" width=\"0.28321\" height=\"0.03503\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.25417\" width=\"0.16520\" height=\"0.01907\">Hallucinations</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.27013\" width=\"0.28321\" height=\"0.01907\">Changes in sleep patterns</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"4\" left=\"0.11909\" top=\"0.30167\" width=\"0.45768\" height=\"0.01807\">\r\n      <b>Very rare</b> (may affect up to 1 in 10,000 patients)</p>\r\n    <ul page=\"4\" data-type=\"•\" left=\"0.11909\" top=\"0.31614\" width=\"0.11184\" height=\"0.01907\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"4\" left=\"0.11909\" top=\"0.31614\" width=\"0.11184\" height=\"0.01907\">Paranoia</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"4\" left=\"0.11909\" top=\"0.34959\" width=\"0.75951\" height=\"0.09270\">\r\n      <b>Reporting of side effects</b> If you experience any side effects, please contact your doctor, pharmacist, or healthcare professional. This also applies to any side effects not mentioned in this package leaflet. You can also report side effects directly (see details below). By reporting side effects, you can help provide more information on the safety of this medicine.</p>\r\n   <table page=\"4\" left=\"0.11909\" top=\"0.45420\" width=\"0.80471\" height=\"0.15991\">\r\n      <tr page=\"4\" left=\"0.11909\" top=\"0.45420\" width=\"0.80471\" height=\"0.15991\">\r\n        <td>\r\n          <p page=\"4\" left=\"0.12858\" top=\"0.45550\" width=\"0.05850\" height=\"0.01473\">\r\n            <b>Belgium</b>\r\n          </p>\r\n        </td>\r\n        <td>\r\n          <p page=\"4\" left=\"0.53053\" top=\"0.45550\" width=\"0.09342\" height=\"0.01473\">\r\n            <b>Luxembourg</b>\r\n          </p>\r\n        </td>\r\n      </tr>\r\n      <tr page=\"4\" left=\"0.11909\" top=\"0.45479\" width=\"0.80471\" height=\"0.15931\">\r\n        <td>\r\n          <p page=\"4\" left=\"0.12858\" top=\"0.47153\" width=\"0.32477\" height=\"0.12566\">Federal Agency for Medicines and Health Products Department of Pharmacovigilance P.O. Box 97 B-1000 Brussels Madou Website: www.reportanadversereaction.be Email: adr@fagg-afmps.be\r\n</p>\r\n        </td>\r\n        <td>\r\n          <p page=\"4\" left=\"0.53053\" top=\"0.47153\" width=\"0.36375\" height=\"0.12566\">Regional Center for Pharmacovigilance of Nancy Tel: (+33) 3 83 65 60 85 / 87 Email: crpv@chru-nancy.fr or Ministry of Health Division of Pharmacy and Medicines Tel: (+352) 2478 5592 Email: pharmacovigilance@ms.etat.lu\r\n</p>\r\n        </td>\r\n      </tr>\r\n    </table>\r\n  </section>\r\n  <section level=\"1\" page=\"4\" left=\"0.11909\" top=\"0.64097\" width=\"0.32474\" height=\"0.01807\">\r\n    <header>\r\n      <b>5. How to store Product A?</b>\r\n    </header>\r\n    <p page=\"4\" left=\"0.11909\" top=\"0.67102\" width=\"0.74449\" height=\"0.16781\">Do not use this medicine after the expiration date stated on the outer carton and blister pack (\"EXP\" date). The expiration date refers to the last day of the specified month. No special storage conditions regarding temperature are required for this medicine. Store in the original packaging to protect the contents from moisture. Do not use this medicine if you notice that the packaging is damaged or shows signs of tampering. Do not dispose of medicines in wastewater. Ask your pharmacist how to dispose of the medicine when you no longer use it. By doing so, you contribute to protecting the environment.\r\n</p>\r\n  </section>\r\n  <section level=\"1\" page=\"5\" left=\"0.11909\" top=\"0.06790\" width=\"0.41766\" height=\"0.01807\">\r\n    <header>\r\n      <b>6. Contents of the pack and other information</b>\r\n    </header>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.09794\" width=\"0.18116\" height=\"0.01807\">\r\n      <b>What Product A contains</b>\r\n    </p>\r\n    <ul page=\"5\" data-type=\"•\" left=\"0.11909\" top=\"0.11241\" width=\"0.74823\" height=\"0.23220\">\r\n      <li data-enum=\"•\">\r\n        <p page=\"5\" left=\"0.11909\" top=\"0.11241\" width=\"0.31959\" height=\"0.01907\">The active ingredients are: YYY and ZZZ.</p>\r\n        <ul page=\"5\" data-type=\"o\" left=\"0.21432\" top=\"0.12892\" width=\"0.63273\" height=\"0.09270\">\r\n          <li data-enum=\"o\">\r\n            <p page=\"5\" left=\"0.21432\" top=\"0.12892\" width=\"0.61425\" height=\"0.03261\">Each 24 mg/26 mg film-coated tablet contains 24.3 mg of YYY and 25.7 mg of ZZZ (as YYY sodium - ZZZ disodium (1:1) 2.5 H2O).</p>\r\n          </li>\r\n          <li data-enum=\"o\">\r\n            <p page=\"5\" left=\"0.21432\" top=\"0.15897\" width=\"0.61425\" height=\"0.03261\">Each 49 mg/51 mg film-coated tablet contains 48.6 mg of YYY and 51.4 mg of ZZZ (as YYY sodium - ZZZ disodium (1:1) 2.5 H2O).</p>\r\n          </li>\r\n          <li data-enum=\"o\">\r\n            <p page=\"5\" left=\"0.21432\" top=\"0.18901\" width=\"0.63273\" height=\"0.03261\">Each 97 mg/103 mg film-coated tablet contains 97.2 mg of YYY and 102.8 mg of ZZZ (as YYY sodium - ZZZ disodium (1:1) 2.5 H2O).</p>\r\n          </li>\r\n        </ul>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"5\" left=\"0.16670\" top=\"0.22000\" width=\"0.62757\" height=\"0.04763\">The other ingredients in the tablet core are: microcrystalline cellulose, low-substituted hydroxypropyl cellulose, crospovidone, magnesium stearate, talc, and colloidal silicon dioxide.</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"5\" left=\"0.16670\" top=\"0.26600\" width=\"0.68447\" height=\"0.04763\">The coating of the 24 mg/26 mg and 97 mg/103 mg tablets contains hypromellose, titanium dioxide (E171), macrogol (4000), talc, iron oxide (E172), and iron hydroxide oxide x H2O (E172).</p>\r\n      </li>\r\n      <li data-enum=\"•\">\r\n        <p page=\"5\" left=\"0.16670\" top=\"0.31201\" width=\"0.70062\" height=\"0.03261\">The coating of the 49 mg/51 mg tablets contains hypromellose, titanium dioxide (E171), macrogol (4000), talc, iron oxide (E172), and iron hydroxide oxide x H2O (E172).</p>\r\n      </li>\r\n    </ul>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.35707\" width=\"0.75429\" height=\"0.10772\">\r\n      <b>What Product A looks like and contents of the pack</b> Product A 24 mg/26 mg film-coated tablets are violet-white, oval tablets with \"NVR\" on one side and \"LZ\" on the other side. Approximate tablet dimensions 13.1 mm x 5.2 mm. Product A 49 mg/51 mg film-coated tablets are pale yellow, oval tablets with \"NVR\" on one side and \"L1\" on the other side. Approximate tablet dimensions 13.1 mm x 5.2 mm. Product A 97 mg/103 mg film-coated tablets are light pink, oval tablets with \"NVR\" on one side and \"L11\" on the other side. Approximate tablet dimensions 15.1 mm x 6.0 mm.\r\n</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.47725\" width=\"0.75427\" height=\"0.06265\">The tablets are available in packs of 14, 20, 28, 56, 168, or 196 tablets and in bundle packs consisting of 7 packs of 28 tablets each. The 49 mg/51 mg and 97 mg/103 mg tablets are also available in bundle packs consisting of 3 packs of 56 tablets each.</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.55237\" width=\"0.58694\" height=\"0.01758\">Not all pack sizes may be marketed.</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.58241\" width=\"0.25499\" height=\"0.03261\">\r\n      <b>Marketing Authorization Holder</b> XXXXXXXX</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.62748\" width=\"0.10674\" height=\"0.03261\">\r\n      <b>Manufacturer</b> XXXXXXXX</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.67255\" width=\"0.69782\" height=\"0.03261\">If you require any further information about the medicine, please contact the local representative of the marketing authorization holder.</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.71762\" width=\"0.20121\" height=\"0.04763\">\r\n      <b>België/Belgique/Belgien Luxembourg/Luxemburg</b> XXXXXXXX</p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.77771\" width=\"0.48802\" height=\"0.01807\">\r\n      <b>This package leaflet was last revised in 05/2021.</b>\r\n    </p>\r\n    <p page=\"5\" left=\"0.11909\" top=\"0.80775\" width=\"0.71726\" height=\"0.04763\">\r\n      <b>Further sources of information</b> Detailed information about this medicine is available on the European Medicines Agency website at http://www.ema.europa.eu.</p>\r\n  </section>\r\n</root>",
    "leafletImages": {},
    "productData": {
        "productCode": "76879879890806",
        "epiProtocol": "v1",
        "lockId": "EdiMXkTs9jMDCqvJ54wqWwR8kCbQijZP5jQfUxLDFLvd",
        "internalMaterialCode": "",
        "inventedName": "Brand2",
        "nameMedicinalProduct": "product2",
        "productRecall": false,
        "strengths": [],
        "markets": [],
        "description": "product2",
        "name": "Brand2",
        "productPhoto": "./assets/icons/product_image_placeholder.svg",
        "batchData": {
            "productCode": "76879879890806",
            "batchNumber": "batch2",
            "epiProtocol": "v1",
            "lockId": "9PcnBM845jMjzzmJCRFK8rWTXxctHCWf6WS3EQNZkNLo",
            "expiryDate": "250206",
            "batchRecall": false,
            "packagingSiteName": "",
            "importLicenseNumber": "",
            "manufacturerName": "",
            "dateOfManufacturing": "",
            "manufacturerAddress5": "",
            "batch": "batch2"
        }
    },
    "availableLanguages": [
        {
            "label": "English",
            "value": "en",
            "nativeName": "English"
        }
    ],
    "availableEpiMarkets": {
        "JO": [
            {
                "label": "Arabic",
                "value": "ar",
                "nativeName": "العربية"
            }
        ]
    },
    "availableTypes": [
        "leaflet",
        "prescribingInfo"
    ]
}
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
