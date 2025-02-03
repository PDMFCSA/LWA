# LWA
LWA Application code


### For developers

#### Translations

Translation files are kept in the `app/translations` folder.

under the folder `lang-codes/tracker` are json files used to track which strings are certified and which are not as we add new strings. Please take great care with these files, ensuring the order is always sequential

under `lang-codes/reports` are the md reports to keep jira updated

under `lang-code/*.json` can be found the json version of the report when generated


run `npm run translate -- <command> <...args>`

##### Available commands:
 - `key`: adds a new key to a translation file and translates that same key to all the others:<br>
`npm run translate -- key <source language> <key> <...string>`<br>
eg: `npm run translate -- key en leaflet_print Prints some things`
 - 
 - `codes`: generates a report (json or md) of the language keys in the provided languages:<br>
`npm run translate -- codes <json | md> [...langs]`<br>
eg: `npm run translate -- codes md en generates the md report for the en language`
Note: when no langs are provided, report are generated for all languages

 - `add`: adds a new translation file using a source to translate everything:<br>
`npm run translate -- add <source language> <template_language>`(not implemented)

- `delete`: deletes a key from all translation files<br>
`npm run translate -- delete <key>`<br>
eg: `npm run translate -- delete leaflet_print` (not implemented)


LIMITATIONS: This does not properly translate HTML, just plain strings