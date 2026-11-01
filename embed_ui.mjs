import {readFileSync,writeFileSync} from 'node:fs';
const fp=process.argv[2], html=readFileSync(process.argv[3],'utf8');
let w=readFileSync(fp,'utf8');
w=w.replace(/^const UI_DOCUMENT = .*;$/m,'const UI_DOCUMENT = '+JSON.stringify(html)+';');
writeFileSync(fp,w);