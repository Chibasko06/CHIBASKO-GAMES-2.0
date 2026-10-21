import schema from './game-distribution/chibasko.schema.v1.json' with {type:'json'}
import {validateManifest} from './game-distribution/manifest'
import {UPLOAD_POLICY} from './game-distribution/uploads/policy'

export const sdkInstallCommand='npm install @chibaskogames/sdk@0.4.0'
// Constants and required sections follow the validator's canonical schema.
const example={schemaVersion:schema.properties.schemaVersion.const,gameId:'11111111-1111-4111-8111-111111111111',version:'1.0.0',integrationVersion:schema.properties.integrationVersion.const,
 capabilities:{local:{players:{min:schema.$defs.players.properties.min.minimum,max:schema.$defs.players.properties.min.minimum}}},client:{entrypoints:{local:'local/index.html'}}}
export const manifestExample=validateManifest(example,{gameId:example.gameId,version:example.version})
export const manifestCode=JSON.stringify(manifestExample,null,2)
export const archiveLimitBytes=UPLOAD_POLICY.maxArchiveBytes
export const lifecycleCode=`import { connectPlatform } from '@chibaskogames/sdk/client';

const platform = await connectPlatform();
const status = document.querySelector('#status');
let running = false;
const offStart = platform.onStart(context => {
  running = true;
  if (status) status.textContent = context.execution === 'local'
    ? 'Prêt à jouer en local' : 'Connexion gameplay à préparer';
});
const offStop = platform.onStop(() => { running = false; });
document.querySelector('#quit')?.addEventListener('click', () => platform.leave());
window.addEventListener('pagehide', () => {
  running = false;
  offStart(); offStop(); platform.close();
}, { once: true });
// Les ressources et abonnements sont prêts avant READY.
platform.ready();
// La boucle du jeu consulte running pour suspendre sa simulation.`
export const audioCode=`const applyAudio = ({ muted, volume }) => {
  document.querySelectorAll('audio, video').forEach(media => {
    if (media instanceof HTMLMediaElement) {
      media.muted = muted;
      media.volume = volume;
    }
  });
};
applyAudio(platform.audio.getState());
const offAudio = platform.audio.onChange(applyAudio);
window.addEventListener('pagehide', offAudio, { once: true });`
export const resizeCode=`const canvas = document.querySelector('canvas');
function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => window.removeEventListener('resize', resize), { once: true });
resize();`
