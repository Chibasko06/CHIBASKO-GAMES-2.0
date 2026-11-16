import {contactEmail,developersEmail} from './siteContacts'

export const adminMailSenders = {
  contact: {address:contactEmail, label:'Chibasko Games — Contact'},
  developers: {address:developersEmail, label:'Chibasko Games — Developers'},
} as const

export type MailSender = keyof typeof adminMailSenders
export type MailStatus = 'pending'|'accepted'|'rejected'|'unconfirmed'
export type MailEntry = {id:string;sender:MailSender;recipient:string;subject:string;created_at:string;status:MailStatus;provider_status:number|null}

export const mailStatusLabels:Record<MailStatus,string> = {
  pending:'Résultat en attente',
  accepted:'Accepté par Resend',
  rejected:'Refusé par Resend',
  unconfirmed:'Résultat non confirmé',
}
