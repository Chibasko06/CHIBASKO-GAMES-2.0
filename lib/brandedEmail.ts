const site = 'https://chibaskogames.fr'
const legacyLogo = site + '/chibaskogames-logo.png'
export const emailLogo = site + '/chibaskogames-email-logo-v2.png'

export function automaticEmailSender(configured:string) {
  return configured.includes('<')?configured:`Chibasko Games <${configured}>`
}

const identities = {
  contact: {service:'Contact & Assistance',signature:'Équipe Chibasko Games — Contact & Assistance'},
  developers: {service:'Relations Développeurs',signature:'Équipe Chibasko Games — Relations Développeurs'},
  noreply: {service:'Notification automatique',signature:'Équipe Chibasko Games'},
} as const

type Identity = keyof typeof identities
type Email = {
  identity:Identity
  subject:string
  text:string
  action?:{url:URL;label:string}
  automatic?:'reply'|'no-reply'
  code?:string
  logoVersion?:1|2|3
}

const escape = (value:string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))

export function brandedEmail({identity,subject,text,action,automatic,code,logoVersion=3}:Email) {
  const {service,signature}=identities[identity]
  const note=automatic==='no-reply'?'Message automatique. Aucune réponse n’est attendue.':
    automatic==='reply'?'Message automatique. Vous pouvez répondre à cet e-mail.':''
  const paragraphs=text.replace(/\r\n?/g,'\n').split(/\n{2,}/).map(paragraph=>{
    if(code&&paragraph===code)return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#ecfeff" style="padding:16px;color:#155e75;font:bold 28px/36px 'Courier New',monospace;letter-spacing:5px">${escape(code)}</td></tr></table>`
    return `<p style="margin:0 0 16px;font-size:16px;line-height:25px;overflow-wrap:anywhere;word-wrap:break-word">${escape(paragraph).replaceAll('\n','<br>')}</p>`
  }).join('')
  const link=action?.url
  const colorScheme=logoVersion>=2?`<meta name="color-scheme" content="${logoVersion===3?'light only':'light'}"><meta name="supported-color-schemes" content="light">`:''
  const logo=logoVersion>=2
    ? `<img src="${emailLogo}" width="54" height="54" alt="Logo Chibasko Games" style="display:block;border:0;color:#ffffff;font-size:11px;${logoVersion===2?'background-color:#09090b;color-scheme:only light':'color-scheme:light only'}">`
    : `<img src="${legacyLogo}" width="48" height="48" alt="Logo Chibasko Games" style="display:block;border:0;color:#ffffff;font-size:11px">`
  const button=action&&link?.protocol==='https:'&&!link.username&&!link.password
    ? `<p style="margin:24px 0"><a href="${escape(link.href)}" style="display:inline-block;padding:13px 18px;background-color:#155e75;color:#ffffff;text-decoration:none;font-weight:bold">${escape(action.label)}</a></p>`
    : ''
  return {
    text:[text,signature,note,site].filter(Boolean).join('\n\n'),
    html:`<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${colorScheme}<title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#f1f3f7;color:#18181b;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f3f7"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border:1px solid #d4d4d8">
<tr><td bgcolor="#09090b" style="padding:20px 24px;color:#ffffff">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="64">${logoVersion===3?`<table role="presentation" width="54" cellpadding="0" cellspacing="0" border="0" style="color-scheme:light only"><tr><td bgcolor="#09090b" style="color-scheme:light only;background-color:#09090b;background-image:linear-gradient(#09090b,#09090b)">${logo}</td></tr></table>`:logo}</td>
<td valign="middle" style="color:#ffffff"><strong style="font-size:20px">Chibasko <span style="color:#67e8f9">Games</span></strong><br><span style="color:#e4e4e7;font-size:13px;line-height:20px">${escape(service)}</span></td>
</tr></table>
</td></tr>
<tr><td bgcolor="#ffffff" style="padding:24px;color:#18181b">
<h1 style="margin:0 0 20px;font-size:24px;line-height:31px;word-wrap:break-word">${escape(subject)}</h1>
${paragraphs}${button}
<p style="margin:24px 0 0;font-size:14px;line-height:22px;font-weight:bold">${escape(signature)}</p>
</td></tr>
<tr><td bgcolor="#fafafa" style="padding:16px 24px;color:#3f3f46;border-top:1px solid #e4e4e7;font-size:13px;line-height:21px">
${note?escape(note)+'<br>':''}<a href="${site}" style="color:#155e75;text-decoration:underline">chibaskogames.fr</a>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
  }
}
