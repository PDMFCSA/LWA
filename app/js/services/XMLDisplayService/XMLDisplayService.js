import {defaultXslContent, acodisXslContent} from "./leafletXSL.js"
import CustomError from "../../utils/CustomError.js";
import constants from "../../../../constants.js";
import {escapeHTML} from "../../../../utils.js"

class XMLDisplayService {
  constructor(containerIdSelector) {
    this.containerIdSelector = containerIdSelector;
  }

  activateLeafletInnerLinks = function (leafletLinks) {
    for (let link of leafletLinks) {
      let linkUrl = link.getAttribute("linkUrl");
      if (linkUrl.slice(0, 1) === "#") {
        link.addEventListener("click", () => {
          document.getElementById(linkUrl.slice(1)).scrollIntoView();
        });
      }
    }
  }

  parseXmlstring(xmlString, text){
    let parser = new DOMParser();
    return parser.parseFromString(xmlString, 'application/xml');
  }

  getItemFromParsedHtml(xmlContent, text){
    const sections = xmlContent.querySelectorAll(".leaflet-accordion-item");
    for(let section of sections) {
        const title = section.querySelector('h2')?.textContent;
        if(title) {
            const titleString = title.trimEnd().replace(/\s+/g, ' ').replace(/\s/g, '_').toLowerCase();
            if(titleString.includes(text)) {
                const element = section.querySelector('.leaflet-accordion-item-content');
                if(element?.innerHTML) {
                    return element;
                    break;
                }
            } 
        }     
    }

    for(let section of sections){
      const pList = section.querySelectorAll('p');
      const div = document.createElement('div');

      let foundContent = false;
      let firstPass = true;

      for(let p of pList){
        const textContent = p.textContent.trimEnd().replace(/\s+/g, ' ').replace(/\s/g, '_').toLowerCase();

        if(textContent.includes(text)) {
          foundContent = true;
        }

        if(!firstPass && foundContent)
          div.appendChild(p)

        if(!!firstPass && foundContent)
          firstPass = false;
      }

      if(foundContent)
        return div;

    }
  }

  getElementsWithClass(xmlDoc, xmlContent, className){
    const itemsWithClass = Array.from(xmlDoc.querySelectorAll('[class]'));

    return itemsWithClass.reduce((acc, el) => {
      const clazz = el.getAttribute('class');

      if(!clazz)
        return acc;

      if(clazz.toLowerCase() === className)
        acc.push(el);

      return acc;
    }, []);

  }

  getHTMLFromXML = function (xmlContent) {
    let xsltProcessor = new XSLTProcessor();
    xsltProcessor.setParameter(null, "resources_path", "");
    let parser = new DOMParser();

    let xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    if (!xmlDoc || !xmlDoc.children) {
      console.log("Error on parsing xml file. Please check xml file format and content");
      throw new CustomError(constants.errorCodes.xml_parse_error, "Error on parsing xml file");
    }
    let xslContent;
    switch (xmlDoc.children[0].tagName) {
      case "root":
        let rootInnerHtml = xmlDoc.children[0].innerHTML;
        let newXmlDoc = document.implementation.createDocument(null, "document");
        newXmlDoc.children[0].innerHTML = rootInnerHtml;
        xmlDoc = newXmlDoc;
        xslContent = acodisXslContent;
        break
      case "document":
        if (xmlDoc.documentElement.hasAttribute("type") && xmlDoc.documentElement.getAttribute("type") === "pharmaledger-1.0") {
          xslContent = acodisXslContent;
          break;
        }
        xslContent = defaultXslContent;
        break
    }

    if (!xslContent) {
      console.log("Unrecognized leaflet format");
      throw new CustomError(constants.errorCodes.xsl_parse_error, "Unrecognized leaflet format");
    }

    let xslDoc = parser.parseFromString(xslContent, "text/xml");

    xsltProcessor.importStylesheet(xslDoc);
    const ownerDocument = document.implementation.createDocument("", "epi", null);
    let resultDocument = xsltProcessor.transformToFragment(xmlDoc, ownerDocument);
    return resultDocument;
  }

  searchInHtml = function (searchQuery) {
    let domElement = document.querySelector(this.containerIdSelector);
    let cleanHtml = domElement.innerHTML.replace(/(<mark>|<\/mark>)/gim, '');
    domElement.innerHTML = escapeHTML(cleanHtml);
    if (searchQuery === "") {
      return
    }
    const regex = new RegExp(searchQuery, 'gi');
    try {
      let domNode = domElement.parentElement.ownerDocument.evaluate(`.//*[text()[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),"${searchQuery}")]]`, domElement).iterateNext();
      domNode.closest("leaflet-section").open();
      let text = domNode.innerHTML;
      const newText = text.replace(regex, '<mark>$&</mark>');
      domNode.innerHTML = newText;
      domNode.scrollIntoView({block: "nearest"});
      window.scroll(0, domNode.getBoundingClientRect().height);
    } catch (e) {
      // not found should not throw error just skip and wait for new input
    }
  }
}

export default XMLDisplayService;
