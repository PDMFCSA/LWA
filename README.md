# LWA
LWA Application code


### For developers

#### Translations

run `npm run translations -- <command> <...args>`

##### Available commands:
 - `key`: adds a new key to a translation file and translates that same key to all the others:<br>
`npm run translations -- key <source language> <key> <...string>`<br>
eg: `npm run translations -- key en leaflet_print Prints some things`

 - `add`: adds a new translation file using a source to translate everything:<br>
`npm run translations -- add <source language> <template_language>`(not implemented)

- `delete`: deletes a key from all translation files<br>
`npm run translations -- delete <key>`<br>
eg: `npm run translations -- delete leaflet_print` (not implemented)


LIMITATIONS: This does not properly translate HTML, just plain strings