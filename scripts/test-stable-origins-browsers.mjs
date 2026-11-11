import {spawn} from 'node:child_process'

const args=process.argv.slice(2)
if(args.length>1||args.some(arg=>!/^--engine=(chromium|firefox|webkit)$/.test(arg)))throw Error('Usage : node scripts/test-stable-origins-browsers.mjs [--engine=chromium|firefox|webkit]')
const engines=args.length?[args[0].split('=')[1]]:['chromium','firefox','webkit']
let failed=false
for(const engine of engines){
 console.log('\nQualification des origines stables : '+engine)
 const child=spawn(process.execPath,['--import','./tests/register.mjs','--test','--test-name-pattern=Navigateur : (origine|deux jeux|refus du cookie|le conflit|fermer un second|deux premiers)', 'tests/game-runtime.browser.test.mjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,RUNTIME_BROWSER_ENGINE:engine}})
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
 if(code!==0)failed=true
}
process.exitCode=failed?1:0
