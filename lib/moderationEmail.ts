import {reportCategories,type ReportKind} from './moderation'

export function reportReason(kind:ReportKind,category:string){
 return (reportCategories[kind] as Record<string,string>)[category]??'Autre'
}
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))

// Même palette et structure tabulaire que les messages de réinitialisation.
export function moderationEmailHtml(title:string,text:string,site:URL,adminUrl?:URL){
 return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;background:#f1f3f7;color:#202838;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e1e5ed;border-radius:16px"><tr><td style="padding:24px;background:#111827;border-radius:16px 16px 0 0"><img src="${escape(new URL('/chibaskogames-logo.png',site).href)}" width="64" height="64" alt="" style="display:block;margin-bottom:12px"><span style="font-size:22px;font-weight:bold;color:#fff">Chibasko <span style="color:#67e8f9">Games</span></span></td></tr><tr><td style="padding:24px"><h1 style="font-size:24px;line-height:32px;color:#111827">${escape(title)}</h1>${text.split('\n\n').map(paragraph=>`<p style="font-size:16px;line-height:25px;overflow-wrap:anywhere">${escape(paragraph).replaceAll('\n','<br>')}</p>`).join('')}${adminUrl?`<p style="margin-top:28px"><a href="${escape(adminUrl.href)}" style="display:inline-block;padding:14px 20px;background:#155e75;color:#fff;border-radius:8px;font-weight:bold;text-decoration:none">Examiner le dossier</a></p>`:''}<p style="margin-top:28px;border-top:1px solid #e1e5ed;padding-top:16px;font-size:12px;color:#64748b">Chibasko Games · Suivi des signalements</p></td></tr></table></td></tr></table></body></html>`
}
