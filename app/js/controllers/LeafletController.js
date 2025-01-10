import {
    goToErrorPage, goToPage, isExpired, setTextDirectionForLanguage, enableConsolePersistence, escapeHTML, escapeHTMLAttribute
} from "../../../utils.js"
import constants from "../../../constants.js";
import LeafletService from "../services/LeafletService.js";
import environment from "../../../environment.js";
import {focusModalHeader, renderLeaflet, showExpired, showIncorrectDate} from "../utils/leafletUtils.js"
import {translate, getTranslation} from "../translationUtils.js";

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

    let getLeaflet = function (lang) {
        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        let gtin = urlParams.get("gtin");
        let batch = urlParams.get("batch");
        let expiry = urlParams.get("expiry");
        let lsEpiDomain = environment.enableEpiDomain ? localStorage.getItem(constants.EPI_DOMAIN) : environment.epiDomain;
        lsEpiDomain = lsEpiDomain || environment.epiDomain;
        let timePerCall = environment.timePerCall || 10000;
        let totalWaitTime = environment.totalWaitTime || 60000;
        let gto_TimePerCall = environment.gto_TimePerCall || 3000;
        let gto_TotalWaitTime = environment.gto_TotalWaitTime || 15000;
        let leafletService = new LeafletService(gtin, batch, expiry, lang, lsEpiDomain);

        document.querySelector(".loader-container").setAttribute('style', 'display:block');

        leafletService.getLeafletUsingCache(timePerCall, totalWaitTime, gto_TimePerCall, gto_TotalWaitTime).then((result) => {
            //check for injections in result
            let tmp = JSON.stringify(result)
            if (!tmp || sanitationRegex.test(tmp)) {
                goToErrorPage(constants.errorCodes.unsupported_response, new Error("Response unsupported format or contains forbidden content"));
                return;
            }
            if (result.resultStatus === "xml_found") {
                try {
                    showXML(result);
                    if (isExpired(expiry)) {
                        showExpired();
                    }

                    /* removed for  MVP1
                    if (!getExpiryTime(expiry)) {
                      showIncorrectDate();
                    }*/
                } catch (e) {
                    goToErrorPage(e.errorCode, e)
                }
            }

            if(result.resultStatus === "no_xml_for_lang") 
                return showAvailableLanguages(result)
            
            showRecalledMessage(result);
            // if (result.resultStatus === "no_xml_for_lang") {
            //     showAvailableLanguages(result)
            // }
            // let recalled = false; // to replace with flag from product data. set to true in order to test product recall
            // if (recalled) {
            //     showRecalledMessage(result);
            // }
        }).catch(err => {
            console.error(err);
            goToErrorPage(err.errorCode, err)
        })
    };


    this.getLangLeaflet = function () {
        document.querySelector(".loader-container").setAttribute('style', 'display:block');
        let lang = document.querySelector("input[name='languages']:checked").value
        this.leafletLang = lang;
        getLeaflet(lang);
        setTextDirectionForLanguage(lang, "#leaflet-content");
        setTextDirectionForLanguage(lang, ".modal-body .page-header");

        document.querySelector("#leaflet-lang-select").classList.add("hiddenElement");
    }

    this.scanAgainHandler = function () {
        goToPage("/scan.html")
    }

    this.goHome = function () {
        goToPage("/main.html")
    }

    this.closeModal = function (modalId) {
        document.querySelector("#" + modalId).classList.add("hiddenElement");
        if (modalId === "leaflet-lang-select") {
            goToPage("/main.html");
        }
        document.getElementById("settings-modal").classList.remove("hiddenElement");
    }

    let self = this;

    let showXML = function (result) {
        document.getElementById("settings-modal").classList.remove("hiddenElement");
        try {
            renderLeaflet(result);
        } catch (e) {
            goToErrorPage(constants.errorCodes.xml_parse_error, new Error("Unsupported format for XML file."))
        }

    }

    let showAvailableLanguages = function (result) {

        // document.querySelector(".product-name").innerText = translations[window.currentLanguage]["select_lang_title"];
        // document.querySelector(".product-description").innerText = translations[window.currentLanguage]["select_lang_subtitle"];
        // let langList = `<div class="select-lang-text">${translations[window.currentLanguage]["select_lang_text"]}</div><select class="languages-list">`;
        document.querySelector(".loader-container").setAttribute('style', 'display:none');
        if (result.availableLanguages.length >= 1) {
            let langSelectContainer = document.querySelector("#leaflet-lang-select");
            langSelectContainer.classList.remove("hiddenElement");
            document.querySelector(".proceed-button.no-leaflet").classList.add("hiddenElement");
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
                labelDiv.classList.add("language-label");
                labelDiv.setAttribute("lang-label", escapeHTMLAttribute(lang.label));
                labelDiv.textContent = escapeHTML(`${lang.label} - (${lang.nativeName})`);

                let radioFragment = document.createElement('label');
                radioFragment.classList.add("language-item-container");
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
    }

    let showRecalledMessage = function (result) {
        const {productData} = result;
        const {productRecall, batchData} = productData; 
        const recalled = productRecall || batchData?.batchRecall;
        const recalledContainer = document.querySelector("#recalled-modal");
        const modalLeaflet = document.getElementById("settings-modal");
        modalLeaflet.classList.remove('recalled');
        if (recalled) {
            const batchRecalled = batchData?.batchRecall; 
            const recalledMessageContainer = document.querySelector(".recalled-message-container");
            const recallInformation = document.createElement("p");
            modalLeaflet.classList.add('recalled');
            recalledContainer.classList.remove("hiddenElement");

            if (batchRecalled) { 
                recalledContainer.querySelector("#recalled-title").textContent = getTranslation('recalled_batch_title');
                recalledContainer.querySelector(".recalled-message-container").textContent = getTranslation("recalled_batch_message");
                recallInformation.innerHTML = getTranslation('recalled_batch_name',  `<strong>${batchData?.batch || batchData.batchNumber}</strong>`);
                document.querySelector('#recalled-bar-content').textContent =  getTranslation('leaflet_recalled_batch');
            } else {
                recallInformation.innerHTML = getTranslation('recalled_product_name', `<strong>${result.productData.nameMedicinalProduct}</strong>`);
            }

            recalledMessageContainer.appendChild(recallInformation);

            recalledContainer.querySelector("#recalled-modal-procced").onclick = function() { 
                recalledContainer.classList.add("hiddenElement");
                modalLeaflet.classList.remove('recalled');
            }; 
            recalledContainer.querySelector("#recalled-modal-exit").onclick = function() { 
                goToPage("/main.html")
            }; 
        }
        
    }

    let addEventListeners = () => {
        document.getElementById("scan-again-button").addEventListener("click", this.scanAgainHandler);
        document.getElementById("modal-scan-again-button").addEventListener("click", this.scanAgainHandler);
        document.getElementById("go-back-button").addEventListener("click", this.goHome);
        document.querySelectorAll(".modal-container.popup-modal .close-modal").forEach(item => {
            item.addEventListener("click", (event) => {
                this.closeModal(event.currentTarget.getAttribute("modal-id"))
            })
        })
        document.getElementById("proceed-button").addEventListener("click", this.getLangLeaflet)

    }
    addEventListeners();
    getLeaflet(localStorage.getItem(constants.APP_LANG) || "en");

}

const leafletController = new LeafletController();


window.leafletController = leafletController;
