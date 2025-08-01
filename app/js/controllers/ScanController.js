import {
  goToErrorPage,
  goToPage,
  enableConsolePersistence,
  modalOpen,
  modalClose,
  parseGS1Code, sanitizeLogMessage
} from "../../../utils.js";
import ScanService from "../services/ScanService.js";
import {getTranslation, translate, translateAccessibilityAttributes} from "../translationUtils.js";
import constants from "../../../constants.js";


enableConsolePersistence();
window.onload = async (event) => {
  await translate();
  translateAccessibilityAttributes();
  setTimeout(() => {
    document.querySelector(".modal-header .close-modal").style.position = "absolute";
  }, 0);
}


function ScanController() {
  this.init = async function (forceNewCamera) {
    document.querySelector(".loader-container").setAttribute('style', 'display:block');
    let placeHolderElement = document.querySelector("#scanner-placeholder");
    if (!forceNewCamera) {
      this.scanService = new ScanService(placeHolderElement);
    }
    try {
      await this.scanService.setup(forceNewCamera);
    } catch (err) {
      this.redirectToError(err);
    }
    await this.startScanning();
    document.querySelector(".loader-container").setAttribute('style', 'display:none');
  }

  this.closeModal = function (modalId) {
    const modal = document.querySelector("#" + modalId);
    modalClose(modal);  
    // modal.classList.add("hiddenElement");
    // if (document.querySelector("#scan-error").classList.contains("hiddenElement")) {
    //   document.querySelector(".scan-cancel").setAttribute("tabindex", "1");
    //   document.querySelector(".camera-switch").setAttribute("tabindex", "2");
    // }
  }

  this.redirectToError = function (err) {
    console.log("Error on scanService ", err);
    let modal = document.querySelector("#scan-error");
    modal.setAttribute("tabindex", "0");
    document.querySelector(".scan-cancel").setAttribute("tabindex", "-1");
    document.querySelector(".camera-switch").setAttribute("tabindex", "-1");
    if (err.scanResult) {
      modal.querySelector(".modal-title").innerHTML = getTranslation("scan_parse_error");
      modal.querySelector(".modal-content").innerHTML = `<div>${getTranslation("scan_parse_error_message")}  ${err.scanResult}</div>`;
    }
    modalOpen(modal, null);
    //  goToPage("error.html")
  }

  this.cancelHandler = function () {
    goToPage("/main.html");
  }

  this.startScanning = async function () {
    let scanResult = null;
    this.scanInterval = setInterval(() => {
      this.scanService.scan().then(result => {
        if (!result) {
          return;
        }
        console.log("Scan result:", sanitizeLogMessage(result));
        this.scanService.stop();
        clearInterval(this.scanInterval);
        scanResult = result.text;
        this.processGS1Fields(scanResult)
      }).catch(err => {
        err.scanResult = scanResult;
        this.redirectToError(err);
        console.log("Caught", err);
      });
    }, 100);
  }

  this.processGS1Fields = function (scanResultText) {
    let gs1Fields = null;
    try {
      /* FIXME: CHANGE WHEN EMA'S GTINS START BEEING VALID BACK TO parseGS1Code() */
      gs1Fields = parseGS1DataMatrix(scanResultText); 
      const page = `/leaflet.html?gtin=${gs1Fields.gtin}&batch=${gs1Fields.batch}&expiry=${gs1Fields.expiry}`;
      goToPage(page);
    } catch (err) {
      if (err.message) {
        if (err.message.includes("INVALID CHECK DIGIT:")) {
          goToErrorPage(constants.errorCodes.gtin_wrong_digit, err);
          return;
        }
        if (err.message.includes("SYNTAX ERROR:")) {
          goToErrorPage(constants.errorCodes.gtin_wrong_chars, err);
          return;
        }
      }
      goToErrorPage(constants.errorCodes.unknown_error, err);
    }
  }
/*********************************************************************/
/*********** FIXME: THIS IS FOR EMA TESTING **************************
 *********** WHILE EMA GTINS ARE NOT VALID  *************************/
/********************************************************************/

function parseGS1DataMatrix(input) {
  // Clean up invisible characters
  const gs = '\u001D';
  input = input.replace(/[\u001D]/g, '');

  let i = 0;
  const result = {};

  while (i < input.length) {
    const ai = input.substring(i, i + 2);

    switch (ai) {
      case '01': // GTIN (fixed length: 14)
        result.gtin = input.substring(i + 2, i + 16);
        i += 16;
        break;
      case '10': { // Batch/Lot (variable length until next AI or end)
        i += 2;
        let end = i;
        while (
          end < input.length &&
          !['01', '17', '21'].includes(input.substring(end, end + 2))
        ) {
          end++;
        }
        result.batch = input.substring(i, end);
        i = end;
        break;
      }
      case '17': { // Expiration Date (YYMMDD — fixed 6)
        const dateStr = input.substring(i + 2, i + 8);
        result.expiry = dateStr;
        i += 8;
        break;
      }
      default:
        i++; // skip unknown or malformed data
    }
  }

  return result;
}

/*********************************************************************/
/*********** FIXME: THIS IS FOR EMA TESTING **************************
 *********** WHILE EMA GTINS ARE NOT VALID  *************************/
/********************************************************************/

  this.switchCamera = function () {
    //this.scanService.stop();
    clearInterval(this.scanInterval);
    scanController.init(true);
  }

  let addEventListeners = () => {
    document.getElementById("cancel-scan-button").addEventListener("click", this.cancelHandler)
    document.getElementById("change-camera-button").addEventListener("click", this.switchCamera)
    document.getElementById("close-modal-button").addEventListener("click", (event) => {
      this.closeModal(event.currentTarget.getAttribute("modal-id"));
    })
  }

  addEventListeners();
}

const scanController = new ScanController();
scanController.init();

window.scanController = scanController;
