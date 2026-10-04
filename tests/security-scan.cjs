const fs=require('fs');const path=require('path');
const key=(fs.readFileSync('.env.local','utf8').match(/^OPENAI_API_KEY\s*=\s*(.+)$/m)||[])[1]?.trim();
if(!key)throw new Error('Expected local OpenAI key');
let found=false,count=0;
function scan(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),st=fs.statSync(p);if(st.isDirectory())scan(p);else if(/\.(js|json|html|map)$/.test(name)){count++;if(fs.readFileSync(p,'utf8').includes(key))found=true;}}}
scan('.next/static');
if(found)throw new Error('Security verification failed: secret appears in browser build');
console.log('Security verification passed: OpenAI key absent from '+count+' browser build files.');
