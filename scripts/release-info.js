const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'version.js'),'utf8');
const match=source.match(/^self\.IPMAX_VERSION = '(\d+\.\d+\.\d+)';$/m);
if(!match)throw new Error('Invalid release version');
const tag='v'+match[1];
const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
const entries=changelog.split(/^## /m).slice(1);
if(!entries[0]?.startsWith(tag+' ('))throw new Error('Current release must be first in CHANGELOG.md');
if(process.argv.includes('--tag'))console.log(tag);
else{
  fs.writeFileSync(path.join(root,'release-notes.md'),'## '+entries[0].trim()+'\n');
  console.log('RELEASE_TAG='+tag);
}
