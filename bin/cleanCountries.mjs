const {getList} = require("../../../gtin-resolver/lib/utils/Countries.js")
const fs = require('fs');
const path = require('path');
// import data from "../app/translations/en.js"

const root = process.cwd();

function getFilesFromDirectory(directoryPath) {
  try {
    const files = fs.readdirSync(directoryPath);
    return files;
  } catch (err) {
    console.error('Error reading directory:', err);
    return [];
  }
}

function getDataForLang(lang){
  let file = fs.readFileSync(path.join(root, "app", "translations", `${lang}`)).toString();

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

const directoryPath = path.join(root, "app", "translations");
const translationFiles = getFilesFromDirectory(directoryPath);

function removeKeysFromObject(obj, keysToRemove) {
  for (let key in obj) {
    if (keysToRemove.includes(key)) {
      delete obj[key];
    }
  }
}

function getKeysStartingWithPrefix(obj, prefix) {
  return Object.keys(obj)
    .filter(key => key.startsWith(prefix))
    .map(key => key); // Convert the filtered keys to lowercase
}

function saveFile(lang, data){
  const content = `const data = ${JSON.stringify(data, undefined, 2)}

export default data;`;
  fs.writeFileSync(path.join(root, "app", "translations", `${lang}`), content);
}


let endCountriesList = getList().map(country => country.code.toLowerCase());
let updatedEndCountriesList = endCountriesList.map(country => "country_" + country);
console.log("countries list: " + updatedEndCountriesList.length)

translationFiles.forEach(async (file) => {

  let data = getDataForLang(file);

  let tranlationsCountryList = getKeysStartingWithPrefix(data,"country_")
  console.log("translation country list : " +tranlationsCountryList.length)

  const removecountries = tranlationsCountryList.filter(item => !updatedEndCountriesList.includes(item));

  console.log(removecountries.length);

  const missedcountries = updatedEndCountriesList.filter(item => !tranlationsCountryList.includes(item));
  console.log(missedcountries);

  const finalData = removeKeysFromObject(data, removecountries);

  let newTranlation = getKeysStartingWithPrefix(data,"country_")
  console.log("new translation country list : " +newTranlation.length)

  saveFile(file,data);

})







