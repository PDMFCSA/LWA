const path = require('path');
const fs = require('fs');
const root = process.cwd();
const {translate} = require("google-translate-api-x");

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

async function addKey(lang, key, str){
  const languages = getAvailableLanguages();
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
  json[key] = str;

  function saveFile(l, j){
    const content = `const data = ${JSON.stringify(j, undefined, 2)}

export default data;`;
    fs.writeFileSync(path.join(root, "app", "translations", `${l.toLowerCase()}.js`), content);
  }

  saveFile(lang, json);

  for (const otherLang of languages){
    if (otherLang === lang){
      console.log(`No need to translate ${key} for ${otherLang}`)
      continue;
    }

    let translated;
    try {
      translated = await translateString(lang, otherLang, str);
    } catch (e) {
      translated = `${str} - MISSING TRANSLATION`
    }

    console.log(`translated \"${str}\" from ${lang} to ${otherLang}: ${translated}`);
    file = fs.readFileSync(path.join(root, "app", "translations", `${otherLang.toLowerCase()}.js`)).toString();
    json = parseFile(file);
    json[key] = translated;
    saveFile(otherLang, json);
  }
}

switch (command) {
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