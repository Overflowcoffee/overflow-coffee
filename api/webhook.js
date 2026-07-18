 // /api/webhook.js
// Vercel serverless function. Receives events from Stripe (not from your
// frontend) to confirm a payment actually succeeded. This is the source of
// truth — never mark someone as "a backer" just because the browser
// redirected to your success page, since that can be faked or interrupted.

import Stripe from 'stripe';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Stripe needs the raw, unparsed request body to verify the signature.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tier = session.metadata?.tier || 'unknown';
      const amount = session.amount_total; // in cents
      const email = session.customer_details?.email;

      // TODO: this is where you'd record the pledge somewhere durable, e.g.:
      //   - increment "amount raised" / "backer count" in a small database
      //     or KV store (Vercel KV, Supabase, Airtable, Google Sheet, etc.)
      //   - send yourself a notification (email/Slack) of a new backer
      //   - send the backer a confirmation email with reward details
      // For now this just logs it so you can see events arriving.
      console.log(`New pledge: ${tier}, $${(amount / 100).toFixed(2)}, ${email}`);
      break;
    }
    default:
      // Ignore other event types for now.
      break;
  }

  return res.status(200).json({ received: true });
}
