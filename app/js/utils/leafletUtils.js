import XMLDisplayService from "../services/XMLDisplayService/XMLDisplayService.js";
import constants from "../../../constants.js";
import {setTextDirectionForLanguage} from "../../../utils.js";
import {observerVideos, mediaUrlRegex} from "../services/XMLDisplayService/leafletXSL.js"
import { getTranslation } from "../translationUtils.js";



const TITLES = {
  LIST_OF_EXCIPIENTS: 'list_of_excipients',
  GENERIC_NAME: 'generic_name'
}

const CLASSES = {
  LIST_OF_EXCIPIENTS: 'list_excipients',
  GENERIC_NAME: 'generic_name'
}

let showExpired = function () {
  document.querySelector(".loader-container").setAttribute('style', 'display:none');
  document.querySelector("#expired-modal").classList.remove("hiddenElement");
  focusModalHeader();
}

let showIncorrectDate = function () {
  document.querySelector("#incorrect-date-modal").setAttribute('style', 'display:flex !important');
  focusModalHeader();
}

function handleLeafletAccordion() {
  let accordionItems = document.querySelectorAll("div.leaflet-accordion-item");
  accordionItems.forEach((accItem, index) => {
    const sectionContent = accItem.querySelector('.leaflet-accordion-item-content');
    accItem.addEventListener("click", (evt) => {
      accItem.classList.toggle("active");
      const isActive = accItem.classList.contains("active");
      if (isActive) {
        accItem.setAttribute('aria-expanded', "true");
      } else {
        accItem.setAttribute('aria-expanded', "false");
      }
      observerVideos(accItem, isActive)
      accItem.querySelector(".leaflet-accordion-item-content").addEventListener("click", (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
      })
    })
    accItem.addEventListener("keydown", (event) => {
      const isActive = accItem.classList.contains("active");
      if (event.key === "Enter" || event.key === " ") {
        accItem.classList.toggle("active");
        const isActive = accItem.classList.contains("active");
        if (isActive) {
          accItem.setAttribute('aria-expanded', "true");
        } else {
          accItem.setAttribute('aria-expanded', "false");
        }
      }
      observerVideos(accItem, isActive);
      accItem.querySelector(".leaflet-accordion-item-content").addEventListener("keydown", (event) => {
        event.stopImmediatePropagation();
        event.stopPropagation();
      })
    })
  })
}

let focusModalHeader = function () {
  document.querySelectorAll(".modal-header").forEach(element => {
    if (element.offsetParent) {
      document.querySelector(".modal-header").focus();
    }
  })

}

let generateMissingFilesList = function (missingImgFiles) {
  let missingFilesErrText = ``;
  missingImgFiles.forEach(item => {
    missingFilesErrText = missingFilesErrText + `<li>Image ${item} does not exist</li>`
  })
  return missingFilesErrText;
}

let generateDifferentCaseToastList = function (differentCaseImgFiles) {
  let differentCaseErrText = ``;
  differentCaseImgFiles.forEach(item => {
    differentCaseErrText = differentCaseErrText + `<li>Image ${item.xmlName} does not exist, but a similar file ${item.fileName}  exists and will be used instead</li>`
  })
  return differentCaseErrText;
}

let validateLeafletFiles = function (htmlContent, leafletImages, uploadedImages) {
  if (!htmlContent) {
    let err = new Error("<li>Unsupported format for XML file.</li>");
    err.errorCode = constants.errorCodes.xml_parse_error;
    throw err;
  }

  let htmlImageNames = Array.from(leafletImages).map(img => img.getAttribute("src"));
  //removing from validation image src that are data URLs ("data:....")
  htmlImageNames = htmlImageNames.filter((imageSrc) => {

    // new RegExp(/^\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i);
    if (!!imageSrc.match(mediaUrlRegex) || imageSrc.startsWith("data:")) {
      return false;
    }
    return true;
  });
  let uploadedImageNames = Object.keys(uploadedImages);
  let differentCaseImgFiles = [];
  let missingImgFiles = []
  htmlImageNames.forEach(imgName => {
    let similarItemIndex = uploadedImageNames.findIndex((item) => item.toLowerCase() === imgName.toLowerCase());
    if (similarItemIndex < 0) {
      missingImgFiles.push(imgName);
    } else if (uploadedImageNames[similarItemIndex] !== imgName) {
      differentCaseImgFiles.push({xmlName: imgName, fileName: uploadedImageNames[similarItemIndex]});
    }
  })

  if (missingImgFiles.length > 0) {
    let errMsg = generateMissingFilesList(missingImgFiles)
    let err = new Error(errMsg);
    err.errorCode = constants.errorCodes.xml_parse_error;
    throw err;
  }
  if (differentCaseImgFiles.length > 0) {
    let errMsg = generateDifferentCaseToastList(differentCaseImgFiles)
    let err = new Error(errMsg);
    err.errorCode = constants.errorCodes.xml_parse_error;
    throw err;
  }

}

