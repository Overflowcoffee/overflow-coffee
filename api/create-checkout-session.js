// /api/create-checkout-session.js
// Vercel serverless function. Creates a Stripe Checkout Session for a single
// crowdfunding pledge (one-time payment) and returns the URL to redirect to.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

// Fixed reward tiers. Keeping amounts server-side (not trusting the client)
// is important — otherwise someone could tamper with the request and pay $1
// for the $2,500 tier.
const TIERS = {
  first_drop: { name: 'The First Drop', amount: 5000 },      // $50.00
  keep_it_flowing: { name: 'Keep It Flowing', amount: 10000 }, // $100.00
  full_cup: { name: 'Full Cup', amount: 25000 },             // $250.00
  fill_another_cup: { name: 'Fill Another Cup', amount: 50000 }, // $500.00
  the_overflow: { name: 'The Overflow', amount: 100000 },    // $1,000.00
};

// The top tier is "$2,500+" — an open-ended minimum, so it takes a
// custom amount from the client instead of a fixed one.
const CUSTOM_TIERS = {
  the_well: { name: 'The Well', min: 250000 }, // $2,500.00 minimum, in cents
  custom_amount: { name: 'Choose Your Own', min: 500 }, // $5.00 minimum, in cents
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tier, customAmount } = req.body || {};

    let lineItem;

    if (CUSTOM_TIERS[tier]) {
      const { name, min } = CUSTOM_TIERS[tier];
      const amount = Number(customAmount);
      if (!Number.isFinite(amount) || Math.round(amount * 100) < min) {
        return res.status(400).json({
          error: `This pledge must be at least $${(min / 100).toFixed(2)}`,
        });
      }
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: { name: `Overflow Coffee Pledge — ${name}` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      };
    } else if (TIERS[tier]) {
      const { name, amount } = TIERS[tier];
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: { name: `Overflow Coffee Pledge — ${name}` },
          unit_amount: amount,
        },
        quantity: 1,
      };
    } else {
      return res.status(400).json({ error: 'Unknown tier' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: `${origin}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/crowdfunding.html`,
      metadata: {
        tier: tier,
      },
      // Optional but recommended: collect an email even without an account
      customer_creation: 'if_required',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your checkout session.' });
  }
}
