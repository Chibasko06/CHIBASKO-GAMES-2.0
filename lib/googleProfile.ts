export function googleAvatar(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048||!/^https:\/\/lh[0-9]+\.googleusercontent\.com(?:[/?]|$)/.test(value)||/[\s\\\u0000-\u001f]/.test(value))return null
 try{const url=new URL(value);return url.protocol==='https:'&&/^lh[0-9]+\.googleusercontent\.com$/.test(url.hostname)&&!url.username&&!url.password&&!url.port?url.href:null}catch{return null}
}
export function googleProfile(user:{app_metadata?:Record<string,unknown>;user_metadata?:Record<string,unknown>}){
 const google=user.app_metadata?.provider==='google',metadata=user.user_metadata??{}
 return {google,name:google?[metadata.full_name,metadata.name].find(value=>typeof value==='string'&&value.trim()) as string|undefined:undefined,avatar:google?(googleAvatar(metadata.avatar_url)??googleAvatar(metadata.picture)):null}
}
