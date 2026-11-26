import AuthRequired from '../AuthRequired'
export const multiplayerButton='rounded-full border border-cyan-700 px-5 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50'
export function AuthInvitation({next}:{next:string}){
 return <AuthRequired next={next} message="Connectez-vous pour rejoindre ou créer une partie."/>
}