let renderLeaflet = function (leafletData, metadata) {

  if(!!metadata && !!metadata.productData)
    leafletData.productData = metadata.productData;
    
  document.querySelector(".product-name").innerText = leafletData.productData.inventedName || leafletData.productData.name;
  let productDescriptionName = upperCaseProductDescriptionProductName(leafletData.productData.nameMedicinalProduct || leafletData.productData.description, leafletData.productData.inventedName || leafletData.productData.name);
  document.querySelector(".product-description").innerText = productDescriptionName;

   /* document.querySelector(".leaflet-title-icon").classList.remove("hiddenElement");*/
  let xmlService = new XMLDisplayService("#leaflet-content");
  let resultDocument = xmlService.getHTMLFromXML(leafletData.xmlContent);
  let leafletImages = resultDocument.querySelectorAll("img,source");
  for (let image of leafletImages) {
    let imageSrc = image.getAttribute("src");

    if(image.hasAttribute('alt'))
        image.setAttribute('alt', (image.getAttribute('alt') || "").trim())

    let dataUrlRegex = new RegExp(/^\s*data:([a-z]+\/[a-z]+(;[a-z\-]+\=[a-z\-]+)?)?(;base64)?,[a-z0-9\!\$\&\'\,\(\)\*\+\,\;\=\-\.\_\~\:\@\/\?\%\s]*\s*$/i);
    if (!!imageSrc.match(dataUrlRegex) || imageSrc.startsWith("data:")) {
      //we don't alter already embedded images
      continue;
    }
    if (leafletData.leafletImages[imageSrc]) {
      image.setAttribute("src", leafletData.leafletImages[imageSrc]);
    }
  }
  let sectionsElements = resultDocument.querySelectorAll(".leaflet-accordion-item");
  let htmlContent = "";
  sectionsElements.forEach(section => {
    htmlContent = htmlContent + section.outerHTML;
  })

  validateLeafletFiles(htmlContent, leafletImages, leafletData.leafletImages);

  const contentContainer =  document.querySelector("#leaflet-content");
  contentContainer.parentNode.hidden = false;

  document.querySelector("#leaflet-content").innerHTML = htmlContent;
  let leafletLinks = document.querySelectorAll(".leaflet-link");
  xmlService.activateLeafletInnerLinks(leafletLinks);
  handleLeafletAccordion();
  document.querySelector(".loader-container").setAttribute('style', 'display:none');
  focusModalHeader();
  renderControlledSubstancesSymbol(leafletData);
};

const upperCaseProductDescriptionProductName = function (text , searchText) {
  let regex = new RegExp(searchText, "gi");
  return text.replace(regex, (match) => match.toUpperCase());
}

const renderControlledSubstancesSymbol = function(leafletData) {
  const controlSubstances = document.querySelectorAll(".controlled-substance");
  if(controlSubstances.length != 0){
    const descriptionName = setupDescriptionProductName(leafletData.productData.nameMedicinalProduct || leafletData.productData.description, leafletData.productData.inventedName || leafletData.productData.name);
    document.querySelector(".product-description").innerHTML = descriptionName;
    addControlledSymbolToProductName();
    addControlledSymbolToProductDescription();
    controlSubstances.forEach((controlSubstance) => {
      const img = document.createElement('img');
      img.src = 'images/controlled_substance.svg';
      img.alt = getTranslation("controlled_substance");
      img.className = 'controlled-substance-p '
      controlSubstance.insertBefore(img, controlSubstance.firstChild);
    })
  }
}

/**
 * If controlled substance detected wrappe it in a span
 * @param {string} description 
 * @param {string} title 
 * @returns 
 */
const setupDescriptionProductName = function (description, title) {
  let regex = new RegExp(`(?<=\\b)${title}(?=\\b)`, "gi");
  return description.replace(regex, (match) => `<span class="controlled-substance-description">${match.toUpperCase()}</span>`);
}

/**
 * Add the controlled substance symbol to the product description
 */
const addControlledSymbolToProductDescription = async function() {
  const controlSubstances = document.querySelectorAll(".controlled-substance-description");
  if(controlSubstances.length !=0){
    controlSubstances.forEach(async (controlSubstance) => {
      const img = document.createElement('img');
      img.src = 'images/controlled_substance_contrast.svg';
      img.alt = getTranslation("controlled_substance");
      img.className = 'controlled-substance-p '
      controlSubstance.insertBefore(img, controlSubstance.firstChild);
    })
  }
}

/**
 * Add the controlled substance symbol to the product name
 */
const addControlledSymbolToProductName = async function() {
  const prodName = document.getElementById("product-leaf-title");
  const img = document.createElement('img');
  img.src = 'images/controlled_substance_contrast.svg';
  img.alt = getTranslation("controlled_substance");
  img.className = 'controlled-substance-p '
  prodName.insertBefore(img, prodName.firstChild);
  prodName.classList.add("controlled-substance-header")
}


const renderProductInformation = function (result, product) {
    const modal = document.querySelector('#product-modal');

    modal.querySelector(".product-name").innerText = result.productData.inventedName || result.productData.name;
    const productDescriptionName = upperCaseProductDescriptionProductName(result.productData.nameMedicinalProduct || result.productData.description, result.productData.inventedName || result.productData.name);
    modal.querySelector(".product-description").innerText = productDescriptionName;
     /* document.querySelector(".leaflet-title-icon").classList.remove("hiddenElement");*/

     let list = undefined;
     let genericName = undefined;
     if(result.xmlContent) {
        let xmlService = new XMLDisplayService("#product-content");
        let resultDocument = xmlService.getHTMLFromXML(result.xmlContent);
        let resultXml = xmlService.parseXmlstring(result.xmlContent);

        list = xmlService.getElementsWithClass(resultXml, CLASSES.LIST_OF_EXCIPIENTS);
        genericName = xmlService.getElementsWithClass(resultXml, CLASSES.GENERIC_NAME);

        if(!!list && Array.isArray(list) && list.length > 0)
          list = list[0];

        if(!!genericName && Array.isArray(genericName) && genericName.length > 0)
          genericName = genericName[0];

        if(!genericName || !genericName?.textContent?.length)
          genericName = xmlService.getItemFromParsedHtml(resultDocument, TITLES.GENERIC_NAME);

        if(!list || !list?.textContent?.length)
          list = xmlService.getItemFromParsedHtml(resultDocument, TITLES.LIST_OF_EXCIPIENTS);
     }

    const container = modal.querySelector('.product-information-wrapper');
    const elements = container.querySelectorAll('[data-attr]');
    const excipientsContainer = modal.querySelector('#list-of-excipients');
    const genericNameContainer = modal.querySelector('#generic-name');
    excipientsContainer.innerHTML = '';
    genericNameContainer.textContent = '';
    excipientsContainer.closest('.data-wrapper').hidden = true;
    genericNameContainer.hidden = true;
    const productData = product || {};
    const batchData = product?.batchData || {};

    excipientsContainer.closest('.data-wrapper').hidden = false;

    if(list)  {
        excipientsContainer.innerHTML = list?.innerHTML;
    } else {
        excipientsContainer.innerHTML = ``;
    }

    genericNameContainer.hidden = false;
    if(genericName)
        genericNameContainer.textContent = genericName?.textContent;

    function parseDate(dateString, type) {
        if(!dateString)
            return "";
        if(type === 'expiryDate' || type === 'dateOfManufacturing') {
            const d = dateString.substring(4, 6);
            const m = dateString.substring(2, 4);
            const y = dateString.substring(0, 2);
            if(Number(d) === 0)
                return `${m}.20${y}`;
            return `${d}.${m}.20${y}`;
        }
        return new Date(dateString).toLocaleString('pt', {dateStyle: 'short'}).replace(/\//g, '.');
    }
    elements.forEach(element => {
        const attr = element.getAttribute('data-attr');
        const isBatch = element.hasAttribute('data-batch');
        let value = "";
        value = !isBatch ? productData?.[attr] : batchData?.[attr];
        if((attr?.toLowerCase()).includes('date'))
            value = parseDate(value, attr);
        element.innerHTML = value || "";
    })
    modal.querySelector('.product-information-wrapper').hidden = false;

    document.querySelector(".loader-container").setAttribute('style', 'display:none');
    focusModalHeader();
}

async function getFileContent(file, methodName = "readAsText") {
  let fileReader = new FileReader();
  return new Promise((resolve, reject) => {
    fileReader.onload = function () {
      return resolve(fileReader.result)
    }
    fileReader.onerror = function () {
      return reject()
    }
    fileReader[methodName](file);
  })
}

const bytesToBase64 = (bytes) => {
  const base64abc = [
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
    "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "/"
  ];

  let result = '', i, l = bytes.length;
  for (i = 2; i < l; i += 3) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[((bytes[i - 1] & 0x0F) << 2) | (bytes[i] >> 6)];
    result += base64abc[bytes[i] & 0x3F];
  }
  if (i === l + 1) { // 1 octet yet to write
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 0x03) << 4];
    result += "==";
  }
  if (i === l) { // 2 octets yet to write
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[(bytes[i - 1] & 0x0F) << 2];
    result += "=";
  }
  return result;
}

function getImageAsBase64(imageData) {
  if (typeof imageData === "string") {
    return imageData;
  }
  if (!(imageData instanceof Uint8Array)) {
    imageData = new Uint8Array(imageData);
  }
  let base64Image = bytesToBase64(imageData);
  base64Image = `data:image/png;base64, ${base64Image}`;
  return base64Image;
}

async function getFileContentAsBuffer(file) {
  return getFileContent(file, "readAsArrayBuffer");
}

async function getBase64FileContent(file, callback) {
  let content;
  try {
    content = await getFileContentAsBuffer(file);
    content = arrayBufferToBase64(content);
  } catch (e) {
    return callback(e);
  }
  return callback(undefined, content);
}

export {
  showExpired,
  showIncorrectDate,
  focusModalHeader,
  renderLeaflet,
  getFileContent,
  getFileContentAsBuffer,
  getBase64FileContent,
  getImageAsBase64,
  renderProductInformation,
  upperCaseProductDescriptionProductName
}
