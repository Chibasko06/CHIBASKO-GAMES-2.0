import { NextRequest, NextResponse } from 'next/server'

type ContactPayload = {
  firstName?: string
  lastName?: string
  email?: string
  message?: string
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as ContactPayload | null

  const firstName = body?.firstName?.trim() || ''
  const lastName = body?.lastName?.trim() || ''
  const email = body?.email?.trim() || ''
  const message = body?.message?.trim() || ''

  if (!firstName || !lastName || !email || !message) {
    return NextResponse.json({ error: 'Tous les champs sont obligatoires.' }, { status: 400 })
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Adresse email invalide.' }, { status: 400 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  const toEmail = process.env.CONTACT_TO_EMAIL || 'chibasko06@gmail.com'
  const fromEmail = process.env.CONTACT_FROM_EMAIL

  if (!resendApiKey || !fromEmail) {
    return NextResponse.json(
      {
        error: 'Le service mail n est pas encore configure sur le serveur.',
      },
      { status: 500 }
    )
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      reply_to: email,
      subject: `Contact Chibasko Games - ${firstName} ${lastName}`,
      text: [
        `Nom: ${lastName}`,
        `Prenom: ${firstName}`,
        `Email: ${email}`,
        '',
        'Message:',
        message,
      ].join('\n'),
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return NextResponse.json(
      {
        error: payload?.message || 'Impossible d envoyer le message pour le moment.',
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
