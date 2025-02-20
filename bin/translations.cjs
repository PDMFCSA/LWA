const path = require('path');
const fs = require('fs');
const root = process.cwd();
const {translate} = require("google-translate-api-x");
const {mdToPdf} = require("md-to-pdf");
const converter = require("json-2-csv")

const [command, ...args] = process.argv.slice(2);

let availableTranslations;

function getAvailableLanguages(){
  if (availableTranslations)
    return availableTranslations;
  availableTranslations = fs.readdirSync(path.join(root, "app", "translations"))
    .filter(file => file.match(/\w{2,3}(-\w{2,})?\.js/g))
    .map(file => {
      const regexp = /(\w{2})(-\w{2,})?\.js/g
      const match = regexp.exec(file);
      if (!match) throw new Error(`Invalid file name: ${file}`);
      return `${match[1]}${match[2] ? `${match[2].toUpperCase()}` : ""}`;
    })
  return availableTranslations;
}

async function translateString(fromLang, toLang, str, force = false){
  try {
    const opts = {from: fromLang, to: toLang}
    if (force)
      opts.forceTo = true;
    const result = await translate(str, opts)
    return result.text;
  } catch(e) {
    if (e.message.includes("unsupported, bypass this with setting forceTo to true if you're certain the iso is correct")){
      if (force){
        console.warn(`No translation found for \"${str}\" from ${fromLang} to ${toLang}`)
      } else {
        return translateString(fromLang, toLang, str, true);
      }
    }
    throw new Error(`Failed to translate "${str}" from ${fromLang} to ${toLang}: ${e.message}`);
  }
}

function getDataForLang(lang){
  let file = fs.readFileSync(path.join(root, "app", "translations", `${lang.toLowerCase()}.js`)).toString();

  function parseFile(f){
    const regexp = /const data = (.*)export default data;/gms
    const match = regexp.exec(f);
    if (!match)
      throw new Error(`Invalid file content ${key}.js`);
    try {
      return eval("exports = " + match[1]);
    } catch (e){
      throw new Error(`Unparsable file content ${key}.js`);
    }
  }

  let json = parseFile(file);
  return json;
}

function saveFile(lang, data){
  const content = `const data = ${JSON.stringify(data, undefined, 2)}

export default data;`;
  fs.writeFileSync(path.join(root, "app", "translations", `${lang.toLowerCase()}.js`), content);
}

async function addKey(lang, key, str){
  const certified = getCertified();
  const certifiedKeys = Object.keys(certified);
  if (certifiedKeys.includes(key))
    throw new Error(`Trying to modify a certified translation ${key}`);

  const nonCertified = getCertified(false);
  const nonCertifiedKeys = Object.keys(nonCertified);


  const languages = getAvailableLanguages();
  let json = getDataForLang(lang);
  json[key] = str;

  saveFile(lang, json);
  if (!nonCertifiedKeys.includes(key)){
    let latest = getLatest(certified, nonCertified);
    latest = incrementLatest(latest, nonCertified, key)
    console.log(`Added new key ${key} with code ${latest}`);
    updateCertificationTracker(nonCertified, false);
  }

  for (const otherLang of languages){
    if (otherLang === lang){
      console.log(`No need to translate ${key} for ${otherLang}`)
      continue;
    }

    let translated;
    try {
      translated = await translateString(lang, otherLang, str);
    } catch (e) {
        console.error(e);
      translated = `${str} - MISSING TRANSLATION`
    }

    console.log(`translated \"${str}\" from ${lang} to ${otherLang}: ${translated}`);
    json = getDataForLang(otherLang)
    json[key] = translated;
    saveFile(otherLang, json);
  }
}

function getDataForLang(lang){
  let file = fs.readFileSync(path.join(root, "app", "translations", `${lang.toLowerCase()}.js`)).toString();

  function parseFile(f){
    const regexp = /const data = (.*)export default data;/gms
    const match = regexp.exec(f);
    if (!match)
      throw new Error(`Invalid file content ${key}.js`);
    try {
      return eval("exports = " + match[1]);
    } catch (e){
      throw new Error(`Unparsable file content ${key}.js`);
    }
  }

  let json = parseFile(file);
  return json;
}

function getCertified(certified = true){
  let file = fs.readFileSync(path.join(root, "lang-codes", "tracker", `${certified ? "" : "non-"}certified.json`)).toString();
  try {
    return JSON.parse(file);
  } catch (e) {
    throw new Error(`Could not read certified strings file: ${e}`)
  }
}

function updateCertificationTracker(data,  certified = false){
  try {
    let file = fs.writeFileSync(path.join(root, "lang-codes", "tracker", `${certified ? "" : "non-"}certified.json`),  JSON.stringify(data, undefined, 2));
  } catch (e) {
    throw new Error(`Could not update non certified strings file: ${e}`)
  }
}

