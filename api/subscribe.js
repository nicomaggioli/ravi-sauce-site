// Drop-notification signup. Adds the email to a Resend Audience so Nico can
// broadcast a launch announcement from the Resend dashboard when the wallet drops.

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.RESEND_API_KEY || !AUDIENCE_ID) {
    return res.status(500).json({ error: 'Email signup not configured' });
  }

  const { email } = req.body || {};
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const { error } = await resend.contacts.create({
      email: email.toLowerCase().trim(),
      audienceId: AUDIENCE_ID,
      unsubscribed: false,
    });
    if (error) {
      // Resend treats "already exists" as an error; surface it as a normal "you're in" state
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('already') || error.statusCode === 409) {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      console.error('resend error', error);
      return res.status(500).json({ error: 'Could not subscribe' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe handler error', err);
    return res.status(500).json({ error: 'Could not subscribe' });
  }
}
