import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const output=process.argv[2];
if(!output)throw new Error('Usage: node export-preview.mjs /outside-repo/tile-preview.html');
const destination=resolve(output);
if(destination.startsWith(resolve(root,'../../../..')+'/'))throw new Error('Generated previews belong outside the repository');
let html=await readFile(resolve(root,'index.html'),'utf8');
const css=await readFile(resolve(root,'styles.css'),'utf8');
html=html.replace('<link rel="stylesheet" href="styles.css">',`<style>${css}</style>`);
for(const name of ['../ui-v2/sample-data.js','demo.js']){
 const source=(await readFile(resolve(root,name),'utf8')).replaceAll('</script','<\\/script');
 html=html.replace(`<script src="${name}"></script>`,`<script>${source}</script>`);
}
await writeFile(destination,html,{flag:'wx'});
console.log(destination);