function getLatest(certified, nonCertified){
  const certifiedKeys = Object.keys(certified || {});
  const nonCertifiedKeys = Object.keys(nonCertified || {});

  if (!nonCertifiedKeys.length)
    return certified[certifiedKeys[certifiedKeys.length -1]];
  return nonCertified[nonCertifiedKeys[nonCertifiedKeys.length -1]];
}

function incrementLatest(latest, nonCertified, key){
  latest++;
  nonCertified[key] = latest
  return latest;
}

function getCodeJson(lang, certified, nonCertified){
  const data = getDataForLang(lang);
  let latest, code
  return Object.entries(data).map(([key, value], i) => {
    latest = getLatest(certified, nonCertified)
    code = certified[key] || nonCertified[key] || incrementLatest(latest, nonCertified, key)
    return ({
      code: code,
      text: value,
      status: certified[key] ? "ok" : "",
      key: key
    })
  })
}

function toText(json, lang){

  const text = []

  function pushHeader(txt) {
    text.push({h3: txt})
  }

  function pushParagraph(txt) {
    text.push({p: txt});
  }

  function pushTable(){
    text.push({table: {
        headers: ["Key", "Text", "Status", "Code"],
        rows: json.reduce((accum, val) => {
          accum.push([val.key, val.text
            .replaceAll("\n", "<br/>")
            // .replaceAll("\n", "&#10;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;"), val.status, val.code])
          return accum;
        }, [])
      }
    })
  }

  pushHeader(`${lang} translations`);
  pushParagraph("To ease the translation the Code refers where it is used on our app screen, see section wireframing")
  pushTable()


  const json2md = require("json2md");

  return json2md(text);
}

/**
 *
 * @param {{}[]} json
 * @param {string} lang
 * @param {"json" | "text"} [format]
 */
function saveCodeFile(json, lang, format){
  fs.writeFileSync(path.join(root, `lang-codes${format === "json" ? "" : "/reports"}`, `${lang.toLowerCase()}.${format === "json" ? "json" : "md"}`), format === "json" ? JSON.stringify(json, undefined, 2) : toText(json, lang))
}

/**
 * @description converts a lang report to pdf
 * @param {string} lang
 * @returns {Promise<void>}
 */
async function saveToPdf(lang){
  const p = path.join(root, "lang-codes", "reports", `${lang.toLowerCase()}.md`);
  const pdf = await mdToPdf({path: p})
  if (!pdf)
    throw new Error(`Failed to output lang report ${lang} to pdf`);
  fs.writeFileSync(p.replace(/\.md$/gm, ".pdf"), pdf.content);
}


/**
 * @description converts a lang report to csv
 * @param {string} lang
 * @param {{code: string, text: string, key: string , status: string }[]} result
 */
function saveToCsv(lang, result){
  const csv = converter.json2csv(result);
  const p = path.join(root, "lang-codes", "reports", `${lang.toLowerCase()}.csv`);
  fs.writeFileSync(p, csv);
}

/**
 *
 * @param {string[]} [langs]
 * @param {"json" | "text" | "pdf"} [format]
 */
async function  generateCodeSheet(langs, format = "json"){
  langs = langs && langs.length ? langs : getAvailableLanguages()
  const certified = getCertified();
  const nonCertified = getCertified(false);
  for (const lang of langs) {
    const result = getCodeJson(lang, certified, nonCertified)
    result.sort((a, b) => {
      return a.code - b.code
    })
    saveCodeFile(result, lang, format === "pdf" ? "text" : format);
    updateCertificationTracker(nonCertified,  false);
    if (format === "pdf"){
      saveToCsv(lang, result)
      await saveToPdf(lang);
    }
  }
}

switch (command) {
  case "codes":
    const format = args.shift()
    if (!["json", "md", "pdf"].includes(format))
      throw new Error(`Invalid format provided. expects 'json', 'md' or 'pdf'`)
    generateCodeSheet(args, format).then(() => {
      console.log("finished")
    })
    break
  // TODO: handle html
  case 'key':
    const lang = args.shift();
    if (!getAvailableLanguages().includes(lang))
      throw new Error(`Language ${lang} is not supported`);
    const key = args.shift();
    if (!key)
      throw new Error(`no key specified`);
    const str = args.join(' ').trim();
    if (!str)
      throw new Error(`Empty string provided for key ${lang}`);
    addKey(lang, key, str)
      .then(() => {
        console.log("added")
      })
      .catch(e => {
        throw e
      })
    break;
  case "add":
    // TODO add new language from template
    break
  default:
    throw new Error(`Invalid command: ${command}`);
}