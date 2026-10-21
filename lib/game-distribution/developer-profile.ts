export type DeveloperContact={firstName:string;lastName:string;contactEmail:string;publicName:string;website:string|null;otherContact:string|null}
export function developerContact(value:unknown):DeveloperContact|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null
 const p=value as Record<string,unknown>,keys=['firstName','lastName','contactEmail','publicName','website','otherContact']
 if(Object.keys(p).length!==keys.length||!keys.every(k=>Object.hasOwn(p,k)))return null
 for(const [key,max] of [['firstName',100],['lastName',100],['publicName',160]] as const)if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)return null
 if(typeof p.contactEmail!=='string'||p.contactEmail.length>254||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(p.contactEmail))return null
 if(p.website!==null){if(typeof p.website!=='string'||p.website.length>2048)return null;try{const url=new URL(p.website);if(url.protocol!=='https:'||url.username||url.password)return null}catch{return null}}
 if(p.otherContact!==null&&(typeof p.otherContact!=='string'||p.otherContact.length>500))return null
 return {firstName:String(p.firstName).trim(),lastName:String(p.lastName).trim(),contactEmail:p.contactEmail.trim(),publicName:String(p.publicName).trim(),website:p.website as string|null,otherContact:p.otherContact as string|null}
}
